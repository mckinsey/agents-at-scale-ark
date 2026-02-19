//nolint:goconst
package validation

import (
	"context"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/genai"
)

func TestValidateExecutionEngine(t *testing.T) {
	lookup := newMockLookup()
	v := NewValidator(lookup)
	ctx := context.Background()

	t.Run("valid execution engine", func(t *testing.T) {
		ee := &arkv1prealpha1.ExecutionEngine{
			ObjectMeta: metav1.ObjectMeta{Name: "langchain", Namespace: "default"},
			Spec: arkv1prealpha1.ExecutionEngineSpec{
				Address: arkv1prealpha1.ValueSource{Value: "http://localhost:9090"},
			},
		}
		_, err := v.ValidateExecutionEngine(ctx, ee)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects reserved a2a name", func(t *testing.T) {
		ee := &arkv1prealpha1.ExecutionEngine{
			ObjectMeta: metav1.ObjectMeta{Name: genai.ExecutionEngineA2A, Namespace: "default"},
			Spec: arkv1prealpha1.ExecutionEngineSpec{
				Address: arkv1prealpha1.ValueSource{Value: "http://localhost:9090"},
			},
		}
		_, err := v.ValidateExecutionEngine(ctx, ee)
		if err == nil {
			t.Fatal("expected error for reserved a2a name")
		}
	})

	t.Run("address with serviceRef", func(t *testing.T) {
		ee := &arkv1prealpha1.ExecutionEngine{
			ObjectMeta: metav1.ObjectMeta{Name: "langchain", Namespace: "default"},
			Spec: arkv1prealpha1.ExecutionEngineSpec{
				Address: arkv1prealpha1.ValueSource{
					ValueFrom: &arkv1prealpha1.ValueFromSource{
						ServiceRef: &arkv1prealpha1.ServiceReference{
							Name: "executor-svc",
							Port: "8080",
							Path: "/execute",
						},
					},
				},
			},
		}
		_, err := v.ValidateExecutionEngine(ctx, ee)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects unresolvable address", func(t *testing.T) {
		ee := &arkv1prealpha1.ExecutionEngine{
			ObjectMeta: metav1.ObjectMeta{Name: "langchain", Namespace: "default"},
			Spec: arkv1prealpha1.ExecutionEngineSpec{
				Address: arkv1prealpha1.ValueSource{},
			},
		}
		_, err := v.ValidateExecutionEngine(ctx, ee)
		if err == nil {
			t.Fatal("expected error for unresolvable address")
		}
	})
}
