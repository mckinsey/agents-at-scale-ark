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

func TestOpenAIProvider_HealthCheck_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/v1/models", r.URL.Path)
		assert.Equal(t, "GET", r.Method)
		assert.Contains(t, r.Header.Get("Authorization"), "Bearer test-key")

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"data": []map[string]string{
				{"id": "gpt-4", "object": "model"},
			},
		})
	}))
	defer server.Close()

	provider := &OpenAIProvider{
		Model:   "gpt-4",
		BaseURL: server.URL + "/v1",
		APIKey:  "test-key",
	}

	ctx := context.Background()
	err := provider.HealthCheck(ctx)

	require.NoError(t, err)
}

func TestOpenAIProvider_HealthCheck_Unauthorized(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/v1/models", r.URL.Path)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"error": map[string]interface{}{
				"message": "Invalid API key",
				"type":    "invalid_request_error",
			},
		})
	}))
	defer server.Close()

	provider := &OpenAIProvider{
		Model:   "gpt-4",
		BaseURL: server.URL + "/v1",
		APIKey:  "invalid-key",
	}

	ctx := context.Background()
	err := provider.HealthCheck(ctx)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "401")
}

func TestOpenAIProvider_HealthCheck_ServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/v1/models", r.URL.Path)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"error": map[string]interface{}{
				"message": "Service temporarily unavailable",
				"type":    "server_error",
			},
		})
	}))
	defer server.Close()

	provider := &OpenAIProvider{
		Model:   "gpt-4",
		BaseURL: server.URL + "/v1",
		APIKey:  "test-key",
	}

	ctx := context.Background()
	err := provider.HealthCheck(ctx)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "503")
}

func TestOpenAIProvider_HealthCheck_NetworkError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	serverURL := server.URL
	server.Close()

	provider := &OpenAIProvider{
		Model:   "gpt-4",
		BaseURL: serverURL + "/v1",
		APIKey:  "test-key",
	}

	ctx := context.Background()
	err := provider.HealthCheck(ctx)

	require.Error(t, err)
}

func TestAzureProvider_HealthCheck_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Contains(t, r.URL.Path, "/chat/completions")
		assert.Equal(t, "POST", r.Method)
		assert.Equal(t, "test-key", r.Header.Get("api-key"))

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"id":      "chatcmpl-test",
			"object":  "chat.completion",
			"created": 1234567890,
			"model":   "gpt-4",
			"choices": []map[string]interface{}{
				{
					"index": 0,
					"message": map[string]interface{}{
						"role":    "assistant",
						"content": "test response",
					},
					"finish_reason": "stop",
				},
			},
			"usage": map[string]interface{}{
				"prompt_tokens":     10,
				"completion_tokens": 5,
				"total_tokens":      15,
			},
		})
	}))
	defer server.Close()

	provider := &AzureProvider{
		Model:      "gpt-4",
		BaseURL:    server.URL + "/openai",
		APIKey:     "test-key",
		APIVersion: "2024-02-15-preview",
	}

	ctx := context.Background()
	err := provider.HealthCheck(ctx)

	require.NoError(t, err)
}

func TestAzureProvider_HealthCheck_Unauthorized(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Contains(t, r.URL.Path, "/chat/completions")

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"error": map[string]interface{}{
				"message": "Invalid API key",
				"type":    "invalid_request_error",
			},
		})
	}))
	defer server.Close()

	provider := &AzureProvider{
		Model:      "gpt-4",
		BaseURL:    server.URL + "/openai",
		APIKey:     "invalid-key",
		APIVersion: "2024-02-15-preview",
	}

	ctx := context.Background()
	err := provider.HealthCheck(ctx)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "401")
}

func TestAzureProvider_HealthCheck_NetworkError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	serverURL := server.URL
	server.Close()

	provider := &AzureProvider{
		Model:   "gpt-4",
		BaseURL: serverURL + "/openai",
		APIKey:  "test-key",
	}

	ctx := context.Background()
	err := provider.HealthCheck(ctx)

	require.Error(t, err)
}

func TestModel_HealthCheck_OpenAIProvider(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/v1/models", r.URL.Path)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"data": []map[string]string{
				{"id": "gpt-4", "object": "model"},
			},
		})
	}))
	defer server.Close()

	provider := &OpenAIProvider{
		Model:   "gpt-4",
		BaseURL: server.URL + "/v1",
		APIKey:  "test-key",
	}

	model := &Model{
		Model:    "gpt-4",
		Type:     "openai",
		Provider: provider,
	}

	ctx := context.Background()
	err := model.HealthCheck(ctx)

	require.NoError(t, err)
}

