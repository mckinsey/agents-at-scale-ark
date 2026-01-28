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

			if tt.providerType == "openai" {
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
			} else {
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
			}

			ctx := context.Background()
			err := model.HealthCheck(ctx)

			require.Error(t, err)
			assert.Contains(t, err.Error(), tt.expectedInErr)
		})
	}
}
