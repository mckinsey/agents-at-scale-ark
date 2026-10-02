package validation

import (
	"context"
	"testing"
	"time"

	admissionv1 "k8s.io/api/admission/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"sigs.k8s.io/controller-runtime/pkg/webhook/admission"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func newScheme(t *testing.T) *runtime.Scheme {
	t.Helper()
	s := runtime.NewScheme()
	if err := arkv1alpha1.AddToScheme(s); err != nil {
		t.Fatalf("AddToScheme: %v", err)
	}
	return s
}

// newTestLookup wires the production lookup over a fake client, so the
// defaulting tests exercise the same ArkConfig and Memory reads the webhook
// does. Seed it with the ArkConfig singleton, Memory objects, or neither.
func newTestLookup(t *testing.T, objs ...client.Object) *WebhookLookup {
	t.Helper()
	return &WebhookLookup{
		Client: fake.NewClientBuilder().WithScheme(newScheme(t)).WithObjects(objs...).Build(),
	}
}

func arkConfigWithTTL(d time.Duration) *arkv1alpha1.ArkConfig {
	return &arkv1alpha1.ArkConfig{
		ObjectMeta: metav1.ObjectMeta{Name: ArkConfigSingletonName},
		Spec:       arkv1alpha1.ArkConfigSpec{QueryTTL: &metav1.Duration{Duration: d}},
	}
}

func arkConfigWithDefaultMemory(name string) *arkv1alpha1.ArkConfig {
	return &arkv1alpha1.ArkConfig{
		ObjectMeta: metav1.ObjectMeta{Name: ArkConfigSingletonName},
		Spec:       arkv1alpha1.ArkConfigSpec{DefaultMemory: &arkv1alpha1.MemoryRef{Name: name}},
	}
}

const (
	tenantNamespace      = "team-a"
	otherTenantNamespace = "team-b"
	brokerMemoryName     = "default"
)

// brokerMemoryIn is a Memory the controller has already resolved: only a
// resolved address makes it usable, so only that shape may be injected.
func brokerMemoryIn(namespace string) *arkv1alpha1.Memory {
	address := "http://ark-broker." + namespace + ".svc.cluster.local:8080"
	return &arkv1alpha1.Memory{
		ObjectMeta: metav1.ObjectMeta{Name: brokerMemoryName, Namespace: namespace},
		Status:     arkv1alpha1.MemoryStatus{LastResolvedAddress: &address},
	}
}

// unresolvedMemoryIn is the shape the Memory controller leaves behind when
// address resolution fails: the object exists, but naming it would fail every
// query in the namespace.
func unresolvedMemoryIn(namespace string) *arkv1alpha1.Memory {
	return &arkv1alpha1.Memory{
		ObjectMeta: metav1.ObjectMeta{Name: brokerMemoryName, Namespace: namespace},
	}
}

func createAdmissionContext() context.Context {
	return admission.NewContextWithRequest(context.Background(), admission.Request{
		AdmissionRequest: admissionv1.AdmissionRequest{Operation: admissionv1.Create},
	})
}

func updateAdmissionContext() context.Context {
	return admission.NewContextWithRequest(context.Background(), admission.Request{
		AdmissionRequest: admissionv1.AdmissionRequest{Operation: admissionv1.Update},
	})
}

func queryIn(namespace string) *arkv1alpha1.Query {
	return &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: namespace},
	}
}

func TestResolveQueryTTL_FallbackWhenArkConfigMissing(t *testing.T) {
	got := ResolveQueryTTL(context.Background(), newTestLookup(t))
	if got.Duration != DefaultTTLFallback {
		t.Fatalf("want %v, got %v", DefaultTTLFallback, got.Duration)
	}
}

func TestResolveQueryTTL_UsesArkConfigValue(t *testing.T) {
	lookup := newTestLookup(t, arkConfigWithTTL(2*time.Hour))
	got := ResolveQueryTTL(context.Background(), lookup)
	if got.Duration != 2*time.Hour {
		t.Fatalf("want 2h, got %v", got.Duration)
	}
}

func TestDefaultQuery_InjectsTTLWhenMissing(t *testing.T) {
	lookup := newTestLookup(t, arkConfigWithTTL(time.Hour))

	q := &arkv1alpha1.Query{}
	DefaultQuery(context.Background(), q, lookup)

	if q.Spec.TTL == nil {
		t.Fatalf("expected TTL to be injected")
	}
	if q.Spec.TTL.Duration != time.Hour {
		t.Fatalf("want 1h, got %v", q.Spec.TTL.Duration)
	}
}

