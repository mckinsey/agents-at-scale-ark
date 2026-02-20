package genai

import (
	"context"
	"testing"

	"github.com/openai/openai-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/runtime"
	eventingnoop "mckinsey.com/ark/internal/eventing/noop"
	telemetrynoop "mckinsey.com/ark/internal/telemetry/noop"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

func makeAssistantWithToolCalls(ids ...string) Message {
	message := openai.AssistantMessage("assistant")
	toolCalls := make([]openai.ChatCompletionMessageToolCallParam, 0, len(ids))
	for _, id := range ids {
		toolCalls = append(toolCalls, openai.ChatCompletionMessageToolCallParam{
			ID: id,
			Function: openai.ChatCompletionMessageToolCallFunctionParam{
				Name:      "filesystem-list-directory",
				Arguments: `{"path":"issues"}`,
			},
		})
	}
	message.OfAssistant.ToolCalls = toolCalls
	return message
}

func TestEnsureAssistantToolCallsArePairedInjectsCachedOutcomes(t *testing.T) {
	adapter := &openAIA2AModelAdapter{
		toolOutcomeByID: map[string]string{
			"call-1": `{"entries":["a"]}`,
			"call-2": `{"entries":["b"]}`,
		},
	}
	messages := []Message{
		openai.SystemMessage("system"),
		openai.UserMessage("user"),
		makeAssistantWithToolCalls("call-1"),
		makeAssistantWithToolCalls("call-2"),
	}

	normalized := adapter.ensureAssistantToolCallsArePaired(messages)
	require.Len(t, normalized, 6)
	require.NotNil(t, normalized[2].OfAssistant)
	require.NotNil(t, normalized[3].OfTool)
	assert.Equal(t, "call-1", normalized[3].OfTool.ToolCallID)
	require.NotNil(t, normalized[4].OfAssistant)
	require.NotNil(t, normalized[5].OfTool)
	assert.Equal(t, "call-2", normalized[5].OfTool.ToolCallID)
}

func TestEnsureAssistantToolCallsArePairedUsesExplicitThenCached(t *testing.T) {
	adapter := &openAIA2AModelAdapter{
		toolOutcomeByID: map[string]string{
			"call-1": `{"entries":["fallback"]}`,
		},
	}
	messages := []Message{
		makeAssistantWithToolCalls("call-1", "call-2"),
		openai.ToolMessage(`{"entries":["explicit"]}`, "call-2"),
	}

	normalized := adapter.ensureAssistantToolCallsArePaired(messages)
	require.Len(t, normalized, 3)
	require.NotNil(t, normalized[1].OfTool)
	assert.Equal(t, "call-1", normalized[1].OfTool.ToolCallID)
	assert.Equal(t, `{"entries":["fallback"]}`, normalized[1].OfTool.Content.OfString.Value)
	require.NotNil(t, normalized[2].OfTool)
	assert.Equal(t, "call-2", normalized[2].OfTool.ToolCallID)
	assert.Equal(t, `{"entries":["explicit"]}`, normalized[2].OfTool.Content.OfString.Value)
}

func TestEnsureAssistantToolCallsArePairedPreservesUnmatchedExplicitToolMessages(t *testing.T) {
	adapter := &openAIA2AModelAdapter{
		toolOutcomeByID: map[string]string{
			"call-1": `{"entries":["fallback"]}`,
		},
	}
	messages := []Message{
		makeAssistantWithToolCalls("call-1"),
		openai.ToolMessage(`{"entries":["unmatched"]}`, "call-999"),
	}

	normalized := adapter.ensureAssistantToolCallsArePaired(messages)
	require.Len(t, normalized, 3)
	require.NotNil(t, normalized[1].OfTool)
	assert.Equal(t, "call-1", normalized[1].OfTool.ToolCallID)
	assert.Equal(t, `{"entries":["fallback"]}`, normalized[1].OfTool.Content.OfString.Value)
	require.NotNil(t, normalized[2].OfTool)
	assert.Equal(t, "call-999", normalized[2].OfTool.ToolCallID)
	assert.Equal(t, `{"entries":["unmatched"]}`, normalized[2].OfTool.Content.OfString.Value)
}

func TestA2AToolOutcomesToOpenAIUsesFallbackOrder(t *testing.T) {
	messages := a2aToolOutcomesToOpenAI([]A2AToolOutcome{
		{
			ToolCallID: "call-content",
			Content:    "content-first",
			Error:      "error-ignored",
			Metadata:   map[string]interface{}{"contextId": "ctx-a"},
		},
		{
			ToolCallID: "call-error",
			Error:      "error-second",
			Metadata:   map[string]interface{}{"contextId": "ctx-b"},
		},
		{
			ToolCallID: "call-metadata",
			Metadata:   map[string]interface{}{"contextId": "ctx-c"},
		},
	})

	require.Len(t, messages, 3)
	require.NotNil(t, messages[0].OfTool)
	assert.Equal(t, "call-content", messages[0].OfTool.ToolCallID)
	assert.Equal(t, "content-first", messages[0].OfTool.Content.OfString.Value)
	require.NotNil(t, messages[1].OfTool)
	assert.Equal(t, "call-error", messages[1].OfTool.ToolCallID)
	assert.Equal(t, "error-second", messages[1].OfTool.Content.OfString.Value)
	require.NotNil(t, messages[2].OfTool)
	assert.Equal(t, "call-metadata", messages[2].OfTool.ToolCallID)
	assert.Equal(t, `{"contextId":"ctx-c"}`, messages[2].OfTool.Content.OfString.Value)
}

func TestA2AToolOutcomesToOpenAISkipsOutcomesWithoutToolCallID(t *testing.T) {
	messages := a2aToolOutcomesToOpenAI([]A2AToolOutcome{
		{
			Content: "missing-id",
		},
		{
			ToolCallID: "call-1",
			Content:    "kept",
		},
	})
	require.Len(t, messages, 1)
	require.NotNil(t, messages[0].OfTool)
	assert.Equal(t, "call-1", messages[0].OfTool.ToolCallID)
	assert.Equal(t, "kept", messages[0].OfTool.Content.OfString.Value)
}

type adapterTestChatProvider struct {
	response         *openai.ChatCompletion
	chatCalls        int
	streamCalls      int
	streamFuncCalls  int
	streamFuncErrors int
	lastMessages     []openai.ChatCompletionMessageParamUnion
}

func (p *adapterTestChatProvider) ChatCompletion(_ context.Context, messages []openai.ChatCompletionMessageParamUnion, _ int64, _ ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	p.chatCalls++
	p.lastMessages = append([]openai.ChatCompletionMessageParamUnion{}, messages...)
	return p.response, nil
}

func (p *adapterTestChatProvider) ChatCompletionStream(_ context.Context, messages []openai.ChatCompletionMessageParamUnion, _ int64, streamFunc func(*openai.ChatCompletionChunk) error, _ ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	p.streamCalls++
	p.lastMessages = append([]openai.ChatCompletionMessageParamUnion{}, messages...)
	if streamFunc != nil {
		p.streamFuncCalls++
		if err := streamFunc(&openai.ChatCompletionChunk{}); err != nil {
			p.streamFuncErrors++
			return nil, err
		}
	}
	return p.response, nil
}

func (p *adapterTestChatProvider) SetOutputSchema(_ *runtime.RawExtension, _ string) {}

func TestA2ATurnStreamsOpenAIChunksInCompatMode(t *testing.T) {
	provider := &adapterTestChatProvider{
		response: &openai.ChatCompletion{
			Choices: []openai.ChatCompletionChoice{
				{
					Message: openai.ChatCompletionMessage{
						Role:    "assistant",
						Content: "done",
					},
				},
			},
		},
	}
	adapter := &openAIA2AModelAdapter{
		provider:          provider,
		modelName:         "test-model",
		modelType:         "openai",
		agentName:         "test-agent",
		telemetryRecorder: telemetrynoop.NewModelRecorder(),
		eventingRecorder:  eventingnoop.NewModelRecorder(),
	}
	stream := &fakeEventStream{}
	userMessage := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("hello"),
	})

	_, err := adapter.A2ATurn(WithA2AExperimentalEnabled(context.Background(), false), []protocol.Message{userMessage}, nil, nil, stream)
	require.NoError(t, err)
	assert.Equal(t, 0, provider.chatCalls)
	assert.Equal(t, 1, provider.streamCalls)
	require.Len(t, stream.chunks, 1)
}

