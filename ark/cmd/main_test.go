/* Copyright 2025. McKinsey & Company */

package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	yamlutil "k8s.io/apimachinery/pkg/util/yaml"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"sigs.k8s.io/controller-runtime/pkg/log/zap"

	"mckinsey.com/ark/internal/apiserver"
	"mckinsey.com/ark/internal/inlinetools"
	"mckinsey.com/ark/internal/inlinetools/activator"
)

func TestValidateRole(t *testing.T) {
	cases := []struct {
		role    string
		wantErr string
	}{
		{"apiserver", ""},
		{"controller", ""},
		{"postgres-cleanup", ""},
		{"inline-activator", ""},
		{"", "is required"},
		{"combined", "is invalid"},
		{"APISERVER", "is invalid"},
		{"api-server", "is invalid"},
	}
	for _, c := range cases {
		err := validateRole(c.role)
		if c.wantErr == "" {
			if err != nil {
				t.Errorf("validateRole(%q) = %v, want nil", c.role, err)
			}
			continue
		}
		if err == nil {
			t.Errorf("validateRole(%q) = nil, want error containing %q", c.role, c.wantErr)
			continue
		}
		if !strings.Contains(err.Error(), c.wantErr) {
			t.Errorf("validateRole(%q) error = %q, want substring %q", c.role, err.Error(), c.wantErr)
		}
	}
}

func TestInlineActivatorRequiresExplicitScopeBeforeConnecting(t *testing.T) {
	for _, scope := range [][2]string{{"", ""}, {"ark-system", ""}, {"", "tenant"}, {"ark-system", " , "}} {
		t.Setenv("ARK_INLINE_ACTIVATOR_NAMESPACE", scope[0])
		t.Setenv("ARK_WATCH_NAMESPACES", scope[1])
		require.ErrorContains(t, runInlineActivator(context.Background()), "non-empty ARK_WATCH_NAMESPACES")
	}
}

func TestInlineActivatorWaitsForInflightHTTPDuringShutdown(t *testing.T) {
	t.Setenv(inlinetools.EnabledEnvVar, "false")
	a, err := activator.New(context.Background(), fake.NewClientBuilder().WithScheme(scheme).Build(), "ark-system", []string{"ark-system"})
	require.NoError(t, err)
	started, release := make(chan struct{}), make(chan struct{})
	a.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(started)
		select {
		case <-release:
		case <-r.Context().Done():
		}
		w.WriteHeader(http.StatusOK)
	})
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	defer close(release)
	done := make(chan error, 1)
	go func() { done <- serveInlineActivator(ctx, listener, a) }()
	address := "http://" + listener.Addr().String()
	for _, path := range []string{"/readyz", "/healthz"} {
		response, err := http.Get(address + path)
		require.NoError(t, err)
		require.NoError(t, response.Body.Close())
		assert.Equal(t, http.StatusOK, response.StatusCode)
	}
	callDone := make(chan error, 1)
	go func() {
		response, err := http.Get(address + "/call")
		if err == nil {
			_ = response.Body.Close()
		}
		callDone <- err
	}()
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("HTTP call did not start")
	}
	cancel()
	select {
	case err := <-done:
		t.Fatalf("server exited before draining the call: %v", err)
	case <-time.After(50 * time.Millisecond):
	}
	require.Eventually(t, func() bool {
		conn, err := net.DialTimeout("tcp", listener.Addr().String(), 100*time.Millisecond)
		if err != nil {
			return true
		}
		_ = conn.Close()
		return false
	}, time.Second, 10*time.Millisecond, "shutdown must stop accepting new connections")
	release <- struct{}{}
	select {
	case err := <-callDone:
		require.NoError(t, err)
	case <-time.After(time.Second):
		t.Fatal("HTTP call did not finish")
	}
	select {
	case err := <-done:
		require.NoError(t, err)
	case <-time.After(2 * time.Second):
		t.Fatal("server did not finish shutdown")
	}
}

func TestInlineActivatorReturnsListenerFailure(t *testing.T) {
	t.Setenv(inlinetools.EnabledEnvVar, "false")
	a, err := activator.New(context.Background(), fake.NewClientBuilder().WithScheme(scheme).Build(), "ark-system", []string{"ark-system"})
	require.NoError(t, err)
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	require.NoError(t, listener.Close())
	require.ErrorIs(t, serveInlineActivator(context.Background(), listener, a), net.ErrClosed)
}