func TestModel_HealthCheck_AzureProvider(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Contains(t, r.URL.Path, "/chat/completions")

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"id":      "chatcmpl-test",
			"object":  "chat.completion",
			"created": 1234567890,
			"model":   "gpt-4",
			"choices": []map[string]interface{}{
				{
					"index": 0,
					"message": map[string]interface{}{
						"role":    "assistant",
						"content": "test response",
					},
					"finish_reason": "stop",
				},
			},
			"usage": map[string]interface{}{
				"prompt_tokens":     10,
				"completion_tokens": 5,
				"total_tokens":      15,
			},
		})
	}))
	defer server.Close()

	provider := &AzureProvider{
		Model:      "gpt-4",
		BaseURL:    server.URL + "/openai",
		APIKey:     "test-key",
		APIVersion: "2024-02-15-preview",
	}

	model := &Model{
		Model:    "gpt-4",
		Type:     "azure",
		Provider: provider,
	}

	ctx := context.Background()
	err := model.HealthCheck(ctx)

	require.NoError(t, err)
}

func TestModel_HealthCheck_NilProvider(t *testing.T) {
	model := &Model{
		Model:    "gpt-4",
		Type:     "openai",
		Provider: nil,
	}

	ctx := context.Background()
	err := model.HealthCheck(ctx)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "provider is nil")
}

func TestBedrockModel_HealthCheck_InitializesClient(t *testing.T) {
	bm := NewBedrockModel(
		"anthropic.claude-v2",
		"us-east-1",
		"",
		"test-access-key",
		"test-secret-key",
		"",
		"",
		nil,
	)

	ctx := context.Background()
	err := bm.HealthCheck(ctx)

	assert.NotNil(t, bm.client)
	require.NoError(t, err)
}

func TestBedrockModel_HealthCheck_ReusesCachedClient(t *testing.T) {
	bm := NewBedrockModel(
		"anthropic.claude-v2",
		"us-east-1",
		"",
		"test-access-key",
		"test-secret-key",
		"",
		"",
		nil,
	)

	ctx := context.Background()

	_ = bm.HealthCheck(ctx)
	firstClient := bm.client

	_ = bm.HealthCheck(ctx)
	secondClient := bm.client

	if firstClient != nil && secondClient != nil {
		assert.Equal(t, firstClient, secondClient, "Client should be reused across health checks")
	}
}

func TestModel_HealthCheck_BedrockProvider(t *testing.T) {
	bm := NewBedrockModel(
		"anthropic.claude-v2",
		"us-east-1",
		"",
		"test-access-key",
		"test-secret-key",
		"",
		"",
		nil,
	)

	model := &Model{
		Model:    "anthropic.claude-v2",
		Type:     "bedrock",
		Provider: bm,
	}

	ctx := context.Background()
	err := model.HealthCheck(ctx)

	require.NoError(t, err)
}

func TestOpenAIProvider_HealthCheck_ModelAvailable(t *testing.T) {
	callCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		assert.Equal(t, "/v1/models", r.URL.Path)
		assert.Equal(t, "GET", r.Method)
		assert.Contains(t, r.Header.Get("Authorization"), "Bearer test-key")

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"data": []map[string]string{
				{"id": "gpt-4", "object": "model"},
				{"id": "gpt-3.5-turbo", "object": "model"},
			},
		})
	}))
	defer server.Close()

	provider := &OpenAIProvider{
		Model:   "gpt-4",
		BaseURL: server.URL + "/v1",
		APIKey:  "test-key",
	}

	ctx := context.Background()
	err := provider.HealthCheck(ctx)

	require.NoError(t, err)
	assert.Equal(t, 1, callCount, "HealthCheck should make exactly one API call")
}

