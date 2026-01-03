// Package genai provides AI agent execution capabilities.
//
// This file implements HTTP client logic for calling "template agents" - agents that
// run in their own dedicated container (Deployment + Service) rather than using a
// shared executor.
//
// Template agents are created when an Agent references an ExecutionEngine that has
// spec.source.image set. The agent controller automatically creates a Deployment
// and Service for the agent, and sets agent.status.serviceAddress to the internal
// Kubernetes DNS URL (e.g., http://my-agent.default.svc.cluster.local:8080).
//
// Template agents support two API contracts based on the ExecutionEngine's isAgentic field:
//
//   isAgentic=true (Conversational agents):
//     Endpoint: POST /v1/chat/completions
//     Request:  {"model": "agent", "messages": [{"role": "user", "content": "..."}]}
//     Response: {"choices": [{"message": {"role": "assistant", "content": "..."}}]}
//     This is the standard OpenAI chat completions format, widely supported by AI tools.
//
//   isAgentic=false (Pipelines, chains, classifiers):
//     Endpoint: POST /invoke
//     Request:  {"input": "...", "config": {}}
//     Response: {"output": "...", "metadata": {}}
//     This is a simple input/output format for non-conversational workloads.
//
// Both contracts also require GET /health for liveness checks.

package genai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/openai/openai-go"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
)

// ============================================================================
// OpenAI-compatible types (for isAgentic=true)
// ============================================================================

// TemplateOpenAIMessage represents a single message in OpenAI chat format
type TemplateOpenAIMessage struct {
	Role    string `json:"role"`    // "user", "assistant", or "system"
	Content string `json:"content"` // The message text
}

// TemplateOpenAIChatRequest is the request body for POST /v1/chat/completions
type TemplateOpenAIChatRequest struct {
	Model    string                  `json:"model"`    // Model identifier (template agents can ignore this)
	Messages []TemplateOpenAIMessage `json:"messages"` // Conversation history + current message
}

// TemplateOpenAIChatChoice represents one completion choice in the response
type TemplateOpenAIChatChoice struct {
	Index   int                   `json:"index"`
	Message TemplateOpenAIMessage `json:"message"`
}

// TemplateOpenAIChatResponse is the response body from POST /v1/chat/completions
type TemplateOpenAIChatResponse struct {
	ID      string                     `json:"id"`
	Choices []TemplateOpenAIChatChoice `json:"choices"`
}

// ============================================================================
// Simple invoke types (for isAgentic=false)
// ============================================================================

// TemplateInvokeRequest is the request body for POST /invoke
type TemplateInvokeRequest struct {
	Input  string         `json:"input"`            // The input to process
	Config map[string]any `json:"config,omitempty"` // Optional configuration
}

// TemplateInvokeResponse is the response body from POST /invoke
type TemplateInvokeResponse struct {
	Output   string         `json:"output"`             // The processed output
	Metadata map[string]any `json:"metadata,omitempty"` // Optional metadata
}

// ============================================================================
// HTTP client configuration
// ============================================================================

// Shared HTTP client with 5-minute timeout for template agent calls
var templateHTTPClient = &http.Client{
	Timeout: 300 * time.Second,
}

// ============================================================================
// Main execution logic
// ============================================================================

// executeWithTemplateAgent calls a template agent's HTTP endpoint.
// Routes to the appropriate format based on isAgentic:
//   - isAgentic=true:  POST /v1/chat/completions (OpenAI format)
//   - isAgentic=false: POST /invoke (simple input/output)
func (a *Agent) executeWithTemplateAgent(ctx context.Context, userInput Message, history []Message, eventStream EventStreamInterface) (*ExecutionResult, error) {
	if a.ServiceAddress == "" {
		return nil, fmt.Errorf("template agent %s has no service address - deployment may not be ready", a.FullName())
	}

	if a.IsAgentic {
		return a.executeTemplateAgentOpenAI(ctx, userInput, history, eventStream)
	}
	return a.executeTemplateAgentInvoke(ctx, userInput, eventStream)
}

