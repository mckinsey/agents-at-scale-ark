//nolint:goconst
package validation

import (
	"context"
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestValidateMCPServer(t *testing.T) {
	lookup := newMockLookup()
	v := NewValidator(lookup)
	ctx := context.Background()

	t.Run("valid mcpserver with direct address", func(t *testing.T) {
		mcp := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address: arkv1alpha1.ValueSource{Value: "http://localhost:8080"},
			},
		}
		_, err := v.ValidateMCPServer(ctx, mcp)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects unresolvable address", func(t *testing.T) {
		mcp := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address: arkv1alpha1.ValueSource{},
			},
		}
		_, err := v.ValidateMCPServer(ctx, mcp)
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("validates headers", func(t *testing.T) {
		mcp := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address: arkv1alpha1.ValueSource{Value: "http://localhost"},
				Headers: []arkv1alpha1.Header{{Name: "", Value: arkv1alpha1.HeaderValue{Value: "v"}}},
			},
		}
		_, err := v.ValidateMCPServer(ctx, mcp)
		if err == nil {
			t.Fatal("expected error for header without name")
		}
	})

	t.Run("rejects negative poll interval", func(t *testing.T) {
		mcp := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address:      arkv1alpha1.ValueSource{Value: "http://localhost"},
				PollInterval: &metav1.Duration{Duration: -1 * time.Second},
			},
		}
		_, err := v.ValidateMCPServer(ctx, mcp)
		if err == nil {
			t.Fatal("expected error for negative poll interval")
		}
	})
}