func TestAzureProvider_HealthCheck_ModelAvailable(t *testing.T) {
	callCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		assert.Contains(t, r.URL.Path, "/chat/completions")
		assert.Equal(t, "POST", r.Method)
		assert.Equal(t, "test-key", r.Header.Get("api-key"))

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"id":      "chatcmpl-test",
			"object":  "chat.completion",
			"created": 1234567890,
			"model":   "gpt-4",
			"choices": []map[string]interface{}{
				{
					"index": 0,
					"message": map[string]interface{}{
						"role":    "assistant",
						"content": "test response",
					},
					"finish_reason": "stop",
				},
			},
			"usage": map[string]interface{}{
				"prompt_tokens":     10,
				"completion_tokens": 5,
				"total_tokens":      15,
			},
		})
	}))
	defer server.Close()

	provider := &AzureProvider{
		Model:      "gpt-4",
		BaseURL:    server.URL + "/openai",
		APIKey:     "test-key",
		APIVersion: "2024-02-15-preview",
	}

	ctx := context.Background()
	err := provider.HealthCheck(ctx)

	require.NoError(t, err)
	assert.Equal(t, 1, callCount, "HealthCheck should make exactly one API call")
}

func TestModel_HealthCheck_DelegatesToOpenAIProvider(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/v1/models", r.URL.Path, "Should call models endpoint")

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"data": []map[string]string{
				{"id": "gpt-4", "object": "model"},
			},
		})
	}))
	defer server.Close()

	provider := &OpenAIProvider{
		Model:   "gpt-4",
		BaseURL: server.URL + "/v1",
		APIKey:  "test-key",
	}

	model := &Model{
		Model:    "gpt-4",
		Type:     "openai",
		Provider: provider,
	}

	ctx := context.Background()
	err := model.HealthCheck(ctx)

	require.NoError(t, err)
}

func TestModel_HealthCheck_DelegatesToAzureProvider(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Contains(t, r.URL.Path, "/chat/completions", "Should call chat completions endpoint")

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"id":      "chatcmpl-test",
			"object":  "chat.completion",
			"created": 1234567890,
			"model":   "gpt-4",
			"choices": []map[string]interface{}{
				{
					"index": 0,
					"message": map[string]interface{}{
						"role":    "assistant",
						"content": "test response",
					},
					"finish_reason": "stop",
				},
			},
			"usage": map[string]interface{}{
				"prompt_tokens":     10,
				"completion_tokens": 5,
				"total_tokens":      15,
			},
		})
	}))
	defer server.Close()

	provider := &AzureProvider{
		Model:      "gpt-4",
		BaseURL:    server.URL + "/openai",
		APIKey:     "test-key",
		APIVersion: "2024-02-15-preview",
	}

	model := &Model{
		Model:    "gpt-4",
		Type:     "azure",
		Provider: provider,
	}

	ctx := context.Background()
	err := model.HealthCheck(ctx)

	require.NoError(t, err)
}

func TestModel_HealthCheck_ProviderErrors(t *testing.T) {
	tests := []struct {
		name          string
		providerType  string
		statusCode    int
		errorMessage  string
		errorType     string
		expectedInErr string
		pathSuffix    string
	}{
		{
			name:          "OpenAI provider service unavailable",
			providerType:  "openai",
			statusCode:    http.StatusServiceUnavailable,
			errorMessage:  "Service unavailable",
			errorType:     "server_error",
			expectedInErr: "503",
			pathSuffix:    "/v1",
		},
		{
			name:          "Azure provider unauthorized",
			providerType:  "azure",
			statusCode:    http.StatusUnauthorized,
			errorMessage:  "Unauthorized",
			errorType:     "auth_error",
			expectedInErr: "401",
			pathSuffix:    "/openai",
		},
		{
			name:          "Anthropic provider overloaded",
			providerType:  "anthropic",
			statusCode:    http.StatusTooManyRequests,
			errorMessage:  "Rate limit exceeded",
			errorType:     "rate_limit_error",
			expectedInErr: "429",
			pathSuffix:    "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(tt.statusCode)
				_ = json.NewEncoder(w).Encode(map[string]interface{}{
					"error": map[string]interface{}{
						"message": tt.errorMessage,
						"type":    tt.errorType,
					},
				})
			}))
			defer server.Close()

			var model *Model

			switch tt.providerType {
			case "openai":
				provider := &OpenAIProvider{
					Model:   "gpt-4",
					BaseURL: server.URL + tt.pathSuffix,
					APIKey:  "test-key",
				}
				model = &Model{
					Model:    "gpt-4",
					Type:     tt.providerType,
					Provider: provider,
				}
			case "azure":
				provider := &AzureProvider{
					Model:   "gpt-4",
					BaseURL: server.URL + tt.pathSuffix,
					APIKey:  "invalid-key",
				}
				model = &Model{
					Model:    "gpt-4",
					Type:     tt.providerType,
					Provider: provider,
				}
			case "anthropic":
				provider := &AnthropicProvider{
					Model:   "claude-3-haiku-20240307",
					BaseURL: server.URL + tt.pathSuffix,
					APIKey:  "test-key",
				}
				model = &Model{
					Model:    "claude-3-haiku-20240307",
					Type:     tt.providerType,
					Provider: provider,
				}
			}

			ctx := context.Background()
			err := model.HealthCheck(ctx)

			require.Error(t, err)
			assert.Contains(t, err.Error(), tt.expectedInErr)
		})
	}
}

