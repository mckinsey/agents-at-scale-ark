package protocol

import (
	"testing"
)

func TestToolRequestPayloadV1_Schema(t *testing.T) {
	payload := ToolRequestPayloadV1{
		Schema: PayloadSchemaToolRequestV1,
		Calls: []ToolRequestCall{
			{ToolCallID: "call_1", ToolName: "get_weather", Arguments: `{"location":"NYC"}`},
		},
	}
	if payload.Schema != "https://ark.mckinsey.com/payloads/tool-request/v1" {
		t.Errorf("unexpected schema: %s", payload.Schema)
	}
	if len(payload.Calls) != 1 {
		t.Fatalf("expected 1 call, got %d", len(payload.Calls))
	}
	if payload.Calls[0].ToolCallID != "call_1" {
		t.Errorf("unexpected tool call ID: %s", payload.Calls[0].ToolCallID)
	}
}

func TestToolResultPayloadV1_Schema(t *testing.T) {
	payload := ToolResultPayloadV1{
		Schema: PayloadSchemaToolResultV1,
		Results: []ToolResultEntry{
			{ToolCallID: "call_1", ToolName: "get_weather", Content: "72°F"},
		},
	}
	if payload.Schema != "https://ark.mckinsey.com/payloads/tool-result/v1" {
		t.Errorf("unexpected schema: %s", payload.Schema)
	}
	if len(payload.Results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(payload.Results))
	}
}
