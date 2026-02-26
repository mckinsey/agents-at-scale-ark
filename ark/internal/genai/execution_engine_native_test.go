package genai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/openai/openai-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
)

const (
	testEngineName    = "langchain-engine"
	testEngineTypeA2A = "a2a-langchain"
	testEngineNS      = "default"
)

type testExecutionEngineRecorder struct{}

func (testExecutionEngineRecorder) InitializeQueryContext(ctx context.Context, _ *arkv1alpha1.Query) context.Context {
	return ctx
}

func (testExecutionEngineRecorder) Start(ctx context.Context, _, _ string, _ map[string]string) context.Context {
	return ctx
}

func (testExecutionEngineRecorder) Complete(context.Context, string, string, map[string]string) {}

func (testExecutionEngineRecorder) Fail(context.Context, string, string, error, map[string]string) {}

func (testExecutionEngineRecorder) AddressResolutionFailed(context.Context, runtime.Object, string) {}

func TestExecutionEngineClientExecuteA2AIncludesNativePayload(t *testing.T) {
	var capturedRequest ExecutionEngineRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/execute-a2a", r.URL.Path)
		require.NoError(t, json.NewDecoder(r.Body).Decode(&capturedRequest))
		response := ExecutionEngineResponse{
			Messages: []ExecutionEngineMessage{
				{Role: RoleAssistant, Content: "native-from-compat"},
			},
		}
		require.NoError(t, json.NewEncoder(w).Encode(response))
	}))
	defer server.Close()

	scheme := runtime.NewScheme()
	require.NoError(t, arkv1prealpha1.AddToScheme(scheme))

	engine := &arkv1prealpha1.ExecutionEngine{}
	engine.Name = testEngineName
	engine.Namespace = testEngineNS
	engine.Spec.Type = testEngineTypeA2A
	engine.Status.LastResolvedAddress = server.URL
	k8sClient := fake.NewClientBuilder().WithScheme(scheme).WithObjects(engine).Build()

	engineClient := NewExecutionEngineClient(k8sClient, testExecutionEngineRecorder{})
	engineRef := &arkv1alpha1.ExecutionEngineRef{Name: testEngineName}
	agentConfig := AgentConfig{Name: "test-agent", Namespace: testEngineNS}
	userInput := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{protocol.NewTextPart("hello")})
	history := []protocol.Message{
		protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{protocol.NewTextPart("prior")}),
	}
	tools := []ToolDefinition{{Name: "read_file", Description: "Read file"}}

	ctx := WithA2AContextID(context.Background(), "ctx-1")
	ctx = WithQueryContext(ctx, "task-1", "", "")
	messages, err := engineClient.ExecuteA2A(ctx, engineRef, agentConfig, userInput, history, tools)
	require.NoError(t, err)

	assert.Equal(t, A2APayloadModeNative, capturedRequest.PayloadMode)
	require.NotNil(t, capturedRequest.A2AUserInput)
	assert.Equal(t, protocol.MessageRoleUser, capturedRequest.A2AUserInput.Role)
	require.Len(t, capturedRequest.A2AHistory, 1)
	assert.Equal(t, protocol.MessageRoleAgent, capturedRequest.A2AHistory[0].Role)
	assert.Nil(t, capturedRequest.UserInput)
	assert.Len(t, capturedRequest.History, 0)
	require.Len(t, capturedRequest.Tools, 1)
	assert.Equal(t, "read_file", capturedRequest.Tools[0].Name)
	require.Len(t, messages, 1)
	assert.Equal(t, "native-from-compat", ExtractA2ATextFromMessage(messages[0]))
	require.NotNil(t, messages[0].ContextID)
	assert.Equal(t, "ctx-1", *messages[0].ContextID)
	require.NotNil(t, messages[0].TaskID)
	assert.Equal(t, "task-1", *messages[0].TaskID)
}

func TestExecutionEngineClientExecuteA2AReturnsNativeMessages(t *testing.T) {
	responseMessage := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("native"),
	})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/execute-a2a", r.URL.Path)
		response := ExecutionEngineResponse{
			A2AMessages: []protocol.Message{responseMessage},
		}
		require.NoError(t, json.NewEncoder(w).Encode(response))
	}))
	defer server.Close()

	scheme := runtime.NewScheme()
	require.NoError(t, arkv1prealpha1.AddToScheme(scheme))

	engine := &arkv1prealpha1.ExecutionEngine{}
	engine.Name = testEngineName
	engine.Namespace = testEngineNS
	engine.Spec.Type = testEngineTypeA2A
	engine.Status.LastResolvedAddress = server.URL
	k8sClient := fake.NewClientBuilder().WithScheme(scheme).WithObjects(engine).Build()

	engineClient := NewExecutionEngineClient(k8sClient, testExecutionEngineRecorder{})
	engineRef := &arkv1alpha1.ExecutionEngineRef{Name: testEngineName}
	agentConfig := AgentConfig{Name: "test-agent", Namespace: testEngineNS}
	userInput := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{protocol.NewTextPart("hello")})

	messages, err := engineClient.ExecuteA2A(context.Background(), engineRef, agentConfig, userInput, nil, nil)
	require.NoError(t, err)
	require.Len(t, messages, 1)
	assert.Equal(t, protocol.MessageRoleAgent, messages[0].Role)
	assert.Equal(t, "native", ExtractA2ATextFromMessage(messages[0]))
}