func TestAnthropicProvider_HealthCheck_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/v1/messages", r.URL.Path)
		assert.Equal(t, "POST", r.Method)
		assert.Contains(t, r.Header.Get("X-Api-Key"), "test-key")
		assert.Equal(t, "2023-06-01", r.Header.Get("anthropic-version"))

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"id":            "msg_test123",
			"type":          "message",
			"role":          "assistant",
			"content":       []map[string]interface{}{{"type": "text", "text": "Hello"}},
			"model":         "claude-3-haiku-20240307",
			"stop_reason":   "end_turn",
			"stop_sequence": nil,
			"usage": map[string]interface{}{
				"input_tokens":  10,
				"output_tokens": 1,
			},
		})
	}))
	defer server.Close()

	provider := &AnthropicProvider{
		Model:   "claude-3-haiku-20240307",
		BaseURL: server.URL,
		APIKey:  "test-key",
	}

	ctx := context.Background()
	err := provider.HealthCheck(ctx)

	require.NoError(t, err)
}

func TestAnthropicProvider_HealthCheck_Unauthorized(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/v1/messages", r.URL.Path)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"type": "error",
			"error": map[string]interface{}{
				"type":    "authentication_error",
				"message": "Invalid API Key",
			},
		})
	}))
	defer server.Close()

	provider := &AnthropicProvider{
		Model:   "claude-3-haiku-20240307",
		BaseURL: server.URL,
		APIKey:  "invalid-key",
	}

	ctx := context.Background()
	err := provider.HealthCheck(ctx)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "401")
}

func TestAnthropicProvider_HealthCheck_ServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/v1/messages", r.URL.Path)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"type": "error",
			"error": map[string]interface{}{
				"type":    "overloaded_error",
				"message": "Service temporarily unavailable",
			},
		})
	}))
	defer server.Close()

	provider := &AnthropicProvider{
		Model:   "claude-3-haiku-20240307",
		BaseURL: server.URL,
		APIKey:  "test-key",
	}

	ctx := context.Background()
	err := provider.HealthCheck(ctx)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "503")
}

func TestAnthropicProvider_HealthCheck_NetworkError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	serverURL := server.URL
	server.Close()

	provider := &AnthropicProvider{
		Model:   "claude-3-haiku-20240307",
		BaseURL: serverURL,
		APIKey:  "test-key",
	}

	ctx := context.Background()
	err := provider.HealthCheck(ctx)

	require.Error(t, err)
}

func TestModel_HealthCheck_AnthropicProvider(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/v1/messages", r.URL.Path)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"id":            "msg_test123",
			"type":          "message",
			"role":          "assistant",
			"content":       []map[string]interface{}{{"type": "text", "text": "Hello"}},
			"model":         "claude-3-haiku-20240307",
			"stop_reason":   "end_turn",
			"stop_sequence": nil,
			"usage": map[string]interface{}{
				"input_tokens":  10,
				"output_tokens": 1,
			},
		})
	}))
	defer server.Close()

	provider := &AnthropicProvider{
		Model:   "claude-3-haiku-20240307",
		BaseURL: server.URL,
		APIKey:  "test-key",
	}

	model := &Model{
		Model:    "claude-3-haiku-20240307",
		Type:     "anthropic",
		Provider: provider,
	}

	ctx := context.Background()
	err := model.HealthCheck(ctx)

	require.NoError(t, err)
}

