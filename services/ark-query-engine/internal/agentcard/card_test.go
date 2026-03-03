package agentcard

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNewDefaultCard(t *testing.T) {
	card := NewDefaultCard("http://localhost:8080")
	if card.Name != "ark-query-engine" {
		t.Errorf("unexpected name: %s", card.Name)
	}
	if card.URL != "http://localhost:8080" {
		t.Errorf("unexpected URL: %s", card.URL)
	}
	if !card.Capabilities.Streaming {
		t.Error("expected streaming to be true")
	}
	if card.Capabilities.PushNotifications {
		t.Error("expected push notifications to be false")
	}
	if card.ExecutionProfile == nil {
		t.Fatal("expected execution profile to be set")
	}
	if card.ExecutionProfile.ToolMode != "callback" {
		t.Errorf("unexpected tool mode: %s", card.ExecutionProfile.ToolMode)
	}
	if card.ExecutionProfile.MemoryMode != "inline" {
		t.Errorf("unexpected memory mode: %s", card.ExecutionProfile.MemoryMode)
	}
	if !card.ExecutionProfile.StructuredOutput {
		t.Error("expected structured output to be true")
	}
	if !card.ExecutionProfile.Streaming {
		t.Error("expected streaming to be true")
	}
	if len(card.ExecutionProfile.SupportedModels) != 3 {
		t.Fatalf("expected 3 supported models, got %d", len(card.ExecutionProfile.SupportedModels))
	}
}

func TestHandler(t *testing.T) {
	card := NewDefaultCard("http://localhost:8080")
	handler := Handler(card)

	req := httptest.NewRequest(http.MethodGet, "/.well-known/agent-card.json", nil)
	w := httptest.NewRecorder()
	handler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	if w.Header().Get("Content-Type") != "application/json" {
		t.Errorf("unexpected content type: %s", w.Header().Get("Content-Type"))
	}

	var result AgentCard
	if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if result.Name != "ark-query-engine" {
		t.Errorf("unexpected name in response: %s", result.Name)
	}
	if result.ExecutionProfile == nil {
		t.Fatal("expected execution profile in response")
	}
	if result.ExecutionProfile.Schema != "https://ark.mckinsey.com/extensions/execution-profile/v1" {
		t.Errorf("unexpected execution profile schema: %s", result.ExecutionProfile.Schema)
	}
}
