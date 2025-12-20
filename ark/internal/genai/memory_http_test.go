package genai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/openai/openai-go"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/eventing"
)

func TestUnmarshalMessageRobust(t *testing.T) {
	testCases := []struct {
		name        string
		jsonInput   string
		expectError bool
		description string
	}{
		{
			name:        "valid discriminated union user message",
			jsonInput:   `{"role": "user", "content": "hello"}`,
			expectError: false,
			description: "Should work with primary discriminated union path",
		},
		{
			name:        "valid discriminated union assistant message",
			jsonInput:   `{"role": "assistant", "content": "Hi there!"}`,
			expectError: false,
			description: "Should work with primary discriminated union path",
		},
		{
			name:        "valid discriminated union system message",
			jsonInput:   `{"role": "system", "content": "You are helpful"}`,
			expectError: false,
			description: "Should work with primary discriminated union path",
		},
		{
			name:        "simple user message (fallback)",
			jsonInput:   `{"role": "user", "content": "simple format"}`,
			expectError: false,
			description: "Should work via fallback path if discriminated union fails",
		},
		{
			name:        "message with missing content",
			jsonInput:   `{"role": "user"}`,
			expectError: false,
			description: "Content is optional, should work",
		},
		{
			name:        "message with empty content",
			jsonInput:   `{"role": "assistant", "content": ""}`,
			expectError: false,
			description: "Empty content should work",
		},
		{
			name:        "future role - developer",
			jsonInput:   `{"role": "developer", "content": "Fix this bug"}`,
			expectError: false,
			description: "Unknown roles should fallback to user message (future-proof)",
		},
		{
			name:        "future role - function",
			jsonInput:   `{"role": "function", "content": "result data"}`,
			expectError: false,
			description: "Unknown roles should fallback to user message (future-proof)",
		},
		{
			name:        "future role - tool",
			jsonInput:   `{"role": "tool", "content": "tool output"}`,
			expectError: false,
			description: "Unknown roles should fallback to user message (future-proof)",
		},
		{
			name:        "message with extra fields",
			jsonInput:   `{"role": "user", "content": "hello", "extra": "ignored", "timestamp": 123}`,
			expectError: false,
			description: "Extra fields should be ignored",
		},
		{
			name:        "invalid - missing role",
			jsonInput:   `{"content": "hello"}`,
			expectError: true,
			description: "Missing role should fail",
		},
		{
			name:        "invalid - empty role",
			jsonInput:   `{"role": "", "content": "hello"}`,
			expectError: true,
			description: "Empty role should fail",
		},
		{
			name:        "invalid - malformed JSON",
			jsonInput:   `{malformed json}`,
			expectError: true,
			description: "Malformed JSON should fail",
		},
		{
			name:        "invalid - empty object",
			jsonInput:   `{}`,
			expectError: true,
			description: "Empty object should fail",
		},
		{
			name:        "invalid - null",
			jsonInput:   `null`,
			expectError: true,
			description: "Null should fail",
		},
		{
			name:        "invalid - empty string",
			jsonInput:   `""`,
			expectError: true,
			description: "Empty string should fail",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			rawJSON := json.RawMessage(tc.jsonInput)
			result, err := unmarshalMessageRobust(rawJSON)

			switch {
			case tc.expectError && err == nil:
				t.Errorf("Expected error for %s, but got none. Description: %s", tc.name, tc.description)
			case !tc.expectError && err != nil:
				t.Errorf("Unexpected error for %s: %v. Description: %s", tc.name, err, tc.description)
			case !tc.expectError && result == (openai.ChatCompletionMessageParamUnion{}):
				t.Errorf("Got empty message for %s. Description: %s", tc.name, tc.description)
			}
		})
	}
}