func TestDefaultQuery_LeavesExplicitTTLAlone(t *testing.T) {
	lookup := newTestLookup(t, arkConfigWithTTL(time.Hour))

	explicit := metav1.Duration{Duration: 5 * time.Minute}
	q := &arkv1alpha1.Query{}
	q.Spec.TTL = &explicit
	DefaultQuery(context.Background(), q, lookup)

	if q.Spec.TTL.Duration != 5*time.Minute {
		t.Fatalf("webhook clobbered explicit TTL: got %v", q.Spec.TTL.Duration)
	}
}

func TestDefaultQuery_FallbackWhenNoLookup(t *testing.T) {
	q := &arkv1alpha1.Query{}
	DefaultQuery(context.Background(), q, nil)
	if q.Spec.TTL == nil || q.Spec.TTL.Duration != DefaultTTLFallback {
		t.Fatalf("expected 720h fallback, got %v", q.Spec.TTL)
	}
}

func TestResolveDefaultMemory_NilWhenUnconfigured(t *testing.T) {
	t.Run("no lookup", func(t *testing.T) {
		if got := ResolveDefaultMemory(context.Background(), nil); got != nil {
			t.Fatalf("want nil, got %+v", got)
		}
	})

	t.Run("no ArkConfig", func(t *testing.T) {
		if got := ResolveDefaultMemory(context.Background(), newTestLookup(t)); got != nil {
			t.Fatalf("want nil, got %+v", got)
		}
	})

	t.Run("ArkConfig without defaultMemory", func(t *testing.T) {
		lookup := newTestLookup(t, arkConfigWithTTL(time.Hour))
		if got := ResolveDefaultMemory(context.Background(), lookup); got != nil {
			t.Fatalf("want nil, got %+v", got)
		}
	})
}

func TestResolveDefaultMemory_DropsNamespaceAndDoesNotAliasTheCachedConfig(t *testing.T) {
	cfg := arkConfigWithDefaultMemory("shared-memory")
	cfg.Spec.DefaultMemory.Namespace = "other-tenant"
	lookup := newTestLookup(t, cfg)

	got := ResolveDefaultMemory(context.Background(), lookup)
	if got == nil {
		t.Fatal("expected a ref")
	}
	if got.Name != "shared-memory" {
		t.Fatalf("want name shared-memory, got %q", got.Name)
	}
	if got.Namespace != "" {
		t.Fatalf("namespace must be dropped so the Memory resolves in the query namespace, got %q", got.Namespace)
	}

	got.Name = "mutated"
	stored := &arkv1alpha1.ArkConfig{}
	if err := lookup.Client.Get(context.Background(), client.ObjectKey{Name: ArkConfigSingletonName}, stored); err != nil {
		t.Fatalf("re-read ArkConfig: %v", err)
	}
	if stored.Spec.DefaultMemory.Name != "shared-memory" {
		t.Fatalf("mutating the returned ref reached the stored ArkConfig: %q", stored.Spec.DefaultMemory.Name)
	}
}

func TestDefaultQuery_InjectsMemoryWhenItIsResolvableInTheNamespace(t *testing.T) {
	lookup := newTestLookup(
		t,
		arkConfigWithDefaultMemory(brokerMemoryName),
		brokerMemoryIn(tenantNamespace),
	)

	q := queryIn(tenantNamespace)
	DefaultQuery(createAdmissionContext(), q, lookup)

	if q.Spec.Memory == nil {
		t.Fatal("expected spec.memory to be injected")
	}
	if q.Spec.Memory.Name != brokerMemoryName {
		t.Fatalf("want memory name %q, got %q", brokerMemoryName, q.Spec.Memory.Name)
	}
	if q.Spec.Memory.Namespace != "" {
		t.Fatalf("want an empty namespace so it resolves locally, got %q", q.Spec.Memory.Namespace)
	}
}

