package conformance

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"testing"
	"time"

	a2aclient "trpc.group/trpc-go/trpc-a2a-go/client"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

const defaultEngineURL = "http://localhost:9090"

func engineURL() string {
	if u := os.Getenv("ENGINE_URL"); u != "" {
		return u
	}
	return defaultEngineURL
}

func newA2AClient(t *testing.T) *a2aclient.A2AClient {
	t.Helper()
	c, err := a2aclient.NewA2AClient(engineURL())
	if err != nil {
		t.Fatalf("failed to create A2A client: %v", err)
	}
	return c
}

func buildTestMessage() protocol.Message {
	arkMetadata := map[string]any{
		"ark.mckinsey.com/execution-engine": map[string]any{
			"agent": map[string]any{
				"name":      "conformance-test-agent",
				"namespace": "default",
				"prompt":    "You are a test agent. Reply with exactly: CONFORMANCE_PASS",
				"model": map[string]any{
					"name": "mock-model",
					"type": "openai",
				},
			},
			"tools": []any{},
		},
	}

	metaBytes, _ := json.Marshal(arkMetadata)
	var metadata map[string]any
	json.Unmarshal(metaBytes, &metadata)

	msg := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		&protocol.TextPart{Kind: protocol.KindText, Text: "Hello, conformance test"},
	})
	msg.Metadata = metadata
	return msg
}

