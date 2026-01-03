/* Copyright 2025. McKinsey & Company */

package genai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestToTemplateOpenAIMessage(t *testing.T) {
	tests := []struct {
		name     string
		input    Message
		expected TemplateOpenAIMessage
	}{
		{
			name:  "user message",
			input: NewUserMessage("Hello"),
			expected: TemplateOpenAIMessage{
				Role:    RoleUser,
				Content: "Hello",
			},
		},
		{
			name:  "assistant message",
			input: NewAssistantMessage("Hi there"),
			expected: TemplateOpenAIMessage{
				Role:    RoleAssistant,
				Content: "Hi there",
			},
		},
		{
			name:  "system message",
			input: NewSystemMessage("You are helpful"),
			expected: TemplateOpenAIMessage{
				Role:    RoleSystem,
				Content: "You are helpful",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := toTemplateOpenAIMessage(tt.input)
			assert.Equal(t, tt.expected.Role, result.Role)
			assert.Equal(t, tt.expected.Content, result.Content)
		})
	}
}

func TestFromTemplateOpenAIMessage(t *testing.T) {
	tests := []struct {
		name         string
		input        TemplateOpenAIMessage
		expectedRole string
	}{
		{
			name: "assistant message",
			input: TemplateOpenAIMessage{
				Role:    RoleAssistant,
				Content: "Hello from assistant",
			},
			expectedRole: RoleAssistant,
		},
		{
			name: "user message",
			input: TemplateOpenAIMessage{
				Role:    RoleUser,
				Content: "Hello from user",
			},
			expectedRole: RoleUser,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := fromTemplateOpenAIMessage(tt.input)

			if tt.expectedRole == RoleAssistant {
				assert.NotNil(t, result.OfAssistant)
				assert.Equal(t, tt.input.Content, result.OfAssistant.Content.OfString.Value)
			} else {
				assert.NotNil(t, result.OfUser)
				assert.Equal(t, tt.input.Content, result.OfUser.Content.OfString.Value)
			}
		})
	}
}