func TestDefaultQuery_DoesNotInjectMemoryWhenItIsNotUsable(t *testing.T) {
	t.Run("no Memory at all", func(t *testing.T) {
		lookup := newTestLookup(t, arkConfigWithDefaultMemory(brokerMemoryName))

		q := queryIn(tenantNamespace)
		DefaultQuery(createAdmissionContext(), q, lookup)

		if q.Spec.Memory != nil {
			t.Fatalf("injecting an unresolvable ref turns degradation into failing queries: %+v", q.Spec.Memory)
		}
	})

	t.Run("Memory exists in a different namespace", func(t *testing.T) {
		lookup := newTestLookup(
			t,
			arkConfigWithDefaultMemory(brokerMemoryName),
			brokerMemoryIn(otherTenantNamespace),
		)

		q := queryIn(tenantNamespace)
		DefaultQuery(createAdmissionContext(), q, lookup)

		if q.Spec.Memory != nil {
			t.Fatalf("no cross-namespace fallback is allowed: %+v", q.Spec.Memory)
		}
	})

	t.Run("Memory exists under a different name", func(t *testing.T) {
		lookup := newTestLookup(
			t,
			arkConfigWithDefaultMemory("broker-memory"),
			brokerMemoryIn(tenantNamespace),
		)

		q := queryIn(tenantNamespace)
		DefaultQuery(createAdmissionContext(), q, lookup)

		if q.Spec.Memory != nil {
			t.Fatalf("only the configured name may be injected: %+v", q.Spec.Memory)
		}
	})

	t.Run("query with no namespace", func(t *testing.T) {
		lookup := newTestLookup(
			t,
			arkConfigWithDefaultMemory(brokerMemoryName),
			brokerMemoryIn(tenantNamespace),
		)

		q := queryIn("")
		DefaultQuery(createAdmissionContext(), q, lookup)

		if q.Spec.Memory != nil {
			t.Fatalf("want no injection without a namespace to resolve in: %+v", q.Spec.Memory)
		}
	})

	t.Run("Memory exists but never resolved an address", func(t *testing.T) {
		lookup := newTestLookup(
			t,
			arkConfigWithDefaultMemory(brokerMemoryName),
			unresolvedMemoryIn(tenantNamespace),
		)

		q := queryIn(tenantNamespace)
		DefaultQuery(createAdmissionContext(), q, lookup)

		if q.Spec.Memory != nil {
			t.Fatalf("naming a Memory with no lastResolvedAddress fails every query in the namespace: %+v", q.Spec.Memory)
		}
	})

	t.Run("update rather than create", func(t *testing.T) {
		lookup := newTestLookup(
			t,
			arkConfigWithDefaultMemory(brokerMemoryName),
			brokerMemoryIn(tenantNamespace),
		)

		q := queryIn(tenantNamespace)
		DefaultQuery(updateAdmissionContext(), q, lookup)

		if q.Spec.Memory != nil {
			t.Fatalf("a query that ran without a memory must not be stamped with one later: %+v", q.Spec.Memory)
		}
		if q.Spec.TTL == nil {
			t.Fatal("only the memory rule is create-only; TTL defaulting still applies on update")
		}
	})

	t.Run("no admission request in context", func(t *testing.T) {
		lookup := newTestLookup(
			t,
			arkConfigWithDefaultMemory(brokerMemoryName),
			brokerMemoryIn(tenantNamespace),
		)

		q := queryIn(tenantNamespace)
		DefaultQuery(context.Background(), q, lookup)

		if q.Spec.Memory != nil {
			t.Fatalf("want no injection outside an admission CREATE: %+v", q.Spec.Memory)
		}
	})
}

func TestDefaultQuery_LeavesExplicitMemoryAlone(t *testing.T) {
	lookup := newTestLookup(
		t,
		arkConfigWithDefaultMemory(brokerMemoryName),
		brokerMemoryIn(tenantNamespace),
	)

	q := queryIn(tenantNamespace)
	q.Spec.Memory = &arkv1alpha1.MemoryRef{Name: "chosen-by-hand"}
	DefaultQuery(createAdmissionContext(), q, lookup)

	if q.Spec.Memory.Name != "chosen-by-hand" {
		t.Fatalf("webhook clobbered an explicit memory: %q", q.Spec.Memory.Name)
	}
}

func TestDefaultQuery_NoMemoryWithoutLookup(t *testing.T) {
	q := queryIn(tenantNamespace)
	DefaultQuery(context.Background(), q, nil)

	if q.Spec.Memory != nil {
		t.Fatalf("want no injection without a lookup: %+v", q.Spec.Memory)
	}
}
