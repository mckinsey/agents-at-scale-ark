package engine

import (
	"testing"

	"mckinsey.com/ark-query-engine/internal/protocol"
	"mckinsey.com/ark-query-engine/internal/provider"
	a2aprotocol "trpc.group/trpc-go/trpc-a2a-go/protocol"
)

func TestExtractEngineMetadata_Valid(t *testing.T) {
	msg := a2aprotocol.NewMessage(a2aprotocol.MessageRoleUser, []a2aprotocol.Part{
		a2aprotocol.NewTextPart("hello"),
	})
	msg.Metadata = map[string]interface{}{
		protocol.ArkMetadataKey: map[string]interface{}{
			"agent": map[string]interface{}{
				"name":      "test-agent",
				"namespace": "default",
				"prompt":    "You are a test agent",
				"model": map[string]interface{}{
					"name": "gpt-4",
					"type": "openai",
				},
			},
			"tools": []interface{}{},
		},
	}
	meta := extractEngineMetadata(msg)
	if meta == nil {
		t.Fatal("expected metadata, got nil")
	}
	if meta.Agent.Name != "test-agent" {
		t.Errorf("unexpected agent name: %s", meta.Agent.Name)
	}
	if meta.Agent.Model.Name != "gpt-4" {
		t.Errorf("unexpected model name: %s", meta.Agent.Model.Name)
	}
}

func TestExtractEngineMetadata_Missing(t *testing.T) {
	msg := a2aprotocol.NewMessage(a2aprotocol.MessageRoleUser, []a2aprotocol.Part{
		a2aprotocol.NewTextPart("hello"),
	})
	meta := extractEngineMetadata(msg)
	if meta != nil {
		t.Error("expected nil metadata for message without metadata")
	}
}

func TestExtractEngineMetadata_NoModel(t *testing.T) {
	msg := a2aprotocol.NewMessage(a2aprotocol.MessageRoleUser, []a2aprotocol.Part{
		a2aprotocol.NewTextPart("hello"),
	})
	msg.Metadata = map[string]interface{}{
		protocol.ArkMetadataKey: map[string]interface{}{
			"agent": map[string]interface{}{
				"name": "test",
				"model": map[string]interface{}{
					"name": "",
					"type": "openai",
				},
			},
		},
	}
	meta := extractEngineMetadata(msg)
	if meta != nil {
		t.Error("expected nil metadata when model name is empty")
	}
}

func TestCreateProvider_OpenAI(t *testing.T) {
	model := protocol.EngineModel{
		Name: "gpt-4",
		Type: "openai",
		Config: map[string]any{
			"openai": map[string]any{
				"baseUrl": "https://api.openai.com/v1",
				"apiKey":  "test-key",
			},
		},
	}
	prov, err := createProvider(model)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if prov == nil {
		t.Fatal("expected non-nil provider")
	}
}

func TestCreateProvider_UnsupportedType(t *testing.T) {
	model := protocol.EngineModel{
		Name: "test",
		Type: "unsupported",
	}
	_, err := createProvider(model)
	if err == nil {
		t.Error("expected error for unsupported type")
	}
}

func TestCreateProvider_EmptyType(t *testing.T) {
	model := protocol.EngineModel{
		Name: "test",
		Type: "",
	}
	_, err := createProvider(model)
	if err == nil {
		t.Error("expected error for empty type")
	}
}

func TestConvertToolDefs(t *testing.T) {
	defs := []protocol.ToolDefinition{
		{Name: "get_weather", Description: "Get weather info", Parameters: map[string]any{"type": "object"}},
	}
	result := convertToolDefs(defs)
	if len(result) != 1 {
		t.Fatalf("expected 1 tool def, got %d", len(result))
	}
	if result[0].Name != "get_weather" {
		t.Errorf("unexpected tool name: %s", result[0].Name)
	}
}

func TestBuildToolRequest(t *testing.T) {
	calls := []provider.ToolCall{
		{ID: "call_1", Name: "search", Arguments: `{"q":"test"}`},
		{ID: "call_2", Name: "fetch", Arguments: `{"url":"http://example.com"}`},
	}
	req := buildToolRequest(calls)
	if req.Schema != protocol.PayloadSchemaToolRequestV1 {
		t.Errorf("unexpected schema: %s", req.Schema)
	}
	if len(req.Calls) != 2 {
		t.Fatalf("expected 2 calls, got %d", len(req.Calls))
	}
	if req.Calls[0].ToolCallID != "call_1" {
		t.Errorf("unexpected tool call ID: %s", req.Calls[0].ToolCallID)
	}
}

func TestConvertToolResults(t *testing.T) {
	payload := &protocol.ToolResultPayloadV1{
		Schema: protocol.PayloadSchemaToolResultV1,
		Results: []protocol.ToolResultEntry{
			{ToolCallID: "call_1", ToolName: "search", Content: "found results"},
			{ToolCallID: "call_2", ToolName: "fetch", Error: "timeout"},
		},
	}
	outcomes := convertToolResults(payload)
	if len(outcomes) != 2 {
		t.Fatalf("expected 2 outcomes, got %d", len(outcomes))
	}
	if outcomes[0].Content != "found results" {
		t.Errorf("unexpected content: %s", outcomes[0].Content)
	}
	if outcomes[1].Error != "timeout" {
		t.Errorf("unexpected error: %s", outcomes[1].Error)
	}
}