func TestGetTemplateMessageContent(t *testing.T) {
	tests := []struct {
		name     string
		input    Message
		expected string
	}{
		{
			name:     "user message content",
			input:    NewUserMessage("User content"),
			expected: "User content",
		},
		{
			name:     "assistant message content",
			input:    NewAssistantMessage("Assistant content"),
			expected: "Assistant content",
		},
		{
			name:     "system message content",
			input:    NewSystemMessage("System content"),
			expected: "System content",
		},
		{
			name:     "empty message",
			input:    Message{},
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := getTemplateMessageContent(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestGetTemplateMessageRole(t *testing.T) {
	tests := []struct {
		name     string
		input    Message
		expected string
	}{
		{
			name:     "user message role",
			input:    NewUserMessage("test"),
			expected: RoleUser,
		},
		{
			name:     "assistant message role",
			input:    NewAssistantMessage("test"),
			expected: RoleAssistant,
		},
		{
			name:     "system message role",
			input:    NewSystemMessage("test"),
			expected: RoleSystem,
		},
		{
			name:     "empty message defaults to user",
			input:    Message{},
			expected: RoleUser,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := getTemplateMessageRole(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestTemplateOpenAIChatRequest_JSON(t *testing.T) {
	request := TemplateOpenAIChatRequest{
		Model: "agent",
		Messages: []TemplateOpenAIMessage{
			{Role: RoleUser, Content: "Hello"},
		},
	}

	data, err := json.Marshal(request)
	require.NoError(t, err)

	var parsed map[string]interface{}
	err = json.Unmarshal(data, &parsed)
	require.NoError(t, err)

	assert.Equal(t, "agent", parsed["model"])
	messages := parsed["messages"].([]interface{})
	assert.Len(t, messages, 1)
	msg := messages[0].(map[string]interface{})
	assert.Equal(t, "user", msg["role"])
	assert.Equal(t, "Hello", msg["content"])
}

func TestTemplateInvokeRequest_JSON(t *testing.T) {
	request := TemplateInvokeRequest{
		Input:  "test input",
		Config: map[string]any{"key": "value"},
	}

	data, err := json.Marshal(request)
	require.NoError(t, err)

	var parsed map[string]interface{}
	err = json.Unmarshal(data, &parsed)
	require.NoError(t, err)

	assert.Equal(t, "test input", parsed["input"])
	config := parsed["config"].(map[string]interface{})
	assert.Equal(t, "value", config["key"])
}

func TestTemplateAgentOpenAI_HTTPMock(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/v1/chat/completions", r.URL.Path)
		assert.Equal(t, "POST", r.Method)
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))

		var req TemplateOpenAIChatRequest
		err := json.NewDecoder(r.Body).Decode(&req)
		require.NoError(t, err)

		assert.Equal(t, "agent", req.Model)
		assert.Len(t, req.Messages, 1)
		assert.Equal(t, RoleUser, req.Messages[0].Role)

		response := TemplateOpenAIChatResponse{
			ID: "test-response-id",
			Choices: []TemplateOpenAIChatChoice{
				{
					Index: 0,
					Message: TemplateOpenAIMessage{
						Role:    RoleAssistant,
						Content: "Hello from template agent",
					},
				},
			},
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	agent := &Agent{
		Name:             "test-agent",
		Namespace:        "default",
		ServiceAddress:   server.URL,
		IsTemplateEngine: true,
		IsAgentic:        true,
	}

	ctx := context.Background()
	userInput := NewUserMessage("Hello")

	result, err := agent.executeTemplateAgentOpenAI(ctx, userInput, nil, nil)

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Len(t, result.Messages, 1)
	assert.NotNil(t, result.Messages[0].OfAssistant)
	assert.Equal(t, "Hello from template agent", result.Messages[0].OfAssistant.Content.OfString.Value)
}

func TestTemplateAgentInvoke_HTTPMock(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/invoke", r.URL.Path)
		assert.Equal(t, "POST", r.Method)
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))

		var req TemplateInvokeRequest
		err := json.NewDecoder(r.Body).Decode(&req)
		require.NoError(t, err)

		assert.Equal(t, "Test input", req.Input)

		response := TemplateInvokeResponse{
			Output:   "Processed output",
			Metadata: map[string]any{"processed": true},
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	agent := &Agent{
		Name:             "test-agent",
		Namespace:        "default",
		ServiceAddress:   server.URL,
		IsTemplateEngine: true,
		IsAgentic:        false,
	}

	ctx := context.Background()
	userInput := NewUserMessage("Test input")

	result, err := agent.executeTemplateAgentInvoke(ctx, userInput, nil)

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Len(t, result.Messages, 1)
	assert.NotNil(t, result.Messages[0].OfAssistant)
	assert.Equal(t, "Processed output", result.Messages[0].OfAssistant.Content.OfString.Value)
}

func TestTemplateAgent_NoServiceAddress(t *testing.T) {
	agent := &Agent{
		Name:             "test-agent",
		Namespace:        "default",
		ServiceAddress:   "",
		IsTemplateEngine: true,
		IsAgentic:        true,
	}

	ctx := context.Background()
	userInput := NewUserMessage("Hello")

	result, err := agent.executeWithTemplateAgent(ctx, userInput, nil, nil)

	assert.Error(t, err)
	assert.Nil(t, result)
	assert.Contains(t, err.Error(), "has no service address")
}

func TestTemplateAgentOpenAI_ErrorStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	agent := &Agent{
		Name:             "test-agent",
		Namespace:        "default",
		ServiceAddress:   server.URL,
		IsTemplateEngine: true,
		IsAgentic:        true,
	}

	ctx := context.Background()
	userInput := NewUserMessage("Hello")

	result, err := agent.executeTemplateAgentOpenAI(ctx, userInput, nil, nil)

	assert.Error(t, err)
	assert.Nil(t, result)
	assert.Contains(t, err.Error(), "error status: 500")
}

func TestTemplateAgentOpenAI_EmptyChoices(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		response := TemplateOpenAIChatResponse{
			ID:      "empty-response",
			Choices: []TemplateOpenAIChatChoice{},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	agent := &Agent{
		Name:             "test-agent",
		Namespace:        "default",
		ServiceAddress:   server.URL,
		IsTemplateEngine: true,
		IsAgentic:        true,
	}

	ctx := context.Background()
	userInput := NewUserMessage("Hello")

	result, err := agent.executeTemplateAgentOpenAI(ctx, userInput, nil, nil)

	assert.Error(t, err)
	assert.Nil(t, result)
	assert.Contains(t, err.Error(), "returned no choices")
}

func TestTemplateAgentRouting(t *testing.T) {
	tests := []struct {
		name            string
		isAgentic       bool
		expectedPath    string
		responseHandler func(w http.ResponseWriter)
	}{
		{
			name:         "routes to OpenAI format when isAgentic=true",
			isAgentic:    true,
			expectedPath: "/v1/chat/completions",
			responseHandler: func(w http.ResponseWriter) {
				response := TemplateOpenAIChatResponse{
					ID: "test",
					Choices: []TemplateOpenAIChatChoice{
						{Message: TemplateOpenAIMessage{Role: RoleAssistant, Content: "response"}},
					},
				}
				_ = json.NewEncoder(w).Encode(response)
			},
		},
		{
			name:         "routes to invoke format when isAgentic=false",
			isAgentic:    false,
			expectedPath: "/invoke",
			responseHandler: func(w http.ResponseWriter) {
				response := TemplateInvokeResponse{Output: "response"}
				_ = json.NewEncoder(w).Encode(response)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var receivedPath string
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				receivedPath = r.URL.Path
				w.Header().Set("Content-Type", "application/json")
				tt.responseHandler(w)
			}))
			defer server.Close()

			agent := &Agent{
				Name:             "test-agent",
				Namespace:        "default",
				ServiceAddress:   server.URL,
				IsTemplateEngine: true,
				IsAgentic:        tt.isAgentic,
			}

			ctx := context.Background()
			userInput := NewUserMessage("Hello")

			result, err := agent.executeWithTemplateAgent(ctx, userInput, nil, nil)

			require.NoError(t, err)
			require.NotNil(t, result)
			assert.Equal(t, tt.expectedPath, receivedPath)
		})
	}
}

func TestTemplateAgentOpenAI_WithHistory(t *testing.T) {
	var receivedMessages []TemplateOpenAIMessage

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req TemplateOpenAIChatRequest
		_ = json.NewDecoder(r.Body).Decode(&req)
		receivedMessages = req.Messages

		response := TemplateOpenAIChatResponse{
			ID: "test",
			Choices: []TemplateOpenAIChatChoice{
				{Message: TemplateOpenAIMessage{Role: RoleAssistant, Content: "response"}},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	agent := &Agent{
		Name:             "test-agent",
		Namespace:        "default",
		ServiceAddress:   server.URL,
		IsTemplateEngine: true,
		IsAgentic:        true,
	}

	ctx := context.Background()
	history := []Message{
		NewUserMessage("First message"),
		NewAssistantMessage("First response"),
	}
	userInput := NewUserMessage("Second message")

	_, err := agent.executeTemplateAgentOpenAI(ctx, userInput, history, nil)

	require.NoError(t, err)
	assert.Len(t, receivedMessages, 3)
	assert.Equal(t, "First message", receivedMessages[0].Content)
	assert.Equal(t, "First response", receivedMessages[1].Content)
	assert.Equal(t, "Second message", receivedMessages[2].Content)
}
