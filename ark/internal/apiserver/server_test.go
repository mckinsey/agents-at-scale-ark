/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	authorizationv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/util/strategicpatch"
	genericapiserver "k8s.io/apiserver/pkg/server"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/kubernetes/fake"
	clientrest "k8s.io/client-go/rest"
	k8stesting "k8s.io/client-go/testing"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
)

func TestValidatingAdmissionPolicyServed(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		resources []*metav1.APIResourceList
		want      bool
	}{
		{
			name: "served (k8s >=1.30)",
			resources: []*metav1.APIResourceList{{
				GroupVersion: "admissionregistration.k8s.io/v1",
				APIResources: []metav1.APIResource{
					{Name: "validatingwebhookconfigurations"},
					{Name: "validatingadmissionpolicies"},
				},
			}},
			want: true,
		},
		{
			name: "not served (older host: only webhook configs)",
			resources: []*metav1.APIResourceList{{
				GroupVersion: "admissionregistration.k8s.io/v1",
				APIResources: []metav1.APIResource{
					{Name: "validatingwebhookconfigurations"},
				},
			}},
			want: false,
		},
		{
			name:      "group version absent",
			resources: nil,
			want:      false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cs := fake.NewSimpleClientset()
			cs.Resources = tt.resources
			got, err := validatingAdmissionPolicyServed(cs.Discovery())
			if err != nil {
				t.Fatalf("validatingAdmissionPolicyServed() unexpected error: %v", err)
			}
			if got != tt.want {
				t.Errorf("validatingAdmissionPolicyServed() = %v, want %v", got, tt.want)
			}
		})
	}
}

// errDiscovery fails a bounded number of times, then behaves like a healthy host — a host
// apiserver briefly unreachable while the pod starts.
type errDiscovery struct {
	discovery.DiscoveryInterface
	failures int
	calls    int
}

func (e *errDiscovery) ServerResourcesForGroupVersion(gv string) (*metav1.APIResourceList, error) {
	e.calls++
	if e.calls <= e.failures {
		return nil, errors.New("connection refused")
	}
	return &metav1.APIResourceList{
		GroupVersion: gv,
		APIResources: []metav1.APIResource{{Name: "validatingadmissionpolicies"}},
	}, nil
}

// A transient failure must not be mistaken for an unsupported host: that silently disables
// policy enforcement for the life of the process.
func TestDiscoverPolicySupport_RetriesTransientFailure(t *testing.T) {
	t.Parallel()

	d := &errDiscovery{failures: 2}
	served, err := discoverPolicySupport(context.Background(), d, 5, time.Millisecond)
	if err != nil {
		t.Fatalf("expected retry to succeed, got error: %v", err)
	}
	if !served {
		t.Error("expected served=true after retries")
	}
	if d.calls != 3 {
		t.Errorf("expected 3 discovery calls (2 failures + 1 success), got %d", d.calls)
	}
}

// Must surface an error, not (false, nil) — the latter turns a network blip into a silent
// policy bypass.
func TestDiscoverPolicySupport_ExhaustedReturnsError(t *testing.T) {
	t.Parallel()

	d := &errDiscovery{failures: 99}
	served, err := discoverPolicySupport(context.Background(), d, 3, time.Millisecond)
	if err == nil {
		t.Fatal("expected an error when discovery never succeeds, got nil")
	}
	if served {
		t.Error("expected served=false when discovery never succeeds")
	}
	if d.calls != 3 {
		t.Errorf("expected exactly 3 attempts, got %d", d.calls)
	}
}