func renderInlineActivator(t *testing.T, values ...string) ([]unstructured.Unstructured, error) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	args := []string{"template", "ark", "../dist/chart", "--namespace", "ark-system", "--set", "crd.enable=false"}
	output, err := exec.CommandContext(ctx, "helm", append(args, values...)...).CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("helm template: %w: %s", err, output)
	}
	decoder := yamlutil.NewYAMLOrJSONDecoder(strings.NewReader(string(output)), 4096)
	var objects []unstructured.Unstructured
	for {
		var object unstructured.Unstructured
		err := decoder.Decode(&object)
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		objects = append(objects, object)
	}
	return objects, nil
}

func TestInlineActivatorChartIsScopedRestrictedAndIndependentOfControllerReplicas(t *testing.T) {
	for _, backend := range []string{"etcd", "postgresql"} {
		for _, enabled := range []string{"true", "false"} {
			for _, replicas := range []string{"1", "3"} {
				t.Run(backend+"/"+enabled+"/"+replicas, func(t *testing.T) {
					objects, err := renderInlineActivator(t, "--set", "storage.backend="+backend, "--set", "inlineTools.activator.enabled=true", "--set", "inlineTools.enabled="+enabled,
						"--set-json", `controllerManager.watchNamespaces=["ark-system","tenant"]`, "--set", "controllerManager.replicas="+replicas)
					require.NoError(t, err)
					counts := map[string]int{}
					for _, object := range objects {
						if object.GetKind() == "ClusterRoleBinding" {
							var binding rbacv1.ClusterRoleBinding
							require.NoError(t, runtime.DefaultUnstructuredConverter.FromUnstructured(object.Object, &binding))
							for _, subject := range binding.Subjects {
								assert.NotEqual(t, inlinetools.ActivatorName, subject.Name)
							}
						}
						if object.GetKind() == "Deployment" && object.GetName() == "ark-controller" {
							var deployment appsv1.Deployment
							require.NoError(t, runtime.DefaultUnstructuredConverter.FromUnstructured(object.Object, &deployment))
							assert.Equal(t, replicas, fmt.Sprint(*deployment.Spec.Replicas))
							assert.Contains(t, deployment.Spec.Template.Spec.Containers[0].Args, "--role=controller")
							assert.NotContains(t, deployment.Spec.Template.Spec.Containers[0].Args, "--role=inline-activator")
						}
						if object.GetName() != inlinetools.ActivatorName {
							continue
						}
						counts[object.GetKind()]++
						switch object.GetKind() {
						case "Deployment":
							var deployment appsv1.Deployment
							require.NoError(t, runtime.DefaultUnstructuredConverter.FromUnstructured(object.Object, &deployment))
							require.NotNil(t, deployment.Spec.Replicas)
							assert.EqualValues(t, 1, *deployment.Spec.Replicas)
							assert.Equal(t, appsv1.RecreateDeploymentStrategyType, deployment.Spec.Strategy.Type)
							assert.Nil(t, deployment.Spec.Strategy.RollingUpdate)
							pod := deployment.Spec.Template.Spec
							require.NotNil(t, pod.TerminationGracePeriodSeconds)
							assert.Greater(t, *pod.TerminationGracePeriodSeconds, int64(90))
							assert.Equal(t, deployment.Spec.Selector.MatchLabels, map[string]string{
								"app.kubernetes.io/name": inlinetools.ActivatorName, "app.kubernetes.io/instance": "ark",
							})
							for key, value := range deployment.Spec.Selector.MatchLabels {
								assert.Equal(t, value, deployment.Spec.Template.Labels[key])
							}
							assert.Equal(t, inlinetools.ActivatorName, pod.ServiceAccountName)
							require.True(t, *pod.SecurityContext.RunAsNonRoot)
							assert.Equal(t, corev1.SeccompProfileTypeRuntimeDefault, pod.SecurityContext.SeccompProfile.Type)
							require.Len(t, pod.Containers, 1)
							container := pod.Containers[0]
							assert.Equal(t, []string{"--role=inline-activator"}, container.Args)
							assert.True(t, *container.SecurityContext.ReadOnlyRootFilesystem)
							assert.False(t, *container.SecurityContext.AllowPrivilegeEscalation)
							assert.Equal(t, []corev1.Capability{"ALL"}, container.SecurityContext.Capabilities.Drop)
							assert.Empty(t, container.EnvFrom, "do not inherit controller credential sources")
							env := map[string]string{}
							for _, variable := range container.Env {
								env[variable.Name] = variable.Value
							}
							assert.Equal(t, enabled, env[inlinetools.EnabledEnvVar])
							assert.Equal(t, "ark-system,tenant", env["ARK_WATCH_NAMESPACES"])
							assert.Equal(t, "ark-system", env["ARK_INLINE_ACTIVATOR_NAMESPACE"])
							assert.Equal(t, "/readyz", container.ReadinessProbe.HTTPGet.Path)
							assert.Equal(t, "/healthz", container.LivenessProbe.HTTPGet.Path)
							assert.EqualValues(t, 60, container.LivenessProbe.InitialDelaySeconds)
						case "Service":
							var service corev1.Service
							require.NoError(t, runtime.DefaultUnstructuredConverter.FromUnstructured(object.Object, &service))
							assert.Equal(t, corev1.ServiceTypeClusterIP, service.Spec.Type)
							assert.Empty(t, service.Spec.ExternalIPs)
							require.Len(t, service.Spec.Ports, 1)
							assert.EqualValues(t, inlinetools.ActivatorPort, service.Spec.Ports[0].Port)
							assert.Zero(t, service.Spec.Ports[0].NodePort)
						case "NetworkPolicy":
							var policy networkingv1.NetworkPolicy
							require.NoError(t, runtime.DefaultUnstructuredConverter.FromUnstructured(object.Object, &policy))
							require.Len(t, policy.Spec.Ingress, 1)
							assert.Equal(t, []networkingv1.PolicyType{networkingv1.PolicyTypeIngress}, policy.Spec.PolicyTypes)
							assert.Equal(t, inlinetools.ActivatorName, policy.Spec.PodSelector.MatchLabels["app.kubernetes.io/name"])
							require.Len(t, policy.Spec.Ingress[0].Ports, 1)
							assert.EqualValues(t, inlinetools.ActivatorPort, policy.Spec.Ingress[0].Ports[0].Port.IntVal)
							assert.Equal(t, corev1.ProtocolTCP, *policy.Spec.Ingress[0].Ports[0].Protocol)
							require.Len(t, policy.Spec.Ingress[0].From, 2)
							for _, peer := range policy.Spec.Ingress[0].From {
								require.NotNil(t, peer.NamespaceSelector)
								require.NotNil(t, peer.PodSelector)
								assert.Equal(t, map[string]string{"kubernetes.io/metadata.name": "ark-system"}, peer.NamespaceSelector.MatchLabels)
								assert.NotEmpty(t, peer.PodSelector.MatchLabels)
								assert.Nil(t, peer.IPBlock)
							}
						case "ClusterRole":
							var role rbacv1.ClusterRole
							require.NoError(t, runtime.DefaultUnstructuredConverter.FromUnstructured(object.Object, &role))
							assert.Nil(t, role.AggregationRule)
							assert.Equal(t, []rbacv1.PolicyRule{
								{APIGroups: []string{"ark.mckinsey.com"}, Resources: []string{"tools"}, Verbs: []string{"get"}},
								{APIGroups: []string{"apps"}, Resources: []string{"deployments"}, Verbs: []string{"get", "list"}},
								{APIGroups: []string{"apps"}, Resources: []string{"replicasets"}, Verbs: []string{"get"}},
								{APIGroups: []string{""}, Resources: []string{"services", "pods"}, Verbs: []string{"get"}},
								{APIGroups: []string{"discovery.k8s.io"}, Resources: []string{"endpointslices"}, Verbs: []string{"list"}},
								{APIGroups: []string{"apps"}, Resources: []string{"deployments/scale"}, Verbs: []string{"update"}},
							}, role.Rules)
						case "RoleBinding":
							var binding rbacv1.RoleBinding
							require.NoError(t, runtime.DefaultUnstructuredConverter.FromUnstructured(object.Object, &binding))
							assert.Contains(t, []string{"ark-system", "tenant"}, binding.Namespace)
							assert.Equal(t, rbacv1.RoleRef{APIGroup: "rbac.authorization.k8s.io", Kind: "ClusterRole", Name: inlinetools.ActivatorName}, binding.RoleRef)
							assert.Equal(t, []rbacv1.Subject{{Kind: "ServiceAccount", Name: inlinetools.ActivatorName, Namespace: "ark-system"}}, binding.Subjects)
						}
					}
					assert.Equal(t, map[string]int{"ServiceAccount": 1, "Deployment": 1, "Service": 1, "NetworkPolicy": 1, "ClusterRole": 1, "RoleBinding": 2}, counts)
				})
			}
		}
	}
}