func TestUnmarshalMessageRobustFutureRoles(t *testing.T) {
	futureRoles := []string{"developer", "function", "tool", "moderator", "agent"}

	for _, role := range futureRoles {
		t.Run(role, func(t *testing.T) {
			jsonInput := `{"role": "` + role + `", "content": "test"}`
			result, err := unmarshalMessageRobust(json.RawMessage(jsonInput))
			if err != nil {
				t.Errorf("Future role '%s' should not fail: %v", role, err)
			}
			if result == (openai.ChatCompletionMessageParamUnion{}) {
				t.Errorf("Future role '%s' should produce valid message", role)
			}
		})
	}
}

func setupMemoryTestClient(objects []client.Object) client.Client {
	scheme := runtime.NewScheme()
	_ = corev1.AddToScheme(scheme)
	_ = arkv1alpha1.AddToScheme(scheme)

	return fake.NewClientBuilder().
		WithScheme(scheme).
		WithObjects(objects...).
		WithStatusSubresource(&arkv1alpha1.Memory{}).
		Build()
}

type noOpMemoryRecorder struct{}

func (n *noOpMemoryRecorder) InitializeQueryContext(ctx context.Context, query *arkv1alpha1.Query) context.Context {
	return ctx
}

func (n *noOpMemoryRecorder) Start(ctx context.Context, operation, description string, data map[string]string) context.Context {
	return ctx
}

func (n *noOpMemoryRecorder) Complete(ctx context.Context, operation, result string, data map[string]string) {
}

func (n *noOpMemoryRecorder) Fail(ctx context.Context, operation, result string, err error, data map[string]string) {
}

var _ eventing.MemoryRecorder = (*noOpMemoryRecorder)(nil)

func TestHTTPMemoryAddMessagesWithHeaders(t *testing.T) {
	tests := []struct {
		name            string
		headers         map[string]string
		expectedHeaders map[string]string
		messages        []Message
	}{
		{
			name: "single authorization header",
			headers: map[string]string{
				"Authorization": "Bearer test-token",
			},
			expectedHeaders: map[string]string{
				"Authorization": "Bearer test-token",
			},
			messages: []Message{
				Message(openai.UserMessage("test message")),
			},
		},
		{
			name: "multiple custom headers",
			headers: map[string]string{
				"Authorization":   "Bearer multi-token",
				"X-Custom-Header": "custom-value",
				"X-API-Key":       "api-key-123",
			},
			expectedHeaders: map[string]string{
				"Authorization":   "Bearer multi-token",
				"X-Custom-Header": "custom-value",
				"X-API-Key":       "api-key-123",
			},
			messages: []Message{
				Message(openai.UserMessage("message 1")),
				Message(openai.AssistantMessage("message 2")),
			},
		},
		{
			name:            "no custom headers",
			headers:         map[string]string{},
			expectedHeaders: map[string]string{},
			messages: []Message{
				Message(openai.UserMessage("test")),
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			receivedHeaders := make(http.Header)

			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == MessagesEndpoint && r.Method == http.MethodPost {
					for name := range tt.expectedHeaders {
						receivedHeaders.Set(name, r.Header.Get(name))
					}
					w.WriteHeader(http.StatusOK)
					return
				}
				w.WriteHeader(http.StatusNotFound)
			}))
			defer server.Close()

			resolvedAddress := server.URL

			// Convert headers map to Header slice for Memory spec
			headers := make([]arkv1alpha1.Header, 0, len(tt.headers))
			for name, value := range tt.headers {
				headers = append(headers, arkv1alpha1.Header{
					Name: name,
					Value: arkv1alpha1.HeaderValue{
						Value: value,
					},
				})
			}

			memory := &arkv1alpha1.Memory{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-memory",
					Namespace: "default",
				},
				Spec: arkv1alpha1.MemorySpec{
					Address: arkv1alpha1.ValueSource{
						Value: server.URL,
					},
					Headers: headers,
				},
				Status: arkv1alpha1.MemoryStatus{
					LastResolvedAddress: &resolvedAddress,
					Phase:               "ready",
				},
			}

			fakeClient := setupMemoryTestClient([]client.Object{memory})

			httpMemory := &HTTPMemory{
				client:           fakeClient,
				httpClient:       server.Client(),
				baseURL:          server.URL,
				conversationId:   "test-conv-id",
				name:             "test-memory",
				namespace:        "default",
				headers:          make(map[string]string),
				eventingRecorder: &noOpMemoryRecorder{},
			}

			ctx := context.Background()
			err := httpMemory.AddMessages(ctx, "query-id", tt.messages)
			require.NoError(t, err)

			for name, expectedValue := range tt.expectedHeaders {
				require.Equal(t, expectedValue, receivedHeaders.Get(name),
					"Header %s should have value %s", name, expectedValue)
			}
		})
	}
}