func TestApplyAudit(t *testing.T) {
	t.Parallel()

	policy := filepath.Join(t.TempDir(), "policy.yaml")
	if err := os.WriteFile(policy, []byte("apiVersion: audit.k8s.io/v1\nkind: Policy\nrules:\n  - level: Metadata\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	t.Run("enabled without a policy file is refused", func(t *testing.T) {
		s := &Server{config: Config{AuditEnabled: true, AuditLogPath: "-"}}
		err := s.applyAudit(genericapiserver.NewConfig(Codecs))
		if err == nil {
			t.Fatal("expected an error when audit is enabled with no policy file")
		}
		if !strings.Contains(err.Error(), "no audit records would be emitted") {
			t.Errorf("error should explain the consequence, got: %v", err)
		}
	})

	t.Run("enabled with a policy file wires a backend", func(t *testing.T) {
		s := &Server{config: Config{AuditEnabled: true, AuditLogPath: "-", AuditPolicyFile: policy}}
		cfg := genericapiserver.NewConfig(Codecs)
		if err := s.applyAudit(cfg); err != nil {
			t.Fatalf("applyAudit: %v", err)
		}
		if cfg.AuditBackend == nil {
			t.Error("expected a non-nil AuditBackend")
		}
		if cfg.AuditPolicyRuleEvaluator == nil {
			t.Error("expected a non-nil AuditPolicyRuleEvaluator")
		}
	})

	t.Run("disabled is a no-op", func(t *testing.T) {
		s := &Server{config: Config{AuditEnabled: false}}
		cfg := genericapiserver.NewConfig(Codecs)
		if err := s.applyAudit(cfg); err != nil {
			t.Fatalf("applyAudit: %v", err)
		}
		if cfg.AuditBackend != nil {
			t.Error("expected no AuditBackend when audit is disabled")
		}
	})
}

// Guards the auth-mode-'off' startup failure: the plugin refuses to initialise without an
// authorizer, and nothing populates one in that mode.
func TestApplyAdmission_SucceedsWithoutAnAuthorizer(t *testing.T) {
	t.Parallel()

	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.Contains(r.URL.Path, "selfsubjectaccessreviews") {
			_, _ = w.Write([]byte(`{"kind":"SelfSubjectAccessReview","apiVersion":"authorization.k8s.io/v1",` +
				`"status":{"allowed":true}}`))
			return
		}
		_, _ = w.Write([]byte(`{"kind":"APIResourceList","groupVersion":"admissionregistration.k8s.io/v1",` +
			`"resources":[{"name":"validatingadmissionpolicies","namespaced":false,"kind":"ValidatingAdmissionPolicy","verbs":["list","watch"]}]}`))
	}))
	defer srv.Close()

	s := &Server{config: Config{
		RestConfig: &clientrest.Config{
			Host:            srv.URL,
			TLSClientConfig: clientrest.TLSClientConfig{Insecure: true},
		},
	}}

	cfg := genericapiserver.NewConfig(Codecs)
	if cfg.Authorization.Authorizer != nil {
		t.Fatal("precondition: expected a nil Authorizer, as in auth mode 'off'")
	}

	inf, err := s.applyAdmission(context.Background(), cfg)
	if err != nil {
		t.Fatalf("applyAdmission must not fail when no authorizer is configured: %v", err)
	}
	if inf == nil {
		t.Fatal("expected an informer factory when policy enforcement is wired")
	}
	if cfg.AdmissionControl == nil {
		t.Error("expected AdmissionControl to be wired")
	}
	if cfg.Authorization.Authorizer == nil {
		t.Error("expected an allow-all authorizer to have been supplied")
	}
}

// PolicyRequired must fail loudly rather than start silently unenforced.
func TestApplyAdmission_PolicyRequiredFailsClosed(t *testing.T) {
	t.Parallel()

	s := &Server{config: Config{PolicyRequired: true}} // no RestConfig => cannot wire policy
	_, err := s.applyAdmission(context.Background(), genericapiserver.NewConfig(Codecs))
	if err == nil {
		t.Fatal("expected startup to fail when policy is required but cannot be wired")
	}
	if !strings.Contains(err.Error(), "required") {
		t.Errorf("error should say policy enforcement was required, got: %v", err)
	}
}

func TestApplyAdmission_BestEffortSkipsWhenUnwirable(t *testing.T) {
	t.Parallel()

	s := &Server{config: Config{PolicyRequired: false}} // no RestConfig
	inf, err := s.applyAdmission(context.Background(), genericapiserver.NewConfig(Codecs))
	if err != nil {
		t.Fatalf("best-effort mode should not fail startup: %v", err)
	}
	if inf != nil {
		t.Error("expected a nil informer factory when policy enforcement is skipped")
	}
}