func TestInlineActivatorChartRejectsUnsafeInstallation(t *testing.T) {
	objects, err := renderInlineActivator(t)
	require.NoError(t, err)
	for _, object := range objects {
		assert.NotEqual(t, inlinetools.ActivatorName, object.GetName())
		if object.GetKind() == "Deployment" && object.GetName() == "ark-controller" {
			var deployment appsv1.Deployment
			require.NoError(t, runtime.DefaultUnstructuredConverter.FromUnstructured(object.Object, &deployment))
			assert.Contains(t, deployment.Spec.Template.Spec.Containers[0].Env, corev1.EnvVar{Name: inlinetools.EnabledEnvVar, Value: "false"})
		}
	}
	for _, tc := range []struct {
		args    []string
		message string
	}{
		{[]string{"--set", "inlineTools.enabled=true"}, "inlineTools.activator.enabled=true"},
		{[]string{"--set", "inlineTools.activator.enabled=true", "--set", "networkPolicy.enable=true"}, "conflicts with networkPolicy.enable"},
		{[]string{"--set", "inlineTools.activator.enabled=true", "--set", "inlineTools.enabled=true", "--set", "networkPolicy.enable=true"}, "conflicts with networkPolicy.enable"},
		{[]string{"--set", "inlineTools.activator.enabled=true", "--set", "inlineTools.enabled=true", "--set", "webhook.enable=false"}, "requires webhook.enable=true"},
		{[]string{"--set", "inlineTools.activator.enabled=true"}, "non-empty controllerManager.watchNamespaces"},
		{[]string{"--set", "inlineTools.activator.enabled=true", "--set-json", `controllerManager.watchNamespaces=["tenant"]`}, "include the release namespace"},
		{[]string{"--set", "inlineTools.activator.enabled=true", "--set-json", `controllerManager.watchNamespaces=["ark-system",""]`}, "valid, non-empty namespace"},
		{[]string{"--set", "inlineTools.activator.enabled=true", "--set-json", `controllerManager.watchNamespaces=["ark-system"]`, "--set", "rbac.enable=false"}, "rbac.enable=true"},
		{[]string{"--set", "inlineTools.activator.enabled=true", "--set-json", `controllerManager.watchNamespaces=["ark-system"]`, "--set-json", `inlineTools.activator.allowedCallers=[]`}, "select at least one"},
		{[]string{"--set", "inlineTools.activator.enabled=true", "--set-json", `controllerManager.watchNamespaces=["ark-system"]`, "--set-json", `inlineTools.activator.allowedCallers=[{"podLabels":{}}]`}, "non-empty podLabels"},
		{[]string{"--set", "inlineTools.activator.enabled=true", "--set-json", `controllerManager.watchNamespaces=["ark-system"]`, "--set-json", `inlineTools.activator.allowedCallers=[{"namespace":"*","podLabels":{"app":"executor"}}]`}, "valid namespace names"},
	} {
		_, err := renderInlineActivator(t, tc.args...)
		require.ErrorContains(t, err, tc.message)
	}
}

