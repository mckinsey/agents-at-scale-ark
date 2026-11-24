package completions

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/openai/openai-go"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func terminateCall(arguments string) ToolCall {
	return ToolCall(openai.ChatCompletionMessageToolCall{
		ID: "call-1",
		Function: openai.ChatCompletionMessageToolCallFunction{
			Name:      BuiltinToolTerminate,
			Arguments: arguments,
		},
	})
}

// A terminate call the model made without the optional response argument must
// still end the conversation. Returning a plain error instead surfaced to the
// caller as a failed query (issue #638's sibling, issue #489).
func TestTerminateWithoutResponseStillTerminates(t *testing.T) {
	for _, tc := range []struct {
		name      string
		arguments string
	}{
		{"no arguments", `{}`},
		{"null arguments", `null`},
		{"empty arguments", ``},
		{"unrelated argument", `{"message":"bye"}`},
		{"malformed arguments", `not json`},
		{"non-string response", `{"response":42}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			result, err := (&TerminateExecutor{}).Execute(context.Background(), terminateCall(tc.arguments))

			if !IsTerminateTeam(err) {
				t.Fatalf("expected a TerminateTeam signal, got %v", err)
			}
			if result.Error != "" {
				t.Errorf("expected no tool error, got %q", result.Error)
			}
		})
	}
}

func TestTerminateWithResponsePassesItThrough(t *testing.T) {
	result, err := (&TerminateExecutor{}).Execute(
		context.Background(),
		terminateCall(`{"response":"all done"}`),
	)

	if !IsTerminateTeam(err) {
		t.Fatalf("expected a TerminateTeam signal, got %v", err)
	}
	if result.Content != "all done" {
		t.Errorf("expected the response as content, got %q", result.Content)
	}
	if result.ID != "call-1" || result.Name != BuiltinToolTerminate {
		t.Errorf("expected the call echoed back, got id=%q name=%q", result.ID, result.Name)
	}
}

// A builtin terminate Tool created without an inputSchema used to advertise no
// arguments at all, so the model had nothing to send and every call arrived
// empty. It now falls back to the canonical builtin definition.
func TestBuiltinTerminateToolWithoutInputSchemaFallsBackToTheBuiltinSchema(t *testing.T) {
	toolCRD := &arkv1alpha1.Tool{
		ObjectMeta: metav1.ObjectMeta{Name: BuiltinToolTerminate, Namespace: "default"},
		Spec: arkv1alpha1.ToolSpec{
			Type:        ToolTypeBuiltin,
			Description: "Terminates the conversation",
			Builtin:     &arkv1alpha1.BuiltinToolRef{Name: BuiltinToolTerminate},
		},
	}

	definition := CreateToolFromCRD(toolCRD)

	properties, ok := definition.Parameters["properties"].(map[string]any)
	if !ok {
		t.Fatalf("expected an object schema, got %#v", definition.Parameters)
	}
	if _, exists := properties["response"]; !exists {
		t.Fatalf("expected the builtin response argument, got %v", properties)
	}
}

// A builtin tool nobody has a canonical definition for keeps the previous
// empty-schema behaviour rather than failing.
func TestUnknownBuiltinToolWithoutInputSchemaKeepsAnEmptySchema(t *testing.T) {
	toolCRD := &arkv1alpha1.Tool{
		ObjectMeta: metav1.ObjectMeta{Name: "not-a-builtin", Namespace: "default"},
		Spec: arkv1alpha1.ToolSpec{
			Type:    ToolTypeBuiltin,
			Builtin: &arkv1alpha1.BuiltinToolRef{Name: "not-a-builtin"},
		},
	}

	definition := CreateToolFromCRD(toolCRD)

	properties, ok := definition.Parameters["properties"].(map[string]any)
	if !ok {
		t.Fatalf("expected an object schema, got %#v", definition.Parameters)
	}
	if len(properties) != 0 {
		t.Fatalf("expected no advertised arguments, got %v", properties)
	}
}

// The shipped sample does declare the argument, so the model is told to send
// it. Both shapes have to terminate.
func TestBuiltinTerminateToolWithInputSchemaAdvertisesResponse(t *testing.T) {
	schema, err := json.Marshal(map[string]any{
		"type": "object",
		"properties": map[string]any{
			"response": map[string]any{"type": "string"},
		},
		"required": []string{"response"},
	})
	if err != nil {
		t.Fatalf("marshalling the schema: %v", err)
	}

	toolCRD := &arkv1alpha1.Tool{
		ObjectMeta: metav1.ObjectMeta{Name: BuiltinToolTerminate, Namespace: "default"},
		Spec: arkv1alpha1.ToolSpec{
			Type:        ToolTypeBuiltin,
			Builtin:     &arkv1alpha1.BuiltinToolRef{Name: BuiltinToolTerminate},
			InputSchema: &runtime.RawExtension{Raw: schema},
		},
	}

	definition := CreateToolFromCRD(toolCRD)

	properties, ok := definition.Parameters["properties"].(map[string]any)
	if !ok {
		t.Fatalf("expected an object schema, got %#v", definition.Parameters)
	}
	if _, exists := properties["response"]; !exists {
		t.Fatalf("expected a response argument, got %v", properties)
	}
}