// policy.enabled=false must skip wiring before any host call, so an operator who opts out is
// not left depending on discovery or RBAC succeeding.
func TestApplyAdmission_DisabledSkipsWiringEntirely(t *testing.T) {
	t.Parallel()

	s := &Server{config: Config{PolicyDisabled: true, RestConfig: &clientrest.Config{Host: "https://unreachable.invalid"}}}
	cfg := genericapiserver.NewConfig(Codecs)
	inf, err := s.applyAdmission(context.Background(), cfg)
	if err != nil {
		t.Fatalf("disabling policy must not fail startup: %v", err)
	}
	if inf != nil {
		t.Error("expected a nil informer factory when policy enforcement is disabled")
	}
	if cfg.AdmissionControl != nil {
		t.Error("expected no admission chain to be wired when policy enforcement is disabled")
	}
}

// Disabled and required are contradictory; silently honouring either one would discard an
// explicit instruction, and one of the two outcomes is "serving unenforced".
func TestApplyAdmission_DisabledAndRequiredConflict(t *testing.T) {
	t.Parallel()

	s := &Server{config: Config{PolicyDisabled: true, PolicyRequired: true}}
	_, err := s.applyAdmission(context.Background(), genericapiserver.NewConfig(Codecs))
	if err == nil {
		t.Fatal("expected startup to fail when policy enforcement is both disabled and required")
	}
	for _, want := range []string{"disabled", "required"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error should mention %q, got: %v", want, err)
		}
	}
}

func TestCheckWatchPermissions(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		allowed map[string]bool // resource -> allowed; absent means allowed
		apiErr  error
		wantErr string
	}{
		{
			name: "all three watches granted",
		},
		{
			name:    "policy watch denied names the binding",
			allowed: map[string]bool{"validatingadmissionpolicies": false},
			wantErr: "ark-apiserver-admission-policy",
		},
		{
			// Easy to miss: bindings carry the namespaceSelector, so losing this watch alone
			// still leaves the plugin unable to sync.
			name:    "binding watch denied",
			allowed: map[string]bool{"validatingadmissionpolicybindings": false},
			wantErr: "validatingadmissionpolicybindings",
		},
		{
			// The plugin's ready func needs the namespace informer too.
			name:    "namespace watch denied",
			allowed: map[string]bool{"namespaces": false},
			wantErr: "namespaces",
		},
		{
			name:    "review call failing is reported, not treated as allowed",
			apiErr:  errors.New("connection refused"),
			wantErr: "could not verify permission",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			cs := fake.NewSimpleClientset()
			cs.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
				if tc.apiErr != nil {
					return true, nil, tc.apiErr
				}
				review := action.(k8stesting.CreateAction).GetObject().(*authorizationv1.SelfSubjectAccessReview)
				allowed, ok := tc.allowed[review.Spec.ResourceAttributes.Resource]
				review.Status.Allowed = !ok || allowed
				return true, review, nil
			})

			err := checkWatchPermissions(context.Background(), cs.AuthorizationV1(), policyWatchResources, "ark-apiserver-admission-policy")
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("expected the preflight to pass, got: %v", err)
				}
				return
			}
			if err == nil {
				t.Fatal("expected the preflight to fail")
			}
			if !strings.Contains(err.Error(), tc.wantErr) {
				t.Errorf("error should mention %q, got: %v", tc.wantErr, err)
			}
		})
	}
}