func TestInlineActivatorScopedControllerRetainsAdmissionReviewPermissionWithoutMetrics(t *testing.T) {
	objects, err := renderInlineActivator(t, "--set", "inlineTools.activator.enabled=true", "--set", "inlineTools.enabled=true", "--set", "metrics.enable=false", "--set-json", `controllerManager.watchNamespaces=["ark-system"]`)
	require.NoError(t, err)
	foundRole, foundBinding := false, false
	for _, object := range objects {
		if object.GetKind() == "ClusterRole" && object.GetName() == "ark-controller-cluster-role" {
			var role rbacv1.ClusterRole
			require.NoError(t, runtime.DefaultUnstructuredConverter.FromUnstructured(object.Object, &role))
			assert.Contains(t, role.Rules, rbacv1.PolicyRule{APIGroups: []string{"authorization.k8s.io"}, Resources: []string{"subjectaccessreviews"}, Verbs: []string{"create"}})
			foundRole = true
		}
		if object.GetKind() == "ClusterRoleBinding" {
			var binding rbacv1.ClusterRoleBinding
			require.NoError(t, runtime.DefaultUnstructuredConverter.FromUnstructured(object.Object, &binding))
			for _, subject := range binding.Subjects {
				assert.NotEqual(t, inlinetools.ActivatorName, subject.Name)
			}
			if binding.RoleRef.Name == "ark-controller-cluster-role" {
				assert.Equal(t, []rbacv1.Subject{{Kind: "ServiceAccount", Name: "ark-controller", Namespace: "ark-system"}}, binding.Subjects)
				foundBinding = true
			}
		}
	}
	assert.True(t, foundRole)
	assert.True(t, foundBinding)
}

