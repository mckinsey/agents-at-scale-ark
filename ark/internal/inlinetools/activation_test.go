/* Copyright 2025. McKinsey & Company */

package inlinetools

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/utils/ptr"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/inlinetools/runner"
)

func activationObjects(name, language string) (*arkv1alpha1.Tool, *appsv1.Deployment, *corev1.Service) {
	source := map[string]string{
		"bash": "printf '1'", "python": "print(1)", "node": "console.log(1)", "ts": "const n: number = 1; console.log(n)",
	}[language]
	tool := &arkv1alpha1.Tool{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "tenant", UID: "tool-uid", Generation: 1},
		Spec:       arkv1alpha1.ToolSpec{Type: arkv1alpha1.ToolTypeInline, Inline: &arkv1alpha1.InlineSpec{Language: language, Source: source}},
		Status: arkv1alpha1.ToolStatus{State: arkv1alpha1.ToolStateReady, Conditions: []metav1.Condition{{
			Type: arkv1alpha1.ToolConditionAvailable, Status: metav1.ConditionTrue, Reason: arkv1alpha1.ToolReasonAvailable, ObservedGeneration: 1,
		}}},
	}
	tool.Status.ResolvedAddress = ResolvedAddress("ark-system", tool)
	metadata := metav1.ObjectMeta{
		Name: NamesFor(name).Runner, Namespace: tool.Namespace, UID: "child-uid", Labels: RunnerLabels(tool),
		OwnerReferences: []metav1.OwnerReference{*metav1.NewControllerRef(tool, arkv1alpha1.GroupVersion.WithKind("Tool"))},
	}
	hash := runner.SourceHash(tool.Spec.Inline.Source)
	deployment := &appsv1.Deployment{ObjectMeta: *metadata.DeepCopy(), Spec: appsv1.DeploymentSpec{
		Replicas: ptr.To(int32(0)), Selector: &metav1.LabelSelector{MatchLabels: RunnerLabels(tool)},
		Template: corev1.PodTemplateSpec{
			ObjectMeta: metav1.ObjectMeta{Labels: RunnerLabels(tool), Annotations: map[string]string{SourceHashAnnotation: hash}},
			Spec: corev1.PodSpec{Containers: []corev1.Container{{Name: "runner", Env: []corev1.EnvVar{
				{Name: runner.EnvToolName, Value: name}, {Name: runner.EnvLanguage, Value: language}, {Name: runner.EnvSourceHash, Value: hash},
			}}}},
		},
	}}
	service := &corev1.Service{ObjectMeta: *metadata.DeepCopy(), Spec: corev1.ServiceSpec{
		Type: corev1.ServiceTypeClusterIP, ClusterIP: "10.43.0.99", Selector: RunnerLabels(tool),
		Ports: []corev1.ServicePort{{Port: runner.Port, Protocol: corev1.ProtocolTCP, TargetPort: intstr.FromInt32(runner.Port)}},
	}}
	return tool, deployment, service
}

func TestResolveActivationAcceptsCurrentOwnedIdleOrWarmBackend(t *testing.T) {
	for _, language := range []string{"bash", "python", "node", "ts"} {
		t.Run(language, func(t *testing.T) {
			for _, name := range []string{"echo", strings.Repeat("long-name-", 20) + "echo"} {
				for _, replicas := range []int32{0, 1} {
					tool, deployment, service := activationObjects(name, language)
					deployment.Spec.Replicas = ptr.To(replicas)
					before := deployment.DeepCopy()
					address, err := ResolveActivation(true, tool, tool.UID, tool.Name, "ark-system", deployment, service)
					require.NoError(t, err)
					assert.Equal(t, "http://"+NamesFor(name).Runner+".tenant.svc.cluster.local:8080/mcp", address)
					assert.Equal(t, before, deployment, "admission must not change replicas or any other child field")
				}
			}
		})
	}
}