func TestHTTPMemoryGetMessagesWithHeaders(t *testing.T) {
	tests := []struct {
		name            string
		headers         map[string]string
		expectedHeaders map[string]string
	}{
		{
			name: "authorization header in get request",
			headers: map[string]string{
				"Authorization": "Bearer get-token",
			},
			expectedHeaders: map[string]string{
				"Authorization": "Bearer get-token",
			},
		},
		{
			name: "multiple headers in get request",
			headers: map[string]string{
				"Authorization": "Bearer multi-get-token",
				"X-Trace-Id":    "trace-123",
			},
			expectedHeaders: map[string]string{
				"Authorization": "Bearer multi-get-token",
				"X-Trace-Id":    "trace-123",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			receivedHeaders := make(http.Header)

			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == MessagesEndpoint && r.Method == http.MethodGet {
					for name := range tt.expectedHeaders {
						receivedHeaders.Set(name, r.Header.Get(name))
					}
					w.Header().Set("Content-Type", "application/json")
					response := MessagesResponse{
						Messages: []MessageRecord{
							{
								Message: json.RawMessage(`{"role": "user", "content": "hello"}`),
							},
						},
					}
					_ = json.NewEncoder(w).Encode(response)
					return
				}
				w.WriteHeader(http.StatusNotFound)
			}))
			defer server.Close()

			resolvedAddress := server.URL

			// Convert headers map to Header slice for Memory spec
			headers := make([]arkv1alpha1.Header, 0, len(tt.headers))
			for name, value := range tt.headers {
				headers = append(headers, arkv1alpha1.Header{
					Name: name,
					Value: arkv1alpha1.HeaderValue{
						Value: value,
					},
				})
			}

			memory := &arkv1alpha1.Memory{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-memory",
					Namespace: "default",
				},
				Spec: arkv1alpha1.MemorySpec{
					Address: arkv1alpha1.ValueSource{
						Value: server.URL,
					},
					Headers: headers,
				},
				Status: arkv1alpha1.MemoryStatus{
					LastResolvedAddress: &resolvedAddress,
					Phase:               "ready",
				},
			}

			fakeClient := setupMemoryTestClient([]client.Object{memory})

			httpMemory := &HTTPMemory{
				client:           fakeClient,
				httpClient:       server.Client(),
				baseURL:          server.URL,
				conversationId:   "test-conv-id",
				name:             "test-memory",
				namespace:        "default",
				headers:          make(map[string]string),
				eventingRecorder: &noOpMemoryRecorder{},
			}

			ctx := context.Background()
			messages, err := httpMemory.GetMessages(ctx)
			require.NoError(t, err)
			require.NotEmpty(t, messages)

			for name, expectedValue := range tt.expectedHeaders {
				require.Equal(t, expectedValue, receivedHeaders.Get(name),
					"Header %s should have value %s", name, expectedValue)
			}
		})
	}
}