func TestA2ATurnConvertsA2AImagePartToOpenAIImageURL(t *testing.T) {
	provider := &adapterTestChatProvider{
		response: &openai.ChatCompletion{
			Choices: []openai.ChatCompletionChoice{
				{
					Message: openai.ChatCompletionMessage{
						Role:    "assistant",
						Content: "done",
					},
				},
			},
		},
	}
	adapter := &openAIA2AModelAdapter{
		provider:          provider,
		modelName:         "test-model",
		modelType:         "openai",
		agentName:         "test-agent",
		telemetryRecorder: telemetrynoop.NewModelRecorder(),
		eventingRecorder:  eventingnoop.NewModelRecorder(),
	}
	userMessage := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("describe"),
		protocol.NewFilePartWithURI("diagram.png", "image/png", "https://example.com/diagram.png"),
	})

	_, err := adapter.A2ATurn(WithA2AExperimentalEnabled(context.Background(), false), []protocol.Message{userMessage}, nil, nil, nil)
	require.NoError(t, err)
	assert.Equal(t, 1, provider.chatCalls)
	require.Len(t, provider.lastMessages, 1)
	require.NotNil(t, provider.lastMessages[0].OfUser)
	require.Len(t, provider.lastMessages[0].OfUser.Content.OfArrayOfContentParts, 2)
	require.NotNil(t, provider.lastMessages[0].OfUser.Content.OfArrayOfContentParts[0].OfText)
	assert.Equal(t, "describe", provider.lastMessages[0].OfUser.Content.OfArrayOfContentParts[0].OfText.Text)
	require.NotNil(t, provider.lastMessages[0].OfUser.Content.OfArrayOfContentParts[1].OfImageURL)
	assert.Equal(t, "https://example.com/diagram.png", provider.lastMessages[0].OfUser.Content.OfArrayOfContentParts[1].OfImageURL.ImageURL.URL)
}

