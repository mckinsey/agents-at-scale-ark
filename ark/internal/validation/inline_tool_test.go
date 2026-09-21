package validation

import (
	"encoding/json"
	"strings"
	"testing"

	"k8s.io/apimachinery/pkg/runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func inlineTool(source, language string) *arkv1alpha1.Tool {
	return &arkv1alpha1.Tool{
		Spec: arkv1alpha1.ToolSpec{
			Type:   ToolTypeInline,
			Inline: &arkv1alpha1.InlineSpec{Source: source, Language: language},
		},
	}
}

func TestValidateInlineTool(t *testing.T) {
	t.Run("accepts a minimal inline tool", func(t *testing.T) {
		tool := inlineTool("print('hi')", "python")
		tool.Spec.InputSchema = &runtime.RawExtension{Raw: json.RawMessage(`{"type":"object"}`)}
		if _, err := ValidateTool(tool); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("accepts an omitted input schema", func(t *testing.T) {
		if _, err := ValidateTool(inlineTool("echo hi", "bash")); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects a missing inline block", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{Spec: arkv1alpha1.ToolSpec{Type: ToolTypeInline}}
		requireErrorContains(t, tool, "inline spec is required")
	})

	for _, source := range []string{"", "   ", "\n\t "} {
		t.Run("rejects whitespace-only source", func(t *testing.T) {
			requireErrorContains(t, inlineTool(source, "python"), "inline source is required")
		})
	}

	t.Run("rejects a missing language", func(t *testing.T) {
		requireErrorContains(t, inlineTool("print(1)", ""), "inline language is required")
	})

	t.Run("rejects an unsupported language", func(t *testing.T) {
		requireErrorContains(t, inlineTool("print(1)", "ruby"), "unsupported inline language")
	})

	for _, language := range InlineLanguages {
		t.Run("accepts language "+language, func(t *testing.T) {
			if _, err := ValidateTool(inlineTool("x", language)); err != nil {
				t.Fatalf("unexpected error for %s: %v", language, err)
			}
		})
	}

	t.Run("accepts source of exactly the byte limit", func(t *testing.T) {
		if _, err := ValidateTool(inlineTool(strings.Repeat("a", MaxInlineSourceBytes), "bash")); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects source one byte over the limit", func(t *testing.T) {
		requireErrorContains(t, inlineTool(strings.Repeat("a", MaxInlineSourceBytes+1), "bash"), "exceeding the 65536 byte limit")
	})

	t.Run("counts multibyte characters as bytes", func(t *testing.T) {
		// Well under the limit in characters, over it in UTF-8 bytes: the CRD's
		// maxLength counts characters, which is why this check exists here.
		source := strings.Repeat("\u00e9", MaxInlineSourceBytes/2+1)
		if len([]rune(source)) > MaxInlineSourceBytes {
			t.Fatalf("fixture is not under the character limit")
		}
		requireErrorContains(t, inlineTool(source, "bash"), "exceeding the 65536 byte limit")
	})

	t.Run("rejects a non-object input schema", func(t *testing.T) {
		tool := inlineTool("x", "bash")
		tool.Spec.InputSchema = &runtime.RawExtension{Raw: json.RawMessage(`{"type":"array"}`)}
		requireErrorContains(t, tool, "must describe a JSON object")
	})

	t.Run("rejects other subtype configuration on an inline tool", func(t *testing.T) {
		tool := inlineTool("x", "bash")
		tool.Spec.HTTP = &arkv1alpha1.HTTPSpec{URL: "https://example.com"}
		requireErrorContains(t, tool, "must not set spec.http")
	})

	t.Run("rejects spec.inline on a non-inline tool", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{Spec: arkv1alpha1.ToolSpec{
			Type:   ToolTypeHTTP,
			HTTP:   &arkv1alpha1.HTTPSpec{URL: "https://example.com"},
			Inline: &arkv1alpha1.InlineSpec{Source: "x", Language: "bash"},
		}}
		requireErrorContains(t, tool, "spec.inline is only valid for inline type tools")
	})
}

func TestValidateToolTransition(t *testing.T) {
	http := &arkv1alpha1.Tool{Spec: arkv1alpha1.ToolSpec{Type: ToolTypeHTTP}}
	inline := inlineTool("x", "bash")

	t.Run("allows an unchanged type", func(t *testing.T) {
		if err := ValidateToolTransition(inline, inlineTool("y", "python")); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("allows a change between non-inline types", func(t *testing.T) {
		agent := &arkv1alpha1.Tool{Spec: arkv1alpha1.ToolSpec{Type: ToolTypeAgent}}
		if err := ValidateToolTransition(http, agent); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects conversion into inline", func(t *testing.T) {
		err := ValidateToolTransition(http, inline)
		if err == nil || !strings.Contains(err.Error(), "delete and recreate") {
			t.Fatalf("expected delete/recreate guidance, got %v", err)
		}
	})

	t.Run("rejects conversion out of inline", func(t *testing.T) {
		if err := ValidateToolTransition(inline, http); err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("ignores non-Tool objects", func(t *testing.T) {
		if err := ValidateTransition(&arkv1alpha1.Agent{}, &arkv1alpha1.Agent{}); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func requireErrorContains(t *testing.T, tool *arkv1alpha1.Tool, want string) {
	t.Helper()
	_, err := ValidateTool(tool)
	if err == nil {
		t.Fatalf("expected an error containing %q", want)
	}
	if !strings.Contains(err.Error(), want) {
		t.Fatalf("expected an error containing %q, got %q", want, err.Error())
	}
}