func TestHTTPMemoryHeadersLoadedFromStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == ConversationsEndpoint {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]string{"conversation_id": "new-conv-id"})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	resolvedAddress := server.URL
	expectedHeaders := map[string]string{
		"Authorization":   "Bearer status-token",
		"X-Custom-Header": "status-value",
	}

	memory := &arkv1alpha1.Memory{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "header-memory",
			Namespace: "default",
		},
		Spec: arkv1alpha1.MemorySpec{
			Address: arkv1alpha1.ValueSource{
				Value: server.URL,
			},
			Headers: []arkv1alpha1.Header{
				{
					Name: "Authorization",
					Value: arkv1alpha1.HeaderValue{
						Value: "Bearer status-token",
					},
				},
				{
					Name: "X-Custom-Header",
					Value: arkv1alpha1.HeaderValue{
						Value: "status-value",
					},
				},
			},
		},
		Status: arkv1alpha1.MemoryStatus{
			LastResolvedAddress: &resolvedAddress,
			Phase:               "ready",
		},
	}

	fakeClient := setupMemoryTestClient([]client.Object{memory})

	ctx := context.Background()
	httpMemory, err := NewHTTPMemory(ctx, fakeClient, "header-memory", "default", Config{}, &noOpMemoryRecorder{})
	require.NoError(t, err)

	mem := httpMemory.(*HTTPMemory)
	require.Equal(t, expectedHeaders, mem.headers, "Headers should be resolved from Memory spec on-demand")
}

func TestHTTPMemoryHeadersUpdatedOnResolve(t *testing.T) {
	callCount := 0
	receivedHeaders := make(http.Header)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == MessagesEndpoint && r.Method == http.MethodPost {
			callCount++
			receivedHeaders = r.Header.Clone()
			w.WriteHeader(http.StatusOK)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	resolvedAddress := server.URL
	memory := &arkv1alpha1.Memory{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "updating-memory",
			Namespace: "default",
		},
		Spec: arkv1alpha1.MemorySpec{
			Address: arkv1alpha1.ValueSource{
				Value: server.URL,
			},
			Headers: []arkv1alpha1.Header{
				{
					Name: "Authorization",
					Value: arkv1alpha1.HeaderValue{
						Value: "Bearer updated-token",
					},
				},
				{
					Name: "X-New-Header",
					Value: arkv1alpha1.HeaderValue{
						Value: "new-value",
					},
				},
			},
		},
		Status: arkv1alpha1.MemoryStatus{
			LastResolvedAddress: &resolvedAddress,
			Phase:               "ready",
		},
	}

	fakeClient := setupMemoryTestClient([]client.Object{memory})

	httpMemory := &HTTPMemory{
		client:           fakeClient,
		httpClient:       server.Client(),
		baseURL:          server.URL,
		conversationId:   "test-conv-id",
		name:             "updating-memory",
		namespace:        "default",
		headers:          map[string]string{},
		eventingRecorder: &noOpMemoryRecorder{},
	}

	ctx := context.Background()
	err := httpMemory.AddMessages(ctx, "query-id", []Message{Message(openai.UserMessage("test"))})
	require.NoError(t, err)

	require.Equal(t, "Bearer updated-token", receivedHeaders.Get("Authorization"),
		"Authorization header should be updated from status")
	require.Equal(t, "new-value", receivedHeaders.Get("X-New-Header"),
		"New header should be added from status")
}

func TestHTTPMemoryEmptyHeaders(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == MessagesEndpoint && r.Method == http.MethodPost {
			w.WriteHeader(http.StatusOK)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	resolvedAddress := server.URL
	memory := &arkv1alpha1.Memory{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "no-header-memory",
			Namespace: "default",
		},
		Spec: arkv1alpha1.MemorySpec{
			Address: arkv1alpha1.ValueSource{
				Value: server.URL,
			},
		},
		Status: arkv1alpha1.MemoryStatus{
			LastResolvedAddress: &resolvedAddress,
			Phase:               "ready",
		},
	}

	fakeClient := setupMemoryTestClient([]client.Object{memory})

	httpMemory := &HTTPMemory{
		client:           fakeClient,
		httpClient:       server.Client(),
		baseURL:          server.URL,
		conversationId:   "test-conv-id",
		name:             "no-header-memory",
		namespace:        "default",
		headers:          nil,
		eventingRecorder: &noOpMemoryRecorder{},
	}

	ctx := context.Background()
	err := httpMemory.AddMessages(ctx, "query-id", []Message{Message(openai.UserMessage("test"))})
	require.NoError(t, err)
}