func TestExecutionEngineClientExecuteA2AConvertsCompatImagePartsInExperimentalMode(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/execute-a2a", r.URL.Path)
		response := ExecutionEngineResponse{
			Messages: []ExecutionEngineMessage{
				{
					Role: RoleUser,
					ContentParts: []openai.ChatCompletionContentPartUnionParam{
						openai.TextContentPart("describe this"),
						openai.ImageContentPart(openai.ChatCompletionContentPartImageImageURLParam{
							URL: "data:image/png;base64,YWJj",
						}),
					},
				},
			},
		}
		require.NoError(t, json.NewEncoder(w).Encode(response))
	}))
	defer server.Close()

	scheme := runtime.NewScheme()
	require.NoError(t, arkv1prealpha1.AddToScheme(scheme))

	engine := &arkv1prealpha1.ExecutionEngine{}
	engine.Name = testEngineName
	engine.Namespace = testEngineNS
	engine.Spec.Type = testEngineTypeA2A
	engine.Status.LastResolvedAddress = server.URL
	k8sClient := fake.NewClientBuilder().WithScheme(scheme).WithObjects(engine).Build()

	engineClient := NewExecutionEngineClient(k8sClient, testExecutionEngineRecorder{})
	engineRef := &arkv1alpha1.ExecutionEngineRef{Name: testEngineName}
	agentConfig := AgentConfig{Name: "test-agent", Namespace: testEngineNS}
	userInput := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{protocol.NewTextPart("hello")})

	messages, err := engineClient.ExecuteA2A(context.Background(), engineRef, agentConfig, userInput, nil, nil)
	require.NoError(t, err)
	require.Len(t, messages, 1)
	require.Len(t, messages[0].Parts, 2)

	textPart, ok := messages[0].Parts[0].(protocol.TextPart)
	require.True(t, ok)
	assert.Equal(t, "describe this", textPart.Text)

	filePart, ok := messages[0].Parts[1].(protocol.FilePart)
	require.True(t, ok)
	fileWithURI, ok := filePart.File.(*protocol.FileWithURI)
	require.True(t, ok)
	assert.Equal(t, "data:image/png;base64,YWJj", fileWithURI.URI)
	require.NotNil(t, fileWithURI.MimeType)
	assert.Equal(t, "image/png", *fileWithURI.MimeType)
}

func TestExecutionEngineClientExecuteA2APreservesContentParts(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/execute-a2a", r.URL.Path)
		response := ExecutionEngineResponse{
			Messages: []ExecutionEngineMessage{
				{
					Role:    RoleUser,
					Content: "compat-fallback-content",
					ContentParts: []openai.ChatCompletionContentPartUnionParam{
						openai.TextContentPart("describe this"),
						openai.ImageContentPart(openai.ChatCompletionContentPartImageImageURLParam{
							URL: "data:image/png;base64,YWJj",
						}),
					},
				},
			},
		}
		require.NoError(t, json.NewEncoder(w).Encode(response))
	}))
	defer server.Close()

	scheme := runtime.NewScheme()
	require.NoError(t, arkv1prealpha1.AddToScheme(scheme))

	engine := &arkv1prealpha1.ExecutionEngine{}
	engine.Name = testEngineName
	engine.Namespace = testEngineNS
	engine.Spec.Type = testEngineTypeA2A
	engine.Status.LastResolvedAddress = server.URL
	k8sClient := fake.NewClientBuilder().WithScheme(scheme).WithObjects(engine).Build()

	engineClient := NewExecutionEngineClient(k8sClient, testExecutionEngineRecorder{})
	engineRef := &arkv1alpha1.ExecutionEngineRef{Name: testEngineName}
	agentConfig := AgentConfig{Name: "test-agent", Namespace: testEngineNS}
	userInput := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{protocol.NewTextPart("hello")})

	messages, err := engineClient.ExecuteA2A(context.Background(), engineRef, agentConfig, userInput, nil, nil)
	require.NoError(t, err)
	require.Len(t, messages, 1)
	require.Len(t, messages[0].Parts, 2)
	textPart, ok := messages[0].Parts[0].(protocol.TextPart)
	require.True(t, ok)
	assert.Equal(t, "describe this", textPart.Text)
}