// A missing ClusterRoleBinding must land on the documented best-effort fallback rather than
// leaving the plugin's informers unable to sync, which upstream turns into a 10s stall and a
// Forbidden on every write.
func TestApplyAdmission_MissingWatchRBACFallsBack(t *testing.T) {
	t.Parallel()

	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.Contains(r.URL.Path, "selfsubjectaccessreviews") {
			_, _ = w.Write([]byte(`{"kind":"SelfSubjectAccessReview","apiVersion":"authorization.k8s.io/v1",` +
				`"status":{"allowed":false,"reason":"no RBAC policy matched"}}`))
			return
		}
		_, _ = w.Write([]byte(`{"kind":"APIResourceList","groupVersion":"admissionregistration.k8s.io/v1",` +
			`"resources":[{"name":"validatingadmissionpolicies","namespaced":false,"kind":"ValidatingAdmissionPolicy","verbs":["list","watch"]}]}`))
	}))
	defer srv.Close()

	restCfg := &clientrest.Config{
		Host:            srv.URL,
		TLSClientConfig: clientrest.TLSClientConfig{Insecure: true},
	}

	s := &Server{config: Config{RestConfig: restCfg}}
	cfg := genericapiserver.NewConfig(Codecs)
	inf, err := s.applyAdmission(context.Background(), cfg)
	if err != nil {
		t.Fatalf("best-effort mode should not fail startup on missing watch RBAC: %v", err)
	}
	if inf != nil {
		t.Error("expected a nil informer factory when the watches cannot be granted")
	}
	if cfg.AdmissionControl != nil {
		t.Error("expected no admission chain, since its informers could never sync")
	}

	required := &Server{config: Config{RestConfig: restCfg, PolicyRequired: true}}
	_, err = required.applyAdmission(context.Background(), genericapiserver.NewConfig(Codecs))
	if err == nil {
		t.Fatal("expected startup to fail on missing watch RBAC when policy is required")
	}
	if !strings.Contains(err.Error(), "required") {
		t.Errorf("error should say policy enforcement was required, got: %v", err)
	}
}

func TestNew_Defaults(t *testing.T) {
	t.Parallel()

	s := New(Config{})
	if s.config.BindPort != 6443 {
		t.Errorf("BindPort = %d, want 6443", s.config.BindPort)
	}
	if s.config.AuthMode != AuthModeDelegated {
		t.Errorf("AuthMode = %q, want %q", s.config.AuthMode, AuthModeDelegated)
	}
}

func TestServer_LeaderElectionSplit(t *testing.T) {
	t.Parallel()

	s := New(Config{})
	if s.NeedLeaderElection() {
		t.Error("Server must serve on every replica: NeedLeaderElection() = true, want false")
	}
	if !s.WALConsumer().NeedLeaderElection() {
		t.Error("WAL consumer must be single-instance: NeedLeaderElection() = false, want true")
	}
}

func TestWALConsumer_StopsWhenBackendNeverReady(t *testing.T) {
	t.Parallel()

	s := New(Config{})
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- s.WALConsumer().Start(ctx) }()
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Errorf("Start() = %v, want nil", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("WAL consumer runnable did not stop on context cancellation")
	}
}

func TestWALConsumer_StartsWhenBackendReady(t *testing.T) {
	t.Parallel()

	ready := make(chan struct{})
	started := make(chan struct{})
	w := &walConsumer{ready: ready, start: func() { close(started) }}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- w.Start(ctx) }()

	close(ready)
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("StartWALConsumer was not called after backend became ready")
	}

	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Errorf("Start() = %v, want nil", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("WAL consumer runnable did not stop after context cancellation")
	}
}

func TestServer_Start_InvalidAuthMode(t *testing.T) {
	t.Parallel()

	s := New(Config{AuthMode: "bogus"})
	err := s.Start(context.Background())
	if err == nil {
		t.Fatal("expected error for invalid auth mode")
	}
	if !strings.Contains(err.Error(), "auth mode") {
		t.Errorf("error = %q, want mention of auth mode", err.Error())
	}
}

