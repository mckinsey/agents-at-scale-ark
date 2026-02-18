package validation

import (
	"encoding/json"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/genai"
)

func TestValidateTool(t *testing.T) { //nolint:gocognit
	t.Run("valid http tool", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			Spec: arkv1alpha1.ToolSpec{
				Type: genai.ToolTypeHTTP,
				HTTP: &arkv1alpha1.HTTPSpec{URL: "https://example.com", Method: "POST"},
			},
		}
		_, err := ValidateTool(tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects http tool without spec", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			Spec: arkv1alpha1.ToolSpec{Type: genai.ToolTypeHTTP},
		}
		_, err := ValidateTool(tool)
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("rejects http tool without url", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			Spec: arkv1alpha1.ToolSpec{
				Type: genai.ToolTypeHTTP,
				HTTP: &arkv1alpha1.HTTPSpec{},
			},
		}
		_, err := ValidateTool(tool)
		if err == nil {
			t.Fatal("expected error for missing URL")
		}
	})

	t.Run("rejects invalid http method", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			Spec: arkv1alpha1.ToolSpec{
				Type: genai.ToolTypeHTTP,
				HTTP: &arkv1alpha1.HTTPSpec{URL: "https://example.com", Method: "INVALID"},
			},
		}
		_, err := ValidateTool(tool)
		if err == nil {
			t.Fatal("expected error for invalid method")
		}
	})

	t.Run("valid mcp tool", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			Spec: arkv1alpha1.ToolSpec{
				Type: genai.ToolTypeMCP,
				MCP: &arkv1alpha1.MCPToolRef{
					MCPServerRef: arkv1alpha1.MCPServerRef{Name: "srv"},
					ToolName:     "tool1",
				},
			},
		}
		_, err := ValidateTool(tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects mcp tool without spec", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			Spec: arkv1alpha1.ToolSpec{Type: genai.ToolTypeMCP},
		}
		_, err := ValidateTool(tool)
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("rejects mcp tool without server name", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			Spec: arkv1alpha1.ToolSpec{
				Type: genai.ToolTypeMCP,
				MCP:  &arkv1alpha1.MCPToolRef{ToolName: "tool1"},
			},
		}
		_, err := ValidateTool(tool)
		if err == nil {
			t.Fatal("expected error for missing server name")
		}
	})

	t.Run("rejects mcp tool without tool name", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			Spec: arkv1alpha1.ToolSpec{
				Type: genai.ToolTypeMCP,
				MCP:  &arkv1alpha1.MCPToolRef{MCPServerRef: arkv1alpha1.MCPServerRef{Name: "srv"}},
			},
		}
		_, err := ValidateTool(tool)
		if err == nil {
			t.Fatal("expected error for missing tool name")
		}
	})

	t.Run("valid agent tool ref", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			Spec: arkv1alpha1.ToolSpec{
				Type:  genai.ToolTypeAgent,
				Agent: &arkv1alpha1.AgentToolRef{Name: "my-agent"},
			},
		}
		_, err := ValidateTool(tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects agent tool without name", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			Spec: arkv1alpha1.ToolSpec{
				Type:  genai.ToolTypeAgent,
				Agent: &arkv1alpha1.AgentToolRef{},
			},
		}
		_, err := ValidateTool(tool)
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("valid team tool ref", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			Spec: arkv1alpha1.ToolSpec{
				Type: genai.ToolTypeTeam,
				Team: &arkv1alpha1.TeamToolRef{Name: "my-team"},
			},
		}
		_, err := ValidateTool(tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects team tool without name", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			Spec: arkv1alpha1.ToolSpec{
				Type: genai.ToolTypeTeam,
				Team: &arkv1alpha1.TeamToolRef{},
			},
		}
		_, err := ValidateTool(tool)
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("valid builtin noop", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			ObjectMeta: metav1.ObjectMeta{Name: "noop"},
			Spec:       arkv1alpha1.ToolSpec{Type: genai.ToolTypeBuiltin},
		}
		_, err := ValidateTool(tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("valid builtin terminate", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			ObjectMeta: metav1.ObjectMeta{Name: "terminate"},
			Spec:       arkv1alpha1.ToolSpec{Type: genai.ToolTypeBuiltin},
		}
		_, err := ValidateTool(tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects unsupported builtin", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			ObjectMeta: metav1.ObjectMeta{Name: "unknown-builtin"},
			Spec:       arkv1alpha1.ToolSpec{Type: genai.ToolTypeBuiltin},
		}
		_, err := ValidateTool(tool)
		if err == nil {
			t.Fatal("expected error for unsupported builtin")
		}
	})

	t.Run("rejects unsupported tool type", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			Spec: arkv1alpha1.ToolSpec{Type: "unknown"},
		}
		_, err := ValidateTool(tool)
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("validates input schema", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			ObjectMeta: metav1.ObjectMeta{Name: "noop"},
			Spec: arkv1alpha1.ToolSpec{
				Type:        genai.ToolTypeBuiltin,
				InputSchema: &runtime.RawExtension{Raw: json.RawMessage(`{"type": "invalid-type"}`)},
			},
		}
		_, err := ValidateTool(tool)
		if err == nil {
			t.Fatal("expected error for invalid schema type")
		}
	})

	t.Run("accepts valid input schema", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			ObjectMeta: metav1.ObjectMeta{Name: "noop"},
			Spec: arkv1alpha1.ToolSpec{
				Type:        genai.ToolTypeBuiltin,
				InputSchema: &runtime.RawExtension{Raw: json.RawMessage(`{"type": "object", "properties": {"name": {"type": "string"}}}`)},
			},
		}
		_, err := ValidateTool(tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}
