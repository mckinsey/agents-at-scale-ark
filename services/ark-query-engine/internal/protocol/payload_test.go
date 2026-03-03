package protocol

import (
	"encoding/json"
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

func TestHistoryPayloadV1_RoundTrip(t *testing.T) {
	payload := HistoryPayloadV1{
		Schema:    PayloadSchemaHistoryV1,
		Strategy:  "inline",
		Truncated: true,
		MaxWindow: 50,
		MemoryRef: "memory/chat-history",
	}
	data, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	var decoded HistoryPayloadV1
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	if decoded.Schema != PayloadSchemaHistoryV1 {
		t.Errorf("unexpected schema: %s", decoded.Schema)
	}
	if decoded.Strategy != "inline" {
		t.Errorf("unexpected strategy: %s", decoded.Strategy)
	}
	if decoded.MaxWindow != 50 {
		t.Errorf("unexpected maxWindow: %d", decoded.MaxWindow)
	}
}

func TestUserInputRequestPayloadV1_RoundTrip(t *testing.T) {
	payload := UserInputRequestPayloadV1{
		Schema:    PayloadSchemaUserInputRequestV1,
		Prompt:    "Approve this action?",
		InputType: "confirmation",
		Options:   []string{"yes", "no"},
		Timeout:   30,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	var decoded UserInputRequestPayloadV1
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	if decoded.Schema != PayloadSchemaUserInputRequestV1 {
		t.Errorf("unexpected schema: %s", decoded.Schema)
	}
	if decoded.Prompt != "Approve this action?" {
		t.Errorf("unexpected prompt: %s", decoded.Prompt)
	}
	if len(decoded.Options) != 2 {
		t.Fatalf("expected 2 options, got %d", len(decoded.Options))
	}
}

func TestUserInputResponsePayloadV1_RoundTrip(t *testing.T) {
	payload := UserInputResponsePayloadV1{
		Schema:    PayloadSchemaUserInputResponseV1,
		Value:     "yes",
		Cancelled: false,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	var decoded UserInputResponsePayloadV1
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	if decoded.Value != "yes" {
		t.Errorf("unexpected value: %s", decoded.Value)
	}
	if decoded.Cancelled {
		t.Error("expected cancelled to be false")
	}
}

func TestAuthCallbackPayloadV1_RoundTrip(t *testing.T) {
	payload := AuthCallbackPayloadV1{
		Schema:    PayloadSchemaAuthCallbackV1,
		Reason:    "token_expired",
		Provider:  "azure",
		Scopes:    []string{"openid", "profile"},
		ExpiresAt: "2026-03-03T12:00:00Z",
	}
	data, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	var decoded AuthCallbackPayloadV1
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	if decoded.Schema != PayloadSchemaAuthCallbackV1 {
		t.Errorf("unexpected schema: %s", decoded.Schema)
	}
	if decoded.Reason != "token_expired" {
		t.Errorf("unexpected reason: %s", decoded.Reason)
	}
	if decoded.Provider != "azure" {
		t.Errorf("unexpected provider: %s", decoded.Provider)
	}
	if len(decoded.Scopes) != 2 {
		t.Fatalf("expected 2 scopes, got %d", len(decoded.Scopes))
	}
}