func TestResolveActivationRejectsUnsupportedLanguage(t *testing.T) {
	tool, deployment, service := activationObjects("echo", "python")
	tool.Spec.Inline.Language = "ruby"
	deployment.Spec.Template.Spec.Containers[0].Env[1].Value = "ruby"
	address, err := ResolveActivation(true, tool, tool.UID, tool.Name, "ark-system", deployment, service)
	require.ErrorContains(t, err, `unsupported inline language "ruby"`)
	assert.Empty(t, address)
}

func TestResolveActivationRejectsUnsafeState(t *testing.T) {
	cases := []struct {
		name   string
		change func(*arkv1alpha1.Tool, *appsv1.Deployment, *corev1.Service)
	}{
		{"non-inline", func(t *arkv1alpha1.Tool, _ *appsv1.Deployment, _ *corev1.Service) {
			t.Spec.Type = arkv1alpha1.ToolTypeHTTP
		}},
		{"missing source block", func(t *arkv1alpha1.Tool, _ *appsv1.Deployment, _ *corev1.Service) { t.Spec.Inline = nil }},
		{"deleting tool", func(t *arkv1alpha1.Tool, _ *appsv1.Deployment, _ *corev1.Service) {
			t.DeletionTimestamp = ptr.To(metav1.Now())
		}},
		{"empty UID", func(t *arkv1alpha1.Tool, _ *appsv1.Deployment, _ *corev1.Service) { t.UID = "" }},
		{"missing condition", func(t *arkv1alpha1.Tool, _ *appsv1.Deployment, _ *corev1.Service) { t.Status.Conditions = nil }},
		{"false condition", func(t *arkv1alpha1.Tool, _ *appsv1.Deployment, _ *corev1.Service) {
			t.Status.Conditions[0].Status = metav1.ConditionFalse
		}},
		{"unknown condition", func(t *arkv1alpha1.Tool, _ *appsv1.Deployment, _ *corev1.Service) {
			t.Status.Conditions[0].Status = metav1.ConditionUnknown
		}},
		{"conflicting policy", func(t *arkv1alpha1.Tool, _ *appsv1.Deployment, _ *corev1.Service) {
			t.Status.Conditions[0].Reason = arkv1alpha1.ToolReasonConflictingPolicy
		}},
		{"stale generation", func(t *arkv1alpha1.Tool, _ *appsv1.Deployment, _ *corev1.Service) { t.Generation++ }},
		{"zero generation", func(t *arkv1alpha1.Tool, _ *appsv1.Deployment, _ *corev1.Service) {
			t.Generation, t.Status.Conditions[0].ObservedGeneration = 0, 0
		}},
		{"Pending", func(t *arkv1alpha1.Tool, _ *appsv1.Deployment, _ *corev1.Service) {
			t.Status.State = arkv1alpha1.ToolStatePending
		}},
		{"missing endpoint", func(t *arkv1alpha1.Tool, _ *appsv1.Deployment, _ *corev1.Service) { t.Status.ResolvedAddress = "" }},
		{"arbitrary endpoint", func(t *arkv1alpha1.Tool, _ *appsv1.Deployment, _ *corev1.Service) {
			t.Status.ResolvedAddress = "http://attacker/"
		}},
		{"wrong deployment name", func(_ *arkv1alpha1.Tool, d *appsv1.Deployment, _ *corev1.Service) { d.Name = "other" }},
		{"cross-namespace deployment", func(_ *arkv1alpha1.Tool, d *appsv1.Deployment, _ *corev1.Service) { d.Namespace = "elsewhere" }},
		{"missing deployment UID", func(_ *arkv1alpha1.Tool, d *appsv1.Deployment, _ *corev1.Service) { d.UID = "" }},
		{"deleting deployment", func(_ *arkv1alpha1.Tool, d *appsv1.Deployment, _ *corev1.Service) {
			d.DeletionTimestamp = ptr.To(metav1.Now())
		}},
		{"unowned deployment", func(_ *arkv1alpha1.Tool, d *appsv1.Deployment, _ *corev1.Service) { d.OwnerReferences = nil }},
		{"previous Tool owner", func(_ *arkv1alpha1.Tool, d *appsv1.Deployment, _ *corev1.Service) {
			d.OwnerReferences[0].UID = "old-uid"
		}},
		{"wrong owner kind", func(_ *arkv1alpha1.Tool, d *appsv1.Deployment, _ *corev1.Service) {
			d.OwnerReferences[0].Kind = "MCPServer"
		}},
		{"wrong owner name", func(_ *arkv1alpha1.Tool, d *appsv1.Deployment, _ *corev1.Service) {
			d.OwnerReferences[0].Name = "other"
		}},
		{"wrong owner API", func(_ *arkv1alpha1.Tool, d *appsv1.Deployment, _ *corev1.Service) {
			d.OwnerReferences[0].APIVersion = "other/v1"
		}},
		{"non-controller owner", func(_ *arkv1alpha1.Tool, d *appsv1.Deployment, _ *corev1.Service) {
			d.OwnerReferences[0].Controller = ptr.To(false)
		}},
		{"wrong deployment labels", func(_ *arkv1alpha1.Tool, d *appsv1.Deployment, _ *corev1.Service) { d.Labels[LabelToolUID] = "old-uid" }},
		{"wrong deployment selector", func(_ *arkv1alpha1.Tool, d *appsv1.Deployment, _ *corev1.Service) { d.Spec.Selector = nil }},
		{"wrong pod identity", func(_ *arkv1alpha1.Tool, d *appsv1.Deployment, _ *corev1.Service) {
			d.Spec.Template.Labels[LabelToolUID] = "old-uid"
		}},
		{"stale source", func(t *arkv1alpha1.Tool, _ *appsv1.Deployment, _ *corev1.Service) { t.Spec.Inline.Source = "print(2)" }},
		{"missing hash", func(_ *arkv1alpha1.Tool, d *appsv1.Deployment, _ *corev1.Service) { d.Spec.Template.Annotations = nil }},
		{"missing runner container", func(_ *arkv1alpha1.Tool, d *appsv1.Deployment, _ *corev1.Service) {
			d.Spec.Template.Spec.Containers = nil
		}},
		{"missing execution env", func(_ *arkv1alpha1.Tool, d *appsv1.Deployment, _ *corev1.Service) {
			d.Spec.Template.Spec.Containers[0].Env = nil
		}},
		{"stale execution env", func(_ *arkv1alpha1.Tool, d *appsv1.Deployment, _ *corev1.Service) {
			d.Spec.Template.Spec.Containers[0].Env[2].Value = "old-hash"
		}},
		{"stale language", func(t *arkv1alpha1.Tool, _ *appsv1.Deployment, _ *corev1.Service) { t.Spec.Inline.Language = "bash" }},
		{"env from external source", func(_ *arkv1alpha1.Tool, d *appsv1.Deployment, _ *corev1.Service) {
			d.Spec.Template.Spec.Containers[0].Env[0].ValueFrom = &corev1.EnvVarSource{}
		}},
		{"duplicate env", func(_ *arkv1alpha1.Tool, d *appsv1.Deployment, _ *corev1.Service) {
			d.Spec.Template.Spec.Containers[0].Env = append(d.Spec.Template.Spec.Containers[0].Env, d.Spec.Template.Spec.Containers[0].Env[0])
		}},
		{"wrong service name", func(_ *arkv1alpha1.Tool, _ *appsv1.Deployment, s *corev1.Service) { s.Name = "other" }},
		{"cross-namespace service", func(_ *arkv1alpha1.Tool, _ *appsv1.Deployment, s *corev1.Service) { s.Namespace = "elsewhere" }},
		{"unowned service", func(_ *arkv1alpha1.Tool, _ *appsv1.Deployment, s *corev1.Service) { s.OwnerReferences = nil }},
		{"deleting service", func(_ *arkv1alpha1.Tool, _ *appsv1.Deployment, s *corev1.Service) {
			s.DeletionTimestamp = ptr.To(metav1.Now())
		}},
		{"external service", func(_ *arkv1alpha1.Tool, _ *appsv1.Deployment, s *corev1.Service) {
			s.Spec.Type = corev1.ServiceTypeExternalName
			s.Spec.ExternalName = "attacker"
		}},
		{"public service", func(_ *arkv1alpha1.Tool, _ *appsv1.Deployment, s *corev1.Service) {
			s.Spec.Type = corev1.ServiceTypeLoadBalancer
		}},
		{"external IP", func(_ *arkv1alpha1.Tool, _ *appsv1.Deployment, s *corev1.Service) {
			s.Spec.ExternalIPs = []string{"192.0.2.1"}
		}},
		{"headless service", func(_ *arkv1alpha1.Tool, _ *appsv1.Deployment, s *corev1.Service) {
			s.Spec.ClusterIP = corev1.ClusterIPNone
		}},
		{"unallocated service", func(_ *arkv1alpha1.Tool, _ *appsv1.Deployment, s *corev1.Service) { s.Spec.ClusterIP = "" }},
		{"arbitrary selector", func(_ *arkv1alpha1.Tool, _ *appsv1.Deployment, s *corev1.Service) {
			s.Spec.Selector = map[string]string{"app": "other"}
		}},
		{"missing port", func(_ *arkv1alpha1.Tool, _ *appsv1.Deployment, s *corev1.Service) { s.Spec.Ports = nil }},
		{"wrong service port", func(_ *arkv1alpha1.Tool, _ *appsv1.Deployment, s *corev1.Service) { s.Spec.Ports[0].Port = 80 }},
		{"UDP port", func(_ *arkv1alpha1.Tool, _ *appsv1.Deployment, s *corev1.Service) {
			s.Spec.Ports[0].Protocol = corev1.ProtocolUDP
		}},
		{"wrong backend port", func(_ *arkv1alpha1.Tool, _ *appsv1.Deployment, s *corev1.Service) {
			s.Spec.Ports[0].TargetPort = intstr.FromInt32(9090)
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			tool, deployment, service := activationObjects("echo", "python")
			tc.change(tool, deployment, service)
			beforeTool, beforeDeployment, beforeService := tool.DeepCopy(), deployment.DeepCopy(), service.DeepCopy()
			address, err := ResolveActivation(true, tool, tool.UID, tool.Name, "ark-system", deployment, service)
			require.Error(t, err)
			assert.Empty(t, address)
			assert.Equal(t, beforeTool, tool)
			assert.Equal(t, beforeDeployment, deployment)
			assert.Equal(t, beforeService, service)
		})
	}
}