func TestServer_Start_PostgresUnreachable(t *testing.T) {
	t.Parallel()

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	_ = ln.Close()

	s := New(Config{
		PostgresHost:    "127.0.0.1",
		PostgresPort:    port,
		PostgresDB:      "ark",
		PostgresUser:    "ark",
		PostgresPass:    "secret",
		PostgresSSLRoot: "/etc/ark/postgres-tls/ca.crt",
		PostgresSSLCert: "/etc/ark/postgres-tls/tls.crt",
		PostgresSSLKey:  "/etc/ark/postgres-tls/tls.key",
	})
	err = s.Start(context.Background())
	if err == nil {
		t.Fatal("expected error for unreachable postgres")
	}
	if !strings.Contains(err.Error(), "PostgreSQL backend") {
		t.Errorf("error = %q, want PostgreSQL backend failure", err.Error())
	}
}

func TestScheme_InternalVersionsRegistered(t *testing.T) {
	t.Parallel()

	internalGV := schema.GroupVersion{Group: arkv1alpha1.GroupVersion.Group, Version: runtime.APIVersionInternal}

	tests := []struct {
		name string
		obj  runtime.Object
	}{
		{"Agent", &arkv1alpha1.Agent{}},
		{"AgentList", &arkv1alpha1.AgentList{}},
		{"Team", &arkv1alpha1.Team{}},
		{"TeamList", &arkv1alpha1.TeamList{}},
		{"Query", &arkv1alpha1.Query{}},
		{"QueryList", &arkv1alpha1.QueryList{}},
		{"Model", &arkv1alpha1.Model{}},
		{"ModelList", &arkv1alpha1.ModelList{}},
		{"Tool", &arkv1alpha1.Tool{}},
		{"ToolList", &arkv1alpha1.ToolList{}},
		{"MCPServer", &arkv1alpha1.MCPServer{}},
		{"MCPServerList", &arkv1alpha1.MCPServerList{}},
		{"Memory", &arkv1alpha1.Memory{}},
		{"MemoryList", &arkv1alpha1.MemoryList{}},
		{"A2ATask", &arkv1alpha1.A2ATask{}},
		{"A2ATaskList", &arkv1alpha1.A2ATaskList{}},
		{"ArkConfig", &arkv1alpha1.ArkConfig{}},
		{"ArkConfigList", &arkv1alpha1.ArkConfigList{}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gvks, _, err := Scheme.ObjectKinds(tt.obj)
			if err != nil {
				t.Fatalf("ObjectKinds() error = %v", err)
			}

			foundInternal := false
			for _, gvk := range gvks {
				if gvk.GroupVersion() == internalGV {
					foundInternal = true
					break
				}
			}

			if !foundInternal {
				t.Errorf("internal version not registered for %s, got GVKs: %v", tt.name, gvks)
			}
		})
	}
}

func TestScheme_InternalVersionsRegistered_PreAlpha(t *testing.T) {
	t.Parallel()

	internalGV := schema.GroupVersion{Group: arkv1alpha1.GroupVersion.Group, Version: runtime.APIVersionInternal}

	tests := []struct {
		name string
		obj  runtime.Object
	}{
		{"A2AServer", &arkv1prealpha1.A2AServer{}},
		{"A2AServerList", &arkv1prealpha1.A2AServerList{}},
		{"ExecutionEngine", &arkv1prealpha1.ExecutionEngine{}},
		{"ExecutionEngineList", &arkv1prealpha1.ExecutionEngineList{}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gvks, _, err := Scheme.ObjectKinds(tt.obj)
			if err != nil {
				t.Fatalf("ObjectKinds() error = %v", err)
			}

			foundInternal := false
			for _, gvk := range gvks {
				if gvk.GroupVersion() == internalGV {
					foundInternal = true
					break
				}
			}

			if !foundInternal {
				t.Errorf("internal version not registered for %s, got GVKs: %v", tt.name, gvks)
			}
		})
	}
}

