package validation

import (
	"context"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/crossns"
)

const (
	tenantA = "tenant-a"
	tenantB = "tenant-b"
)

func allowedNamespaces(value string) map[string]string {
	return map[string]string{crossns.AllowedNamespacesAnnotation: value}
}

func newCrossNamespaceLookup() *mockLookup {
	lookup := newMockLookup()
	lookup.addResource("Agent", tenantA, "ag", &arkv1alpha1.Agent{ObjectMeta: metav1.ObjectMeta{Name: "ag", Namespace: tenantA}})
	lookup.addResource("Model", tenantA, "local", &arkv1alpha1.Model{ObjectMeta: metav1.ObjectMeta{Name: "local", Namespace: tenantA}})
	lookup.addResource("Memory", tenantA, "local", &arkv1alpha1.Memory{ObjectMeta: metav1.ObjectMeta{Name: "local", Namespace: tenantA}})
	for name, annotations := range map[string]map[string]string{
		"closed":   nil,
		"wildcard": allowedNamespaces("*"),
		"listed":   allowedNamespaces("tenant-c, tenant-a"),
		"other":    allowedNamespaces("tenant-c"),
	} {
		lookup.addResource("Model", tenantB, name, &arkv1alpha1.Model{ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: tenantB, Annotations: annotations}})
		lookup.addResource("Memory", tenantB, name, &arkv1alpha1.Memory{ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: tenantB, Annotations: annotations}})
	}
	return lookup
}

func crossNamespaceAgent(modelName, modelNamespace string) *arkv1alpha1.Agent {
	return &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{Name: "xns-agent", Namespace: tenantA},
		Spec: arkv1alpha1.AgentSpec{
			Prompt:   "p",
			ModelRef: &arkv1alpha1.AgentModelRef{Name: modelName, Namespace: modelNamespace},
		},
	}
}

func crossNamespaceQuery(memoryName, memoryNamespace string) *arkv1alpha1.Query {
	return &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "xns-query", Namespace: tenantA},
		Spec: arkv1alpha1.QuerySpec{
			Target: &arkv1alpha1.QueryTarget{Type: TargetTypeAgent, Name: "ag"},
			Memory: &arkv1alpha1.MemoryRef{Name: memoryName, Namespace: memoryNamespace},
		},
	}
}

type crossNamespaceCase struct {
	name      string
	target    string
	namespace string
	wantErr   bool
}

var crossNamespaceCases = []crossNamespaceCase{
	{name: "same namespace implicit", target: "local", namespace: "", wantErr: false},
	{name: "same namespace explicit", target: "local", namespace: tenantA},
	{name: "other namespace without annotation", target: "closed", namespace: tenantB, wantErr: true},
	{name: "other namespace with wildcard", target: "wildcard", namespace: tenantB},
	{name: "other namespace listing the source", target: "listed", namespace: tenantB},
	{name: "other namespace listing different namespaces", target: "other", namespace: tenantB, wantErr: true},
	{name: "other namespace target missing", target: "missing", namespace: tenantB, wantErr: true},
}

func TestValidateAgentCrossNamespaceModelRef(t *testing.T) {
	v := NewValidator(newCrossNamespaceLookup())
	for _, tc := range crossNamespaceCases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := v.ValidateAgent(context.Background(), crossNamespaceAgent(tc.target, tc.namespace))
			assertCrossNamespaceResult(t, err, tc, "Model")
		})
	}
}

func TestValidateQueryCrossNamespaceMemory(t *testing.T) {
	v := NewValidator(newCrossNamespaceLookup())
	for _, tc := range crossNamespaceCases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := v.ValidateQuery(context.Background(), crossNamespaceQuery(tc.target, tc.namespace))
			assertCrossNamespaceResult(t, err, tc, "Memory")
		})
	}
}

func assertCrossNamespaceResult(t *testing.T, err error, tc crossNamespaceCase, kind string) {
	t.Helper()
	if !tc.wantErr {
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		return
	}
	if err == nil {
		t.Fatal("expected the reference to be rejected")
	}
	want := crossns.DeniedError(kind, tc.namespace, tc.target, tenantA).Error()
	if err.Error() != want {
		t.Fatalf("error = %q, want %q", err.Error(), want)
	}
}

func TestCrossNamespaceRejectionSameForMissingTarget(t *testing.T) {
	v := NewValidator(newCrossNamespaceLookup())
	ctx := context.Background()

	_, closedModel := v.ValidateAgent(ctx, crossNamespaceAgent("closed", tenantB))
	_, missingModel := v.ValidateAgent(ctx, crossNamespaceAgent("closed-missing", tenantB))
	if closedModel == nil || missingModel == nil {
		t.Fatal("expected both references to be rejected")
	}
	if closedModel.Error() != crossns.DeniedError("Model", tenantB, "closed", tenantA).Error() ||
		missingModel.Error() != crossns.DeniedError("Model", tenantB, "closed-missing", tenantA).Error() {
		t.Fatalf("messages differ from the neutral form: %q / %q", closedModel, missingModel)
	}
}