// executeTemplateAgentOpenAI calls the agent using OpenAI chat completions format.
// This is used for conversational agents that maintain context across messages.
func (a *Agent) executeTemplateAgentOpenAI(ctx context.Context, userInput Message, history []Message, eventStream EventStreamInterface) (*ExecutionResult, error) {
	log := logf.FromContext(ctx)
	modelID := fmt.Sprintf("agent/%s", a.Name)
	log.Info("Template agent OpenAI execution started", "agent", a.Name, "hasEventStream", eventStream != nil)

	// Build the messages array: history + current user input
	messages := make([]TemplateOpenAIMessage, 0, len(history)+1)

	for _, msg := range history {
		messages = append(messages, toTemplateOpenAIMessage(msg))
	}
	messages = append(messages, toTemplateOpenAIMessage(userInput))

	request := TemplateOpenAIChatRequest{
		Model:    "agent", // Template agents typically ignore this
		Messages: messages,
	}

	requestBody, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal OpenAI request: %w", err)
	}

	url := fmt.Sprintf("%s/v1/chat/completions", a.ServiceAddress)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBuffer(requestBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := templateHTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("template agent request failed: %w", err)
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil {
			logf.Log.Error(closeErr, "failed to close response body")
		}
	}()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("template agent returned error status: %d", resp.StatusCode)
	}

	var response TemplateOpenAIChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return nil, fmt.Errorf("failed to decode OpenAI response: %w", err)
	}

	if len(response.Choices) == 0 {
		return nil, fmt.Errorf("template agent returned no choices")
	}

	// Emit streaming chunk for the response (enables dashboard streaming)
	if eventStream != nil && len(response.Choices) > 0 {
		content := response.Choices[0].Message.Content
		chunk := &openai.ChatCompletionChunk{
			ID:    response.ID,
			Model: modelID,
			Choices: []openai.ChatCompletionChunkChoice{
				{
					Index: 0,
					Delta: openai.ChatCompletionChunkChoiceDelta{
						Content: content,
						Role:    RoleAssistant,
					},
					FinishReason: "stop",
				},
			},
		}
		chunkWithMeta := WrapChunkWithMetadata(ctx, chunk, modelID, nil)
		if streamErr := eventStream.StreamChunk(ctx, chunkWithMeta); streamErr != nil {
			log.Error(streamErr, "failed to send template agent response to event stream")
		}
	}

	// Convert OpenAI response back to internal Message format
	resultMessages := make([]Message, len(response.Choices))
	for i, choice := range response.Choices {
		resultMessages[i] = fromTemplateOpenAIMessage(choice.Message)
	}

	return &ExecutionResult{Messages: resultMessages}, nil
}

// executeTemplateAgentInvoke calls the agent using simple invoke format.
// This is used for non-conversational workloads like pipelines and classifiers.
func (a *Agent) executeTemplateAgentInvoke(ctx context.Context, userInput Message, eventStream EventStreamInterface) (*ExecutionResult, error) {
	log := logf.FromContext(ctx)
	modelID := fmt.Sprintf("agent/%s", a.Name)

	inputContent := getTemplateMessageContent(userInput)

	request := TemplateInvokeRequest{
		Input: inputContent,
	}

	requestBody, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal invoke request: %w", err)
	}

	url := fmt.Sprintf("%s/invoke", a.ServiceAddress)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBuffer(requestBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := templateHTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("template agent request failed: %w", err)
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil {
			logf.Log.Error(closeErr, "failed to close response body")
		}
	}()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("template agent returned error status: %d", resp.StatusCode)
	}

	var response TemplateInvokeResponse
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return nil, fmt.Errorf("failed to decode invoke response: %w", err)
	}

	// Emit streaming chunk for the response (enables dashboard streaming)
	if eventStream != nil {
		chunk := &openai.ChatCompletionChunk{
			ID:    fmt.Sprintf("invoke-%s", a.Name),
			Model: modelID,
			Choices: []openai.ChatCompletionChunkChoice{
				{
					Index: 0,
					Delta: openai.ChatCompletionChunkChoiceDelta{
						Content: response.Output,
						Role:    RoleAssistant,
					},
					FinishReason: "stop",
				},
			},
		}
		chunkWithMeta := WrapChunkWithMetadata(ctx, chunk, modelID, nil)
		if streamErr := eventStream.StreamChunk(ctx, chunkWithMeta); streamErr != nil {
			log.Error(streamErr, "failed to send template agent response to event stream")
		}
	}

	// Wrap the output in an assistant message (using existing NewAssistantMessage from types.go)
	resultMessage := NewAssistantMessage(response.Output)

	return &ExecutionResult{Messages: []Message{resultMessage}}, nil
}

// ============================================================================
// Message conversion helpers for template agents
// ============================================================================

// toTemplateOpenAIMessage converts an internal Message to OpenAI format for template agents
func toTemplateOpenAIMessage(msg Message) TemplateOpenAIMessage {
	return TemplateOpenAIMessage{
		Role:    getTemplateMessageRole(msg),
		Content: getTemplateMessageContent(msg),
	}
}

// fromTemplateOpenAIMessage converts an OpenAI message back to internal format
func fromTemplateOpenAIMessage(msg TemplateOpenAIMessage) Message {
	if msg.Role == RoleAssistant {
		return NewAssistantMessage(msg.Content)
	}
	return NewUserMessage(msg.Content)
}

// getTemplateMessageContent extracts the text content from an internal Message
func getTemplateMessageContent(msg Message) string {
	if msg.OfUser != nil {
		return msg.OfUser.Content.OfString.Value
	}
	if msg.OfAssistant != nil {
		return msg.OfAssistant.Content.OfString.Value
	}
	if msg.OfSystem != nil {
		return msg.OfSystem.Content.OfString.Value
	}
	return ""
}

// getTemplateMessageRole extracts the role from an internal Message
func getTemplateMessageRole(msg Message) string {
	if msg.OfUser != nil {
		return RoleUser
	}
	if msg.OfAssistant != nil {
		return RoleAssistant
	}
	if msg.OfSystem != nil {
		return RoleSystem
	}
	return RoleUser
}