func TestScheme_CanCreateInternalVersionObjects(t *testing.T) {
	t.Parallel()

	internalGV := schema.GroupVersion{Group: arkv1alpha1.GroupVersion.Group, Version: runtime.APIVersionInternal}

	tests := []struct {
		kind string
		gvk  schema.GroupVersionKind
	}{
		{"Agent", internalGV.WithKind("Agent")},
		{"Team", internalGV.WithKind("Team")},
		{"Query", internalGV.WithKind("Query")},
		{"Model", internalGV.WithKind("Model")},
		{"A2AServer", internalGV.WithKind("A2AServer")},
		{"ExecutionEngine", internalGV.WithKind("ExecutionEngine")},
	}

	for _, tt := range tests {
		t.Run(tt.kind, func(t *testing.T) {
			obj, err := Scheme.New(tt.gvk)
			if err != nil {
				t.Fatalf("Scheme.New() for internal version error = %v", err)
			}
			if obj == nil {
				t.Error("expected non-nil object")
			}
		})
	}
}

func applyStrategicMergePatch(t *testing.T, original runtime.Object, patchBytes []byte) runtime.Object {
	t.Helper()

	originalJSON, err := runtime.Encode(Codecs.LegacyCodec(arkv1alpha1.GroupVersion), original)
	if err != nil {
		t.Fatalf("failed to encode original: %v", err)
	}

	patchedJSON, err := strategicpatch.StrategicMergePatch(originalJSON, patchBytes, original)
	if err != nil {
		t.Fatalf("StrategicMergePatch() error = %v", err)
	}

	patched, err := runtime.Decode(Codecs.UniversalDecoder(arkv1alpha1.GroupVersion), patchedJSON)
	if err != nil {
		t.Fatalf("failed to decode patched object: %v", err)
	}

	return patched
}

func verifyInternalVersionRegistered(t *testing.T, obj runtime.Object) {
	t.Helper()

	internalGV := schema.GroupVersion{Group: arkv1alpha1.GroupVersion.Group, Version: runtime.APIVersionInternal}

	gvks, _, err := Scheme.ObjectKinds(obj)
	if err != nil {
		t.Fatalf("ObjectKinds() error = %v", err)
	}

	for _, gvk := range gvks {
		if gvk.Group == internalGV.Group && gvk.Version == runtime.APIVersionInternal {
			return
		}
	}

	t.Errorf("internal version not recognized after patch, got GVKs: %v", gvks)
}

func TestScheme_StrategicMergePatch(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		original     runtime.Object
		patchBytes   []byte
		validateFunc func(t *testing.T, patched runtime.Object)
	}{
		{
			name: "Agent patch with null resourceVersion",
			original: &arkv1alpha1.Agent{
				ObjectMeta: metav1.ObjectMeta{
					Name:            "test-agent",
					Namespace:       "default",
					ResourceVersion: "123",
				},
				Spec: arkv1alpha1.AgentSpec{
					Description: "original",
				},
			},
			patchBytes: []byte(`{"spec":{"description":"patched"},"metadata":{"resourceVersion":null}}`),
			validateFunc: func(t *testing.T, patched runtime.Object) {
				agent := patched.(*arkv1alpha1.Agent)
				if agent.Spec.Description != "patched" {
					t.Errorf("expected description 'patched', got '%s'", agent.Spec.Description)
				}
			},
		},
		{
			name: "Model patch with null resourceVersion",
			original: &arkv1alpha1.Model{
				ObjectMeta: metav1.ObjectMeta{
					Name:            "test-model",
					Namespace:       "default",
					ResourceVersion: "456",
				},
				Spec: arkv1alpha1.ModelSpec{
					Provider: "openai",
				},
			},
			patchBytes: []byte(`{"spec":{"provider":"anthropic"},"metadata":{"resourceVersion":null}}`),
			validateFunc: func(t *testing.T, patched runtime.Object) {
				model := patched.(*arkv1alpha1.Model)
				if model.Spec.Provider != "anthropic" {
					t.Errorf("expected provider 'anthropic', got '%s'", model.Spec.Provider)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			patched := applyStrategicMergePatch(t, tt.original, tt.patchBytes)
			verifyInternalVersionRegistered(t, patched)
			tt.validateFunc(t, patched)
		})
	}
}