func TestCrossNamespaceRefCheckedOnUpdateOnlyWhenChanged(t *testing.T) {
	v := NewValidator(newCrossNamespaceLookup())
	wv := &WebhookValidator[runtime.Object]{V: v}
	ctx := context.Background()

	t.Run("agent with unchanged modelRef is not rechecked", func(t *testing.T) {
		oldAgent := crossNamespaceAgent("closed", tenantB)
		newAgent := oldAgent.DeepCopy()
		newAgent.Labels = map[string]string{"touched": "true"}
		if _, err := wv.ValidateUpdate(ctx, oldAgent, newAgent); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("agent changing modelRef to a closed model is rejected", func(t *testing.T) {
		oldAgent := crossNamespaceAgent("local", "")
		newAgent := crossNamespaceAgent("closed", tenantB)
		if _, err := wv.ValidateUpdate(ctx, oldAgent, newAgent); err == nil {
			t.Fatal("expected the changed reference to be rejected")
		}
	})

	t.Run("agent changing only the modelRef namespace is rejected", func(t *testing.T) {
		oldAgent := crossNamespaceAgent("local", "")
		newAgent := crossNamespaceAgent("local", tenantB)
		if _, err := wv.ValidateUpdate(ctx, oldAgent, newAgent); err == nil {
			t.Fatal("expected the changed reference to be rejected")
		}
	})

	t.Run("query with unchanged memory is not rechecked", func(t *testing.T) {
		oldQuery := crossNamespaceQuery("closed", tenantB)
		newQuery := oldQuery.DeepCopy()
		newQuery.Labels = map[string]string{"touched": "true"}
		if _, err := wv.ValidateUpdate(ctx, oldQuery, newQuery); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("query changing memory to a closed memory is rejected", func(t *testing.T) {
		oldQuery := crossNamespaceQuery("local", "")
		newQuery := crossNamespaceQuery("closed", tenantB)
		if _, err := wv.ValidateUpdate(ctx, oldQuery, newQuery); err == nil {
			t.Fatal("expected the changed reference to be rejected")
		}
	})

	t.Run("create is always checked", func(t *testing.T) {
		if _, err := wv.ValidateCreate(ctx, crossNamespaceAgent("closed", tenantB)); err == nil {
			t.Fatal("expected the reference to be rejected on create")
		}
	})
}

func TestCrossNamespaceRefCheckedWhileDeleting(t *testing.T) {
	v := NewValidator(newCrossNamespaceLookup())
	wv := &WebhookValidator[runtime.Object]{V: v}
	ctx := context.Background()
	now := metav1.Now()

	agent := crossNamespaceAgent("closed", tenantB)
	agent.DeletionTimestamp = &now
	if _, err := v.ValidateAgent(ctx, agent); err == nil {
		t.Fatal("expected a terminating agent with a closed reference to be rejected")
	}

	query := crossNamespaceQuery("closed", tenantB)
	query.DeletionTimestamp = &now
	if _, err := v.ValidateQuery(ctx, query); err == nil {
		t.Fatal("expected a terminating query with a closed reference to be rejected")
	}

	oldAgent := crossNamespaceAgent("closed", tenantB)
	oldAgent.DeletionTimestamp = &now
	oldAgent.Finalizers = []string{"example.com/hold"}
	newAgent := oldAgent.DeepCopy()
	newAgent.Finalizers = nil
	if _, err := wv.ValidateUpdate(ctx, oldAgent, newAgent); err != nil {
		t.Fatalf("finalizer removal with an unchanged reference must be accepted: %v", err)
	}

	oldQuery := crossNamespaceQuery("closed", tenantB)
	oldQuery.DeletionTimestamp = &now
	oldQuery.Finalizers = []string{"example.com/hold"}
	newQuery := oldQuery.DeepCopy()
	newQuery.Finalizers = nil
	if _, err := wv.ValidateUpdate(ctx, oldQuery, newQuery); err != nil {
		t.Fatalf("finalizer removal with an unchanged reference must be accepted: %v", err)
	}
}

func TestValidateAgentWithoutModelRefSkipsCrossNamespaceCheck(t *testing.T) {
	v := NewValidator(newCrossNamespaceLookup())
	agent := crossNamespaceAgent("x", "")
	agent.Spec.ModelRef = nil
	if _, err := v.ValidateAgent(context.Background(), agent); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}