func TestInlineActivatorCustomReleaseAndCallerNamespaces(t *testing.T) {
	objects, err := renderInlineActivator(t, "--namespace", "control", "--set", "inlineTools.activator.enabled=true", "--set-json", `controllerManager.watchNamespaces=["control","tenant"]`, "--set-json", `inlineTools.activator.allowedCallers=[{"namespace":"executors","podLabels":{"team":"approved"}}]`)
	require.NoError(t, err)
	for _, object := range objects {
		if object.GetName() != inlinetools.ActivatorName {
			continue
		}
		switch object.GetKind() {
		case "RoleBinding":
			var binding rbacv1.RoleBinding
			require.NoError(t, runtime.DefaultUnstructuredConverter.FromUnstructured(object.Object, &binding))
			assert.Equal(t, "control", binding.Subjects[0].Namespace)
		case "NetworkPolicy":
			var policy networkingv1.NetworkPolicy
			require.NoError(t, runtime.DefaultUnstructuredConverter.FromUnstructured(object.Object, &policy))
			require.Len(t, policy.Spec.Ingress[0].From, 1)
			peer := policy.Spec.Ingress[0].From[0]
			assert.Equal(t, map[string]string{"kubernetes.io/metadata.name": "executors"}, peer.NamespaceSelector.MatchLabels)
			assert.Equal(t, map[string]string{"team": "approved"}, peer.PodSelector.MatchLabels)
		}
	}
}

func TestWatchNamespaces(t *testing.T) {
	cases := []struct {
		env  string
		want []string
	}{
		{"", nil},
		{"   ", nil},
		{"team-a", []string{"team-a"}},
		{"team-a,ark-system", []string{"team-a", "ark-system"}},
		{" team-a , ark-system ,", []string{"team-a", "ark-system"}},
	}
	for _, c := range cases {
		t.Setenv("ARK_WATCH_NAMESPACES", c.env)
		got := watchNamespaces()
		if !slices.Equal(got, c.want) {
			t.Errorf("watchNamespaces() with %q = %v, want %v", c.env, got, c.want)
		}
	}
}

// runParseFlags resets flag state, sets os.Args, and invokes parseFlags so each
// subtest gets an isolated FlagSet.
func runParseFlags(t *testing.T, args []string) struct {
	config
	zapOpts     zap.Options
	showVersion bool
} {
	t.Helper()
	oldArgs := os.Args
	oldFlagSet := flag.CommandLine
	t.Cleanup(func() {
		os.Args = oldArgs
		flag.CommandLine = oldFlagSet
	})
	flag.CommandLine = flag.NewFlagSet("test", flag.ContinueOnError)
	os.Args = args
	return parseFlags()
}