func TestA2ATurnExperimentalWithoutNativeProviderFailsFast(t *testing.T) {
	provider := &adapterTestChatProvider{
		response: &openai.ChatCompletion{
			Choices: []openai.ChatCompletionChoice{
				{
					Message: openai.ChatCompletionMessage{
						Role:    "assistant",
						Content: "should-not-run",
					},
				},
			},
		},
	}
	adapter := &openAIA2AModelAdapter{
		provider:          provider,
		modelName:         "test-model",
		modelType:         "openai",
		agentName:         "test-agent",
		telemetryRecorder: telemetrynoop.NewModelRecorder(),
		eventingRecorder:  eventingnoop.NewModelRecorder(),
	}
	userMessage := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("hello"),
	})

	result, err := adapter.A2ATurn(WithA2AExperimentalEnabled(context.Background(), true), []protocol.Message{userMessage}, nil, nil, nil)
	require.ErrorIs(t, err, ErrA2AExperimentalRequiresNativeProvider)
	assert.Nil(t, result)
	assert.Equal(t, 0, provider.chatCalls)
	assert.Equal(t, 0, provider.streamCalls)
}

type adapterTestNativeProvider struct {
	adapterTestChatProvider
	nativeCalls int
}

func (p *adapterTestNativeProvider) A2ATurnNative(_ context.Context, _ []protocol.Message, _ []A2AToolOutcome, _ []A2AToolDefinition, _ EventStreamInterface) (*A2ATurnResult, error) {
	p.nativeCalls++
	msg := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("native-response"),
	})
	return &A2ATurnResult{
		Message: msg,
		Content: "native-response",
	}, nil
}

func TestA2ATurnPrefersNativeProviderWhenAvailable(t *testing.T) {
	provider := &adapterTestNativeProvider{
		adapterTestChatProvider: adapterTestChatProvider{
			response: &openai.ChatCompletion{
				Choices: []openai.ChatCompletionChoice{
					{
						Message: openai.ChatCompletionMessage{
							Role:    "assistant",
							Content: "should-not-be-used",
						},
					},
				},
			},
		},
	}
	model := &Model{
		Model:             "test-model",
		Type:              "native",
		Provider:          provider,
		telemetryRecorder: telemetrynoop.NewModelRecorder(),
		eventingRecorder:  eventingnoop.NewModelRecorder(),
	}
	adapter := NewOpenAIA2AModelAdapter(model, "test-agent", "default")
	userMessage := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("hello"),
	})

	result, err := adapter.A2ATurn(context.Background(), []protocol.Message{userMessage}, nil, nil, nil)
	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, "native-response", extractTextFromParts(result.Message.Parts))
	assert.Equal(t, 1, provider.nativeCalls)
	assert.Equal(t, 0, provider.chatCalls)
}

