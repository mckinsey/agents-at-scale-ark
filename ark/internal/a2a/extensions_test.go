/* Copyright 2025. McKinsey & Company */

package a2a

import (
	"encoding/json"
	"testing"

	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

func TestSetExtension(t *testing.T) {
	t.Run("adds URI to Extensions and payload to Metadata", func(t *testing.T) {
		m := protocol.NewMessage(protocol.MessageRoleAgent, nil)
		SetExtension(&m, "https://example.com/ext/v1", map[string]string{"key": "val"})

		if len(m.Extensions) != 1 || m.Extensions[0] != "https://example.com/ext/v1" {
			t.Fatalf("expected Extensions=[https://example.com/ext/v1], got %v", m.Extensions)
		}
		if m.Metadata["https://example.com/ext/v1"] == nil {
			t.Fatal("expected payload in Metadata")
		}
	})

	t.Run("deduplicates on repeated calls with same URI", func(t *testing.T) {
		m := protocol.NewMessage(protocol.MessageRoleAgent, nil)
		SetExtension(&m, "https://example.com/ext/v1", "first")
		SetExtension(&m, "https://example.com/ext/v1", "second")

		if len(m.Extensions) != 1 {
			t.Fatalf("expected 1 extension entry, got %d", len(m.Extensions))
		}
		if m.Metadata["https://example.com/ext/v1"] != "second" {
			t.Fatalf("expected payload to be updated to 'second', got %v", m.Metadata["https://example.com/ext/v1"])
		}
	})

	t.Run("supports multiple distinct extensions", func(t *testing.T) {
		m := protocol.NewMessage(protocol.MessageRoleAgent, nil)
		SetExtension(&m, "https://example.com/ext-a/v1", "a")
		SetExtension(&m, "https://example.com/ext-b/v1", "b")

		if len(m.Extensions) != 2 {
			t.Fatalf("expected 2 extension entries, got %d", len(m.Extensions))
		}
		if m.Metadata["https://example.com/ext-a/v1"] != "a" {
			t.Fatal("missing ext-a payload")
		}
		if m.Metadata["https://example.com/ext-b/v1"] != "b" {
			t.Fatal("missing ext-b payload")
		}
	})
}

func TestSetMetadata(t *testing.T) {
	t.Run("sets Metadata without modifying Extensions", func(t *testing.T) {
		m := protocol.NewMessage(protocol.MessageRoleAgent, nil)
		SetMetadata(&m, "ark.mckinsey.com/execution-engine", map[string]string{"legacy": "true"})

		if len(m.Extensions) != 0 {
			t.Fatalf("expected empty Extensions, got %v", m.Extensions)
		}
		if m.Metadata["ark.mckinsey.com/execution-engine"] == nil {
			t.Fatal("expected payload in Metadata")
		}
	})

	t.Run("initializes nil Metadata", func(t *testing.T) {
		m := protocol.NewMessage(protocol.MessageRoleAgent, nil)
		m.Metadata = nil
		SetMetadata(&m, "key", "value")

		if m.Metadata["key"] != "value" {
			t.Fatal("expected Metadata to be initialized and set")
		}
	})
}

func TestGetExtension(t *testing.T) {
	t.Run("returns payload for existing extension", func(t *testing.T) {
		m := protocol.NewMessage(protocol.MessageRoleAgent, nil)
		SetExtension(&m, "https://example.com/ext/v1", "payload")

		val, ok := GetExtension(m, "https://example.com/ext/v1")
		if !ok || val != "payload" {
			t.Fatalf("expected (payload, true), got (%v, %v)", val, ok)
		}
	})

	t.Run("returns false for missing extension", func(t *testing.T) {
		m := protocol.NewMessage(protocol.MessageRoleAgent, nil)

		_, ok := GetExtension(m, "https://example.com/missing")
		if ok {
			t.Fatal("expected false for missing extension")
		}
	})

	t.Run("returns false for nil Metadata", func(t *testing.T) {
		m := protocol.NewMessage(protocol.MessageRoleAgent, nil)
		m.Metadata = nil

		_, ok := GetExtension(m, "anything")
		if ok {
			t.Fatal("expected false for nil Metadata")
		}
	})
}

func TestGetExtensionAs(t *testing.T) {
	t.Run("round-trips typed payload", func(t *testing.T) {
		m := protocol.NewMessage(protocol.MessageRoleAgent, nil)
		original := ExecutionResponsePayload{
			ConversationId: "conv-123",
			TokenUsage: &ResponseTokenUsage{
				PromptTokens:     100,
				CompletionTokens: 50,
				TotalTokens:      150,
			},
		}
		SetExtension(&m, ExecutionContextExtensionURI, original)

		result, err := GetExtensionAs[ExecutionResponsePayload](m, ExecutionContextExtensionURI)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.ConversationId != "conv-123" {
			t.Fatalf("expected conv-123, got %s", result.ConversationId)
		}
		if result.TokenUsage == nil || result.TokenUsage.TotalTokens != 150 {
			t.Fatalf("token usage mismatch: %+v", result.TokenUsage)
		}
	})

	t.Run("handles map[string]any from JSON deserialization", func(t *testing.T) {
		m := protocol.NewMessage(protocol.MessageRoleAgent, nil)
		m.Metadata = map[string]any{
			ExecutionContextExtensionURI: map[string]any{
				"conversationId": "conv-456",
				"tokenUsage": map[string]any{
					"prompt_tokens":     float64(200),
					"completion_tokens": float64(100),
					"total_tokens":      float64(300),
				},
			},
		}
		m.Extensions = []string{ExecutionContextExtensionURI}

		result, err := GetExtensionAs[ExecutionResponsePayload](m, ExecutionContextExtensionURI)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.ConversationId != "conv-456" {
			t.Fatalf("expected conv-456, got %s", result.ConversationId)
		}
		if result.TokenUsage.TotalTokens != 300 {
			t.Fatalf("expected 300 total tokens, got %d", result.TokenUsage.TotalTokens)
		}
	})

	t.Run("returns error for missing extension", func(t *testing.T) {
		m := protocol.NewMessage(protocol.MessageRoleAgent, nil)

		_, err := GetExtensionAs[ExecutionResponsePayload](m, "missing")
		if err == nil {
			t.Fatal("expected error for missing extension")
		}
	})
}

func TestHasExtension(t *testing.T) {
	t.Run("returns true for declared extension", func(t *testing.T) {
		m := protocol.NewMessage(protocol.MessageRoleAgent, nil)
		SetExtension(&m, "https://example.com/ext/v1", "payload")

		if !HasExtension(m, "https://example.com/ext/v1") {
			t.Fatal("expected HasExtension to return true")
		}
	})

	t.Run("returns false for bare metadata key", func(t *testing.T) {
		m := protocol.NewMessage(protocol.MessageRoleAgent, nil)
		SetMetadata(&m, QueryExtensionMetadataKey, "legacy")

		if HasExtension(m, QueryExtensionMetadataKey) {
			t.Fatal("bare metadata key must not appear in Extensions")
		}
	})

	t.Run("returns false for undeclared URI", func(t *testing.T) {
		m := protocol.NewMessage(protocol.MessageRoleAgent, nil)

		if HasExtension(m, "https://example.com/ext/v1") {
			t.Fatal("expected false for undeclared URI")
		}
	})
}

func TestGetMetadata(t *testing.T) {
	t.Run("reads extension URI keys", func(t *testing.T) {
		m := protocol.NewMessage(protocol.MessageRoleAgent, nil)
		SetExtension(&m, "https://example.com/ext/v1", "ext-data")

		val, ok := GetMetadata(m, "https://example.com/ext/v1")
		if !ok || val != "ext-data" {
			t.Fatalf("expected ext-data, got %v", val)
		}
	})

	t.Run("reads non-extension keys", func(t *testing.T) {
		m := protocol.NewMessage(protocol.MessageRoleAgent, nil)
		SetMetadata(&m, "custom-key", "custom-val")

		val, ok := GetMetadata(m, "custom-key")
		if !ok || val != "custom-val" {
			t.Fatalf("expected custom-val, got %v", val)
		}
	})
}

func TestSetExecutionContextExtension(t *testing.T) {
	m := protocol.NewMessage(protocol.MessageRoleAgent, nil)
	payload := ExecutionResponsePayload{
		ConversationId: "conv-typed",
		TokenUsage: &ResponseTokenUsage{
			PromptTokens:     10,
			CompletionTokens: 20,
			TotalTokens:      30,
		},
	}
	SetExecutionContextExtension(&m, payload)

	if !HasExtension(m, ExecutionContextExtensionURI) {
		t.Fatal("expected ExecutionContextExtensionURI in Extensions")
	}

	raw, ok := GetExtension(m, ExecutionContextExtensionURI)
	if !ok {
		t.Fatal("expected payload in Metadata")
	}

	b, _ := json.Marshal(raw)
	var roundTripped ExecutionResponsePayload
	_ = json.Unmarshal(b, &roundTripped)
	if roundTripped.ConversationId != "conv-typed" {
		t.Fatalf("expected conv-typed, got %s", roundTripped.ConversationId)
	}
}

func TestGetExecutionContextExtension(t *testing.T) {
	t.Run("extracts typed payload", func(t *testing.T) {
		m := protocol.NewMessage(protocol.MessageRoleAgent, nil)
		SetExecutionContextExtension(&m, ExecutionResponsePayload{
			ConversationId: "conv-get",
		})

		result, err := GetExecutionContextExtension(m)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.ConversationId != "conv-get" {
			t.Fatalf("expected conv-get, got %s", result.ConversationId)
		}
	})

	t.Run("returns error when extension missing", func(t *testing.T) {
		m := protocol.NewMessage(protocol.MessageRoleAgent, nil)

		_, err := GetExecutionContextExtension(m)
		if err == nil {
			t.Fatal("expected error for missing extension")
		}
	})
}

func TestExtractDataParts(t *testing.T) {
	t.Run("extracts DataParts from mixed parts", func(t *testing.T) {
		parts := []protocol.Part{
			protocol.NewTextPart("hello"),
			protocol.DataPart{Kind: "data", Data: map[string]any{"type": "tool_call"}},
			protocol.NewTextPart("world"),
			protocol.DataPart{Kind: "data", Data: map[string]any{"type": "tool_result"}},
		}
		dps := ExtractDataParts(parts)
		if len(dps) != 2 {
			t.Fatalf("expected 2 DataParts, got %d", len(dps))
		}
	})

	t.Run("returns nil for text-only parts", func(t *testing.T) {
		parts := []protocol.Part{
			protocol.NewTextPart("hello"),
		}
		dps := ExtractDataParts(parts)
		if dps != nil {
			t.Fatalf("expected nil, got %v", dps)
		}
	})

	t.Run("handles pointer DataParts", func(t *testing.T) {
		dp := &protocol.DataPart{Kind: "data", Data: map[string]any{"type": "system"}}
		parts := []protocol.Part{dp}
		dps := ExtractDataParts(parts)
		if len(dps) != 1 {
			t.Fatalf("expected 1 DataPart, got %d", len(dps))
		}
	})
}

func TestDataPartType(t *testing.T) {
	dp := protocol.DataPart{Data: map[string]any{"type": "tool_call", "id": "tc-1"}}
	if DataPartType(dp) != "tool_call" {
		t.Fatalf("expected tool_call, got %s", DataPartType(dp))
	}
}

func TestDataPartField(t *testing.T) {
	dp := protocol.DataPart{Data: map[string]any{"type": "tool_result", "tool_call_id": "tc-1", "content": "result"}}
	if DataPartField(dp, "tool_call_id") != "tc-1" {
		t.Fatalf("expected tc-1, got %s", DataPartField(dp, "tool_call_id"))
	}
	if DataPartField(dp, "content") != "result" {
		t.Fatalf("expected result, got %s", DataPartField(dp, "content"))
	}
	if DataPartField(dp, "missing") != "" {
		t.Fatal("expected empty string for missing key")
	}
}

func TestDataPartMap(t *testing.T) {
	dp := protocol.DataPart{Data: map[string]any{
		"type":     "tool_call",
		"function": map[string]any{"name": "weather", "arguments": `{"city":"NYC"}`},
	}}
	fn := DataPartMap(dp, "function")
	if fn == nil {
		t.Fatal("expected non-nil function map")
	}
	if fn["name"] != "weather" {
		t.Fatalf("expected weather, got %v", fn["name"])
	}
	if DataPartMap(dp, "missing") != nil {
		t.Fatal("expected nil for missing key")
	}
}