func TestParseFlags(t *testing.T) {
	cases := []struct {
		name            string
		args            []string
		wantConfig      config
		wantShowVersion bool
	}{
		{
			name: "defaults when flags omitted",
			args: []string{"cmd"},
			wantConfig: config{
				metricsAddr:                "0",
				probeAddr:                  ":8081",
				secureMetrics:              true,
				webhookCertName:            "tls.crt",
				webhookCertKey:             "tls.key",
				metricsCertName:            "tls.crt",
				metricsCertKey:             "tls.key",
				completionsAddr:            "http://ark-completions.ark-system",
				maxConcurrentQueries:       32,
				maxConcurrentReconciles:    4,
				defaultMemoryAutoProvision: true,
			},
		},
		{
			name: "every flag overridden",
			args: []string{
				"cmd",
				"--metrics-bind-address=:9000",
				"--health-probe-bind-address=:9001",
				"--leader-elect=true",
				"--metrics-secure=false",
				"--webhook-cert-path=/tmp/webhook",
				"--webhook-cert-name=webhook.crt",
				"--webhook-cert-key=webhook.key",
				"--metrics-cert-path=/tmp/metrics",
				"--metrics-cert-name=metrics.crt",
				"--metrics-cert-key=metrics.key",
				"--enable-http2=true",
				"--version=true",
				"--completions-addr=http://example.local",
				"--role=apiserver",
				"--max-concurrent-queries=10",
				"--max-concurrent-reconciles=5",
			},
			wantConfig: config{
				metricsAddr:                ":9000",
				probeAddr:                  ":9001",
				enableLeaderElection:       true,
				secureMetrics:              false,
				webhookCertPath:            "/tmp/webhook",
				webhookCertName:            "webhook.crt",
				webhookCertKey:             "webhook.key",
				metricsCertPath:            "/tmp/metrics",
				metricsCertName:            "metrics.crt",
				metricsCertKey:             "metrics.key",
				enableHTTP2:                true,
				completionsAddr:            "http://example.local",
				role:                       "apiserver",
				maxConcurrentQueries:       10,
				maxConcurrentReconciles:    5,
				defaultMemoryAutoProvision: true,
			},
			wantShowVersion: true,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			result := runParseFlags(t, c.args)
			if result.config != c.wantConfig {
				t.Errorf("config mismatch\n got: %+v\nwant: %+v", result.config, c.wantConfig)
			}
			if result.showVersion != c.wantShowVersion {
				t.Errorf("showVersion = %v, want %v", result.showVersion, c.wantShowVersion)
			}
		})
	}
}