func TestHTTPMemoryWithQueryParameterRefHeaders(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == ConversationsEndpoint {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]string{"conversation_id": "test-conv-id"})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	resolvedAddress := server.URL
	memory := &arkv1alpha1.Memory{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "query-param-ref-memory",
			Namespace: "default",
		},
		Spec: arkv1alpha1.MemorySpec{
			Address: arkv1alpha1.ValueSource{
				Value: server.URL,
			},
			Headers: []arkv1alpha1.Header{
				{
					Name: "X-User-ID",
					Value: arkv1alpha1.HeaderValue{
						ValueFrom: &arkv1alpha1.HeaderValueSource{
							QueryParameterRef: &arkv1alpha1.QueryParameterReference{
								Name: "userId",
							},
						},
					},
				},
			},
		},
		Status: arkv1alpha1.MemoryStatus{
			LastResolvedAddress: &resolvedAddress,
			Phase:               "ready",
		},
	}

	fakeClient := setupMemoryTestClient([]client.Object{memory})

	ctx := context.Background()
	_, err := NewHTTPMemory(ctx, fakeClient, "query-param-ref-memory", "default", Config{}, &noOpMemoryRecorder{})

	require.Error(t, err, "Should fail when queryParameterRef is used without query context")
	require.Contains(t, err.Error(), "queryParameterRef requires query context")
}

func TestNewHTTPMemoryWithMixedHeaderSources(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == ConversationsEndpoint {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]string{"conversation_id": "test-conv-id"})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "api-secret",
			Namespace: "default",
		},
		Data: map[string][]byte{
			"token": []byte("Bearer secret-token-123"),
		},
	}

	configMap := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "api-config",
			Namespace: "default",
		},
		Data: map[string]string{
			"api-key": "config-api-key-456",
		},
	}

	resolvedAddress := server.URL
	memory := &arkv1alpha1.Memory{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "mixed-headers-memory",
			Namespace: "default",
		},
		Spec: arkv1alpha1.MemorySpec{
			Address: arkv1alpha1.ValueSource{
				Value: server.URL,
			},
			Headers: []arkv1alpha1.Header{
				{
					Name: "X-Direct",
					Value: arkv1alpha1.HeaderValue{
						Value: "direct-value",
					},
				},
				{
					Name: "Authorization",
					Value: arkv1alpha1.HeaderValue{
						ValueFrom: &arkv1alpha1.HeaderValueSource{
							SecretKeyRef: &corev1.SecretKeySelector{
								LocalObjectReference: corev1.LocalObjectReference{
									Name: "api-secret",
								},
								Key: "token",
							},
						},
					},
				},
				{
					Name: "X-API-Key",
					Value: arkv1alpha1.HeaderValue{
						ValueFrom: &arkv1alpha1.HeaderValueSource{
							ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
								LocalObjectReference: corev1.LocalObjectReference{
									Name: "api-config",
								},
								Key: "api-key",
							},
						},
					},
				},
			},
		},
		Status: arkv1alpha1.MemoryStatus{
			LastResolvedAddress: &resolvedAddress,
			Phase:               "ready",
		},
	}

	fakeClient := setupMemoryTestClient([]client.Object{memory, secret, configMap})

	ctx := context.Background()
	httpMemory, err := NewHTTPMemory(ctx, fakeClient, "mixed-headers-memory", "default", Config{}, &noOpMemoryRecorder{})
	require.NoError(t, err)

	mem := httpMemory.(*HTTPMemory)
	require.Equal(t, "direct-value", mem.headers["X-Direct"])
	require.Equal(t, "Bearer secret-token-123", mem.headers["Authorization"])
	require.Equal(t, "config-api-key-456", mem.headers["X-API-Key"])
}