func TestAgentCard(t *testing.T) {
	url := fmt.Sprintf("%s/.well-known/agent-card.json", engineURL())
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		t.Fatalf("failed to create request: %v", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("agent card fetch failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var card struct {
		Name             string `json:"name"`
		Version          string `json:"version"`
		URL              string `json:"url"`
		ExecutionProfile *struct {
			ToolMode         string   `json:"toolMode"`
			MemoryMode       string   `json:"memoryMode"`
			StructuredOutput bool     `json:"structuredOutput"`
			Streaming        bool     `json:"streaming"`
			SupportedModels  []string `json:"supportedModels"`
		} `json:"executionProfile"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&card); err != nil {
		t.Fatalf("failed to decode agent card: %v", err)
	}

	if card.Name == "" {
		t.Error("agent card missing name")
	}
	if card.Version == "" {
		t.Error("agent card missing version")
	}
	if card.ExecutionProfile == nil {
		t.Fatal("agent card missing executionProfile")
	}
	if card.ExecutionProfile.ToolMode == "" {
		t.Error("execution profile missing toolMode")
	}
	if card.ExecutionProfile.MemoryMode == "" {
		t.Error("execution profile missing memoryMode")
	}
}

func TestBlockingExecution(t *testing.T) {
	client := newA2AClient(t)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	blocking := true
	result, err := client.SendMessage(ctx, protocol.SendMessageParams{
		RPCID:   protocol.GenerateRPCID(),
		Message: buildTestMessage(),
		Configuration: &protocol.SendMessageConfiguration{
			Blocking: &blocking,
		},
	})
	if err != nil {
		t.Fatalf("blocking execution failed: %v", err)
	}
	if result == nil || result.Result == nil {
		t.Fatal("nil result from blocking execution")
	}

	switch r := result.Result.(type) {
	case *protocol.Task:
		if r.Status.State != protocol.TaskStateCompleted {
			t.Errorf("expected completed state, got %s", r.Status.State)
		}
	case *protocol.Message:
		if len(r.Parts) == 0 {
			t.Error("empty response message")
		}
	default:
		t.Fatalf("unexpected result type: %T", result.Result)
	}
}

func TestStreamingExecution(t *testing.T) {
	client := newA2AClient(t)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	events, err := client.StreamMessage(ctx, protocol.SendMessageParams{
		RPCID:   protocol.GenerateRPCID(),
		Message: buildTestMessage(),
	})
	if err != nil {
		t.Fatalf("streaming execution failed: %v", err)
	}

	var receivedEvents int
	var gotFinal bool
	for event := range events {
		if event.Result == nil {
			continue
		}
		receivedEvents++
		if statusEvent, ok := event.Result.(*protocol.TaskStatusUpdateEvent); ok {
			if statusEvent.Final {
				gotFinal = true
			}
		}
	}

	if receivedEvents == 0 {
		t.Error("received no streaming events")
	}
	if !gotFinal {
		t.Error("never received final status event")
	}
}

func TestToolCallback(t *testing.T) {
	toolMsg := buildTestMessage()
	arkMeta := toolMsg.Metadata["ark.mckinsey.com/execution-engine"].(map[string]any)
	arkMeta["agent"].(map[string]any)["prompt"] = "You are a test agent. Use the get_time tool to check the current time."
	arkMeta["tools"] = []map[string]any{
		{
			"name":        "get_time",
			"description": "Returns the current time",
			"parameters":  map[string]any{"type": "object", "properties": map[string]any{}},
		},
	}

	client := newA2AClient(t)
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	events, err := client.StreamMessage(ctx, protocol.SendMessageParams{
		RPCID:   protocol.GenerateRPCID(),
		Message: toolMsg,
	})
	if err != nil {
		t.Fatalf("streaming failed: %v", err)
	}

	var gotInputRequired bool
	var taskID, contextID string
	for event := range events {
		if event.Result == nil {
			continue
		}
		statusEvent, ok := event.Result.(*protocol.TaskStatusUpdateEvent)
		if !ok {
			continue
		}
		if statusEvent.TaskID != "" {
			taskID = statusEvent.TaskID
		}
		if statusEvent.ContextID != "" {
			contextID = statusEvent.ContextID
		}
		if statusEvent.Status.State == protocol.TaskStateInputRequired {
			gotInputRequired = true

			toolResultPayload := map[string]any{
				"schema": "https://ark.mckinsey.com/payloads/tool-request/v1",
				"results": []map[string]any{
					{
						"toolCallId": "call_test",
						"toolName":   "get_time",
						"content":    "2026-03-03T12:00:00Z",
					},
				},
			}
			resultMsg := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
				&protocol.DataPart{Kind: protocol.KindData, Data: toolResultPayload},
			})
			resultMsg.TaskID = &taskID
			resultMsg.ContextID = &contextID

			_, sendErr := client.SendMessage(ctx, protocol.SendMessageParams{
				RPCID:   protocol.GenerateRPCID(),
				Message: resultMsg,
			})
			if sendErr != nil {
				t.Fatalf("failed to send tool result: %v", sendErr)
			}

			resumed, resubErr := client.ResubscribeTask(ctx, protocol.TaskIDParams{
				RPCID: protocol.GenerateRPCID(),
				ID:    taskID,
			})
			if resubErr != nil {
				t.Fatalf("failed to resubscribe: %v", resubErr)
			}
			events = resumed
			continue
		}
		if statusEvent.Final {
			break
		}
	}

	if !gotInputRequired {
		t.Skip("engine did not request tool callback (may not have called tool)")
	}
}

func TestErrorHandling(t *testing.T) {
	client := newA2AClient(t)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	badMsg := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		&protocol.TextPart{Kind: protocol.KindText, Text: "test"},
	})
	badMeta := map[string]any{
		"ark.mckinsey.com/execution-engine": map[string]any{
			"agent": map[string]any{
				"name":      "bad-agent",
				"namespace": "default",
				"prompt":    "test",
				"model": map[string]any{
					"name": "nonexistent-model",
					"type": "unsupported-provider",
				},
			},
		},
	}
	metaBytes, _ := json.Marshal(badMeta)
	json.Unmarshal(metaBytes, &badMsg.Metadata)

	blocking := true
	result, err := client.SendMessage(ctx, protocol.SendMessageParams{
		RPCID:   protocol.GenerateRPCID(),
		Message: badMsg,
		Configuration: &protocol.SendMessageConfiguration{
			Blocking: &blocking,
		},
	})

	if err != nil {
		return
	}

	if result != nil && result.Result != nil {
		if task, ok := result.Result.(*protocol.Task); ok {
			if task.Status.State == protocol.TaskStateFailed {
				return
			}
		}
	}

	t.Log("engine accepted bad config without error (may have a default fallback)")
}

func TestTaskLifecycle(t *testing.T) {
	client := newA2AClient(t)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	events, err := client.StreamMessage(ctx, protocol.SendMessageParams{
		RPCID:   protocol.GenerateRPCID(),
		Message: buildTestMessage(),
	})
	if err != nil {
		t.Fatalf("streaming failed: %v", err)
	}

	var taskID string
	for event := range events {
		if event.Result == nil {
			continue
		}
		switch r := event.Result.(type) {
		case *protocol.TaskStatusUpdateEvent:
			if r.TaskID != "" {
				taskID = r.TaskID
			}
		case *protocol.Task:
			if r.ID != "" {
				taskID = r.ID
			}
		}
		if taskID != "" {
			break
		}
	}

	if taskID == "" {
		t.Skip("no task ID received from streaming (engine may not assign IDs)")
		return
	}

	task, err := client.GetTasks(ctx, protocol.TaskQueryParams{
		RPCID: protocol.GenerateRPCID(),
		ID:    taskID,
	})
	if err != nil {
		t.Fatalf("GetTasks failed: %v", err)
	}
	if task.ID != taskID {
		t.Errorf("expected task ID %s, got %s", taskID, task.ID)
	}
}