func TestApiserverConfigFromEnv(t *testing.T) {
	envKeys := []string{
		"ARK_APISERVER_PORT",
		"ARK_POSTGRES_HOST",
		"ARK_POSTGRES_PORT",
		"ARK_POSTGRES_DATABASE",
		"ARK_POSTGRES_USER",
		"ARK_POSTGRES_PASSWORD",
		"ARK_POSTGRES_SSL_MODE",
		"ARK_APISERVER_AUTH_MODE",
		"ARK_APISERVER_TLS_CERT_FILE",
		"ARK_APISERVER_TLS_KEY_FILE",
		"ARK_POSTGRES_SSL_ROOT_CERT",
		"ARK_POSTGRES_SSL_CERT",
		"ARK_POSTGRES_SSL_KEY",
		"ARK_APISERVER_AUDIT_ENABLED",
		"ARK_APISERVER_AUDIT_POLICY_FILE",
		"ARK_APISERVER_AUDIT_LOG_PATH",
		"ARK_APISERVER_POLICY_CEL_ENABLED",
		"ARK_APISERVER_POLICY_CEL_REQUIRED",
		"ARK_APISERVER_POLICY_THIRD_PARTY_WEBHOOKS_ENABLED",
		"ARK_APISERVER_POLICY_THIRD_PARTY_WEBHOOKS_REQUIRED",
	}

	cases := []struct {
		name    string
		env     map[string]string
		want    apiserver.Config
		wantErr string
	}{
		{
			name: "defaults when env unset",
			env:  map[string]string{},
			// Off with no env: audit is "on by default" only once a policy file exists.
			want: apiserver.Config{PostgresSSL: "require", AuditEnabled: false, AuditLogPath: "-"},
		},
		{
			name: "audit defaults on once a policy file is configured",
			env:  map[string]string{"ARK_APISERVER_AUDIT_POLICY_FILE": "/etc/ark/audit/policy.yaml"},
			want: apiserver.Config{
				PostgresSSL:     "require",
				AuditEnabled:    true,
				AuditPolicyFile: "/etc/ark/audit/policy.yaml",
				AuditLogPath:    "-",
			},
		},
		{
			// Not downgraded to off: applyAudit turns this into a startup error instead.
			name: "explicit audit opt-in without a policy file stays enabled",
			env:  map[string]string{"ARK_APISERVER_AUDIT_ENABLED": "true"},
			want: apiserver.Config{PostgresSSL: "require", AuditEnabled: true, AuditLogPath: "-"},
		},
		{
			name: "CEL enforcement can be made a startup requirement",
			env:  map[string]string{"ARK_APISERVER_POLICY_CEL_REQUIRED": "true"},
			want: apiserver.Config{PostgresSSL: "require", AuditLogPath: "-", CELRequired: true},
		},
		{
			name:    "invalid CEL required bool",
			env:     map[string]string{"ARK_APISERVER_POLICY_CEL_REQUIRED": "sometimes"},
			wantErr: "ARK_APISERVER_POLICY_CEL_REQUIRED",
		},
		{
			// Enabled is the default, so only an explicit opt-out sets CELDisabled.
			name: "CEL enforcement can be switched off",
			env:  map[string]string{"ARK_APISERVER_POLICY_CEL_ENABLED": "false"},
			want: apiserver.Config{PostgresSSL: "require", AuditLogPath: "-", CELDisabled: true},
		},
		{
			name: "CEL enabled explicitly leaves enforcement wired",
			env:  map[string]string{"ARK_APISERVER_POLICY_CEL_ENABLED": "true"},
			want: apiserver.Config{PostgresSSL: "require", AuditLogPath: "-"},
		},
		{
			name:    "invalid CEL enabled bool",
			env:     map[string]string{"ARK_APISERVER_POLICY_CEL_ENABLED": "maybe"},
			wantErr: "ARK_APISERVER_POLICY_CEL_ENABLED",
		},
		{
			// The combination one shared flag could not express: webhooks mandatory with CEL
			// left at its best-effort default.
			name: "third-party webhooks can be required independently of CEL",
			env: map[string]string{
				"ARK_APISERVER_POLICY_THIRD_PARTY_WEBHOOKS_ENABLED":  "true",
				"ARK_APISERVER_POLICY_THIRD_PARTY_WEBHOOKS_REQUIRED": "true",
			},
			want: apiserver.Config{
				PostgresSSL: "require", AuditLogPath: "-",
				ThirdPartyWebhooks: true, ThirdPartyWebhooksRequired: true,
			},
		},
		{
			name:    "invalid third-party webhooks required bool",
			env:     map[string]string{"ARK_APISERVER_POLICY_THIRD_PARTY_WEBHOOKS_REQUIRED": "sometimes"},
			wantErr: "ARK_APISERVER_POLICY_THIRD_PARTY_WEBHOOKS_REQUIRED",
		},
		{
			name: "every variable set",
			env: map[string]string{
				"ARK_APISERVER_PORT":              "8443",
				"ARK_POSTGRES_HOST":               "db.example.com",
				"ARK_POSTGRES_PORT":               "5433",
				"ARK_POSTGRES_DATABASE":           "ark",
				"ARK_POSTGRES_USER":               "ark",
				"ARK_POSTGRES_PASSWORD":           "secret",
				"ARK_POSTGRES_SSL_MODE":           "verify-full",
				"ARK_APISERVER_AUTH_MODE":         "delegated",
				"ARK_APISERVER_TLS_CERT_FILE":     "/certs/tls.crt",
				"ARK_APISERVER_TLS_KEY_FILE":      "/certs/tls.key",
				"ARK_POSTGRES_SSL_ROOT_CERT":      "/etc/ark/postgres-tls/ca.crt",
				"ARK_POSTGRES_SSL_CERT":           "/etc/ark/postgres-tls/tls.crt",
				"ARK_POSTGRES_SSL_KEY":            "/etc/ark/postgres-tls/tls.key",
				"ARK_APISERVER_AUDIT_ENABLED":     "true",
				"ARK_APISERVER_AUDIT_POLICY_FILE": "/etc/ark/audit/policy.yaml",
				"ARK_APISERVER_AUDIT_LOG_PATH":    "/var/log/ark/audit.log",
			},
			want: apiserver.Config{
				BindPort:        8443,
				PostgresHost:    "db.example.com",
				PostgresPort:    5433,
				PostgresDB:      "ark",
				PostgresUser:    "ark",
				PostgresPass:    "secret",
				PostgresSSL:     "verify-full",
				AuthMode:        "delegated",
				TLSCertFile:     "/certs/tls.crt",
				TLSKeyFile:      "/certs/tls.key",
				PostgresSSLRoot: "/etc/ark/postgres-tls/ca.crt",
				PostgresSSLCert: "/etc/ark/postgres-tls/tls.crt",
				PostgresSSLKey:  "/etc/ark/postgres-tls/tls.key",
				AuditEnabled:    true,
				AuditPolicyFile: "/etc/ark/audit/policy.yaml",
				AuditLogPath:    "/var/log/ark/audit.log",
			},
		},
		{
			name: "audit can be disabled",
			env:  map[string]string{"ARK_APISERVER_AUDIT_ENABLED": "false"},
			want: apiserver.Config{PostgresSSL: "require", AuditEnabled: false, AuditLogPath: "-"},
		},
		{
			name:    "invalid audit enabled bool",
			env:     map[string]string{"ARK_APISERVER_AUDIT_ENABLED": "maybe"},
			wantErr: "ARK_APISERVER_AUDIT_ENABLED",
		},
		{
			name:    "invalid apiserver port",
			env:     map[string]string{"ARK_APISERVER_PORT": "not-a-port"},
			wantErr: "ARK_APISERVER_PORT",
		},
		{
			name:    "invalid postgres port",
			env:     map[string]string{"ARK_POSTGRES_PORT": "5432a"},
			wantErr: "ARK_POSTGRES_PORT",
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			for _, key := range envKeys {
				t.Setenv(key, c.env[key])
			}
			got, err := apiserverConfigFromEnv()
			if c.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), c.wantErr) {
					t.Fatalf("error = %v, want mention of %q", err, c.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != c.want {
				t.Errorf("config mismatch\n got: %+v\nwant: %+v", got, c.want)
			}
		})
	}
}

