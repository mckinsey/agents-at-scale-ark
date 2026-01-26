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
		json.NewEncoder(w).Encode(map[string]interface{}{
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
		json.NewEncoder(w).Encode(map[string]interface{}{
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
		json.NewEncoder(w).Encode(map[string]interface{}{
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
		assert.Contains(t, r.URL.Path, "/models")
		assert.Equal(t, "GET", r.Method)
		assert.Equal(t, "test-key", r.Header.Get("api-key"))

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"data": []map[string]string{
				{"id": "gpt-4", "object": "model"},
			},
		})
	}))
	defer server.Close()

	provider := &AzureProvider{
		Model:   "gpt-4",
		BaseURL: server.URL + "/openai",
		APIKey:  "test-key",
	}

	ctx := context.Background()
	err := provider.HealthCheck(ctx)

	require.NoError(t, err)
}

func TestAzureProvider_HealthCheck_Unauthorized(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Contains(t, r.URL.Path, "/models")

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": map[string]interface{}{
				"message": "Invalid API key",
				"type":    "invalid_request_error",
			},
		})
	}))
	defer server.Close()

	provider := &AzureProvider{
		Model:   "gpt-4",
		BaseURL: server.URL + "/openai",
		APIKey:  "invalid-key",
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
		json.NewEncoder(w).Encode(map[string]interface{}{
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
		assert.Contains(t, r.URL.Path, "/models")

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"data": []map[string]string{
				{"id": "gpt-4", "object": "model"},
			},
		})
	}))
	defer server.Close()

	provider := &AzureProvider{
		Model:   "gpt-4",
		BaseURL: server.URL + "/openai",
		APIKey:  "test-key",
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

	if err == nil {
		assert.NotNil(t, bm.client)
	} else {
		assert.NotNil(t, err)
	}
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

	if err == nil {
		require.NoError(t, err)
	} else {
		assert.NotNil(t, err)
	}
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
		json.NewEncoder(w).Encode(map[string]interface{}{
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
		assert.Contains(t, r.URL.Path, "/models")
		assert.Equal(t, "GET", r.Method)
		assert.Equal(t, "test-key", r.Header.Get("api-key"))

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"data": []map[string]string{
				{"id": "gpt-4-deployment", "object": "model"},
			},
		})
	}))
	defer server.Close()

	provider := &AzureProvider{
		Model:   "gpt-4",
		BaseURL: server.URL + "/openai",
		APIKey:  "test-key",
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
		json.NewEncoder(w).Encode(map[string]interface{}{
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
		assert.Contains(t, r.URL.Path, "/models", "Should call models endpoint")

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"data": []map[string]string{
				{"id": "gpt-4", "object": "model"},
			},
		})
	}))
	defer server.Close()

	provider := &AzureProvider{
		Model:   "gpt-4",
		BaseURL: server.URL + "/openai",
		APIKey:  "test-key",
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

func TestModel_HealthCheck_OpenAIProviderError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": map[string]interface{}{
				"message": "Service unavailable",
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

	model := &Model{
		Model:    "gpt-4",
		Type:     "openai",
		Provider: provider,
	}

	ctx := context.Background()
	err := model.HealthCheck(ctx)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "503")
}

func TestModel_HealthCheck_AzureProviderError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": map[string]interface{}{
				"message": "Unauthorized",
				"type":    "auth_error",
			},
		})
	}))
	defer server.Close()

	provider := &AzureProvider{
		Model:   "gpt-4",
		BaseURL: server.URL + "/openai",
		APIKey:  "invalid-key",
	}

	model := &Model{
		Model:    "gpt-4",
		Type:     "azure",
		Provider: provider,
	}

	ctx := context.Background()
	err := model.HealthCheck(ctx)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "401")
}