// A cancelled context must abort the retry loop rather than sit through the remaining delays, and
// must report the cancellation rather than return (false, nil) — which would read as "the host
// does not support policy" and disable enforcement for the life of the process.
func TestDiscoverPolicySupport_ContextCancelled(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	d := &errDiscovery{failures: 99}
	served, err := discoverPolicySupport(ctx, d, 5, time.Hour)
	if err == nil {
		t.Fatal("expected an error when the context is cancelled mid-retry, got nil")
	}
	if !errors.Is(err, context.Canceled) {
		t.Errorf("expected the cancellation to be wrapped, got: %v", err)
	}
	if served {
		t.Error("expected served=false when discovery was cancelled")
	}
	if d.calls != 1 {
		t.Errorf("expected the loop to stop after the first attempt, got %d calls", d.calls)
	}
}

// resolveCELSupport is where "cannot determine support" turns into either a startup failure or a
// process that serves unenforced. Both outcomes are correct for their config and neither may be
// reached by the other's config, so each combination is pinned.
func TestResolveCELSupport(t *testing.T) {
	t.Parallel()

	// Discovery that answers, but from a host that does not serve the resource (pre-1.30).
	unsupported := fake.NewSimpleClientset()
	unsupported.Resources = []*metav1.APIResourceList{{
		GroupVersion: "admissionregistration.k8s.io/v1",
		APIResources: []metav1.APIResource{{Name: "validatingwebhookconfigurations"}},
	}}

	supported := fake.NewSimpleClientset()
	supported.Resources = []*metav1.APIResourceList{{
		GroupVersion: "admissionregistration.k8s.io/v1",
		APIResources: []metav1.APIResource{{Name: "validatingadmissionpolicies"}},
	}}

	cases := []struct {
		name string
		// cancel makes discovery unresolvable, the (false, err) case, without waiting out the
		// real retry delays.
		cancel         bool
		discovery      discovery.DiscoveryInterface
		policyRequired bool
		wantCEL        bool
		wantErr        string
	}{
		{
			name:      "undeterminable and not required falls back to unenforced",
			cancel:    true,
			discovery: &errDiscovery{failures: 99},
			wantCEL:   false,
		},
		{
			// The distinction the retry loop exists to preserve: a failed probe is not a version
			// check, so with policy required it must fail startup rather than guess.
			name:           "undeterminable and required fails startup",
			cancel:         true,
			discovery:      &errDiscovery{failures: 99},
			policyRequired: true,
			wantErr:        "could not be determined",
		},
		{
			name:      "unsupported host and not required falls back to unenforced",
			discovery: unsupported.Discovery(),
			wantCEL:   false,
		},
		{
			name:           "unsupported host and required fails startup",
			discovery:      unsupported.Discovery(),
			policyRequired: true,
			wantErr:        "does not serve ValidatingAdmissionPolicy",
		},
		{
			name:      "supported host enables CEL",
			discovery: supported.Discovery(),
			wantCEL:   true,
		},
		{
			name:           "supported host enables CEL when required",
			discovery:      supported.Discovery(),
			policyRequired: true,
			wantCEL:        true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			if tc.cancel {
				cancel()
			}

			s := &Server{config: Config{PolicyRequired: tc.policyRequired}}
			cel, err := s.resolveCELSupport(ctx, tc.discovery)

			if tc.wantErr != "" {
				assertFailsClosed(t, cel, err, tc.wantErr)
				return
			}
			if err != nil {
				t.Fatalf("expected the apiserver to keep starting, got error: %v", err)
			}
			if cel != tc.wantCEL {
				t.Errorf("cel = %v, want %v", cel, tc.wantCEL)
			}
		})
	}
}

// assertFailsClosed pins the PolicyRequired outcome: a startup error naming the reason, and no
// claim that CEL is enabled alongside it.
func assertFailsClosed(t *testing.T, cel bool, err error, wantErr string) {
	t.Helper()

	if err == nil {
		t.Fatalf("expected startup to fail with %q, got nil", wantErr)
	}
	if !strings.Contains(err.Error(), wantErr) {
		t.Errorf("error = %v, want it to mention %q", err, wantErr)
	}
	if cel {
		t.Error("expected cel=false alongside an error")
	}
}