func TestPostgresCleanupConfig(t *testing.T) {
	for _, k := range []string{
		"ARK_POSTGRES_HOST", "ARK_POSTGRES_DATABASE", "ARK_POSTGRES_USER",
		"ARK_POSTGRES_PASSWORD", "ARK_POSTGRES_SSL_MODE", "ARK_POSTGRES_PORT",
		"ARK_POSTGRES_SSL_ROOT_CERT", "ARK_POSTGRES_SSL_CERT", "ARK_POSTGRES_SSL_KEY",
	} {
		t.Setenv(k, "")
	}

	t.Run("reads env", func(t *testing.T) {
		t.Setenv("ARK_POSTGRES_HOST", "db")
		t.Setenv("ARK_POSTGRES_DATABASE", "ark")
		t.Setenv("ARK_POSTGRES_USER", "ark")
		t.Setenv("ARK_POSTGRES_PASSWORD", "pw")
		t.Setenv("ARK_POSTGRES_SSL_MODE", "verify-full")
		t.Setenv("ARK_POSTGRES_PORT", "6000")
		t.Setenv("ARK_POSTGRES_SSL_ROOT_CERT", "/etc/ark/postgres-tls/ca.crt")
		t.Setenv("ARK_POSTGRES_SSL_CERT", "/etc/ark/postgres-tls/tls.crt")
		t.Setenv("ARK_POSTGRES_SSL_KEY", "/etc/ark/postgres-tls/tls.key")

		cfg := postgresCleanupConfig()
		if cfg.Host != "db" || cfg.Database != "ark" || cfg.User != "ark" ||
			cfg.Password != "pw" || cfg.SSLMode != "verify-full" || cfg.Port != 6000 ||
			cfg.SSLRootCert != "/etc/ark/postgres-tls/ca.crt" ||
			cfg.SSLCert != "/etc/ark/postgres-tls/tls.crt" ||
			cfg.SSLKey != "/etc/ark/postgres-tls/tls.key" {
			t.Errorf("unexpected config: %+v", cfg)
		}
	})

	t.Run("port left zero when unset or invalid", func(t *testing.T) {
		t.Setenv("ARK_POSTGRES_PORT", "")
		if cfg := postgresCleanupConfig(); cfg.Port != 0 {
			t.Errorf("Port = %d, want 0 (defaulted downstream)", cfg.Port)
		}
		t.Setenv("ARK_POSTGRES_PORT", "not-a-number")
		if cfg := postgresCleanupConfig(); cfg.Port != 0 {
			t.Errorf("Port = %d, want 0 for invalid input", cfg.Port)
		}
	})
}

func TestLeaderElectionID(t *testing.T) {
	cases := []struct {
		role string
		want string
	}{
		{"apiserver", "ark-apiserver-leader"},
		{"controller", "ark-controller-leader"},
	}
	for _, c := range cases {
		got := leaderElectionID(c.role)
		if got != c.want {
			t.Errorf("leaderElectionID(%q) = %q, want %q", c.role, got, c.want)
		}
	}
}