func TestResolveActivationRejectsDisabledStaleUnknownOrMissingTargets(t *testing.T) {
	tool, deployment, service := activationObjects("echo", "python")
	cases := []struct {
		name    string
		resolve func() (string, error)
	}{
		{"disabled", func() (string, error) {
			return ResolveActivation(false, tool, tool.UID, tool.Name, "ark-system", deployment, service)
		}},
		{"stale UID route", func() (string, error) {
			return ResolveActivation(true, tool, "deleted-tool-uid", tool.Name, "ark-system", deployment, service)
		}},
		{"unknown MCP name", func() (string, error) {
			return ResolveActivation(true, tool, tool.UID, "other", "ark-system", deployment, service)
		}},
		{"missing activator namespace", func() (string, error) {
			return ResolveActivation(true, tool, tool.UID, tool.Name, "", deployment, service)
		}},
		{"missing tool", func() (string, error) {
			return ResolveActivation(true, nil, "uid", "echo", "ark-system", deployment, service)
		}},
		{"missing deployment", func() (string, error) {
			return ResolveActivation(true, tool, tool.UID, tool.Name, "ark-system", nil, service)
		}},
		{"missing service", func() (string, error) {
			return ResolveActivation(true, tool, tool.UID, tool.Name, "ark-system", deployment, nil)
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) { address, err := tc.resolve(); require.Error(t, err); assert.Empty(t, address) })
	}
}