func TestAnthropicProvider_HealthCheck_ModelAvailable(t *testing.T) {
	callCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		assert.Equal(t, "/v1/messages", r.URL.Path)
		assert.Equal(t, "POST", r.Method)
		assert.Contains(t, r.Header.Get("X-Api-Key"), "test-key")

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"id":            "msg_test123",
			"type":          "message",
			"role":          "assistant",
			"content":       []map[string]interface{}{{"type": "text", "text": "Hello"}},
			"model":         "claude-3-haiku-20240307",
			"stop_reason":   "end_turn",
			"stop_sequence": nil,
			"usage": map[string]interface{}{
				"input_tokens":  10,
				"output_tokens": 1,
			},
		})
	}))
	defer server.Close()

	provider := &AnthropicProvider{
		Model:   "claude-3-haiku-20240307",
		BaseURL: server.URL,
		APIKey:  "test-key",
	}

	ctx := context.Background()
	err := provider.HealthCheck(ctx)

	require.NoError(t, err)
	assert.Equal(t, 1, callCount, "HealthCheck should make exactly one API call")
}

func TestModel_HealthCheck_DelegatesToAnthropicProvider(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/v1/messages", r.URL.Path, "Should call messages endpoint")

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"id":            "msg_test123",
			"type":          "message",
			"role":          "assistant",
			"content":       []map[string]interface{}{{"type": "text", "text": "Hello"}},
			"model":         "claude-3-haiku-20240307",
			"stop_reason":   "end_turn",
			"stop_sequence": nil,
			"usage": map[string]interface{}{
				"input_tokens":  10,
				"output_tokens": 1,
			},
		})
	}))
	defer server.Close()

	provider := &AnthropicProvider{
		Model:   "claude-3-haiku-20240307",
		BaseURL: server.URL,
		APIKey:  "test-key",
	}

	model := &Model{
		Model:    "claude-3-haiku-20240307",
		Type:     "anthropic",
		Provider: provider,
	}

	ctx := context.Background()
	err := model.HealthCheck(ctx)

	require.NoError(t, err)
}

func TestAnthropicProvider_HealthCheck_WithCustomHeaders(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/v1/messages", r.URL.Path)
		assert.Equal(t, "custom-value", r.Header.Get("X-Custom-Header"))

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"id":            "msg_test123",
			"type":          "message",
			"role":          "assistant",
			"content":       []map[string]interface{}{{"type": "text", "text": "Hello"}},
			"model":         "claude-3-haiku-20240307",
			"stop_reason":   "end_turn",
			"stop_sequence": nil,
			"usage": map[string]interface{}{
				"input_tokens":  10,
				"output_tokens": 1,
			},
		})
	}))
	defer server.Close()

	provider := &AnthropicProvider{
		Model:   "claude-3-haiku-20240307",
		BaseURL: server.URL,
		APIKey:  "test-key",
		Headers: map[string]string{
			"X-Custom-Header": "custom-value",
		},
	}

	ctx := context.Background()
	err := provider.HealthCheck(ctx)

	require.NoError(t, err)
}

func TestAnthropicProvider_HealthCheck_BaseURLHandling(t *testing.T) {
	tests := []struct {
		name         string
		baseURL      string
		expectedPath string
	}{
		{
			name:         "BaseURL without /v1",
			baseURL:      "",
			expectedPath: "/v1/messages",
		},
		{
			name:         "BaseURL with trailing slash",
			baseURL:      "",
			expectedPath: "/v1/messages",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				assert.Equal(t, tt.expectedPath, r.URL.Path)

				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusOK)
				_ = json.NewEncoder(w).Encode(map[string]interface{}{
					"id":            "msg_test123",
					"type":          "message",
					"role":          "assistant",
					"content":       []map[string]interface{}{{"type": "text", "text": "Hello"}},
					"model":         "claude-3-haiku-20240307",
					"stop_reason":   "end_turn",
					"stop_sequence": nil,
					"usage": map[string]interface{}{
						"input_tokens":  10,
						"output_tokens": 1,
					},
				})
			}))
			defer server.Close()

			baseURL := server.URL
			if tt.baseURL != "" {
				baseURL = tt.baseURL
			}

			provider := &AnthropicProvider{
				Model:   "claude-3-haiku-20240307",
				BaseURL: baseURL,
				APIKey:  "test-key",
			}

			ctx := context.Background()
			err := provider.HealthCheck(ctx)

			require.NoError(t, err)
		})
	}
}
