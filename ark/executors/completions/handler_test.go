package completions

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/openai/openai-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
	eventingnoop "mckinsey.com/ark/internal/eventing/noop"
	telemetrynoop "mckinsey.com/ark/internal/telemetry/noop"
)

func TestExtractArkMetadata(t *testing.T) {
	tests := []struct {
		name      string
		message   protocol.Message
		wantQuery queryRef
		wantErr   bool
	}{
		{
			name: "valid metadata with query ref",
			message: protocol.Message{
				Role:  protocol.MessageRoleUser,
				Parts: []protocol.Part{protocol.NewTextPart("hello")},
				Metadata: map[string]any{
					arka2a.ArkMetadataKey: map[string]any{
						"agent": map[string]any{"name": "test-agent", "namespace": "default"},
						"query": map[string]any{"name": "q-123", "namespace": "default"},
					},
				},
			},
			wantQuery: queryRef{Name: "q-123", Namespace: "default"},
		},
		{
			name: "missing metadata",
			message: protocol.Message{
				Role:  protocol.MessageRoleUser,
				Parts: []protocol.Part{protocol.NewTextPart("hello")},
			},
			wantErr: true,
		},
		{
			name: "missing ark key",
			message: protocol.Message{
				Role:     protocol.MessageRoleUser,
				Parts:    []protocol.Part{protocol.NewTextPart("hello")},
				Metadata: map[string]any{"other": "data"},
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			meta, err := extractArkMetadata(tt.message)
			if tt.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.wantQuery.Name, meta.Query.Name)
			assert.Equal(t, tt.wantQuery.Namespace, meta.Query.Namespace)
		})
	}
}

func TestExtractAssistantText(t *testing.T) {
	tests := []struct {
		name     string
		messages []Message
		want     string
	}{
		{
			name:     "single assistant message",
			messages: []Message{NewAssistantMessage("hello world")},
			want:     "hello world",
		},
		{
			name: "multiple messages returns last assistant",
			messages: []Message{
				NewAssistantMessage("first"),
				NewAssistantMessage("second"),
			},
			want: "second",
		},
		{
			name:     "empty messages",
			messages: []Message{},
			want:     "",
		},
		{
			name:     "no assistant messages",
			messages: []Message{NewUserMessage("user input")},
			want:     "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := extractAssistantText(tt.messages)
			assert.Equal(t, tt.want, result)
		})
	}
}

func TestExtractArkMetadataQueryValidation(t *testing.T) {
	message := protocol.Message{
		Role:  protocol.MessageRoleUser,
		Parts: []protocol.Part{protocol.NewTextPart("hello")},
		Metadata: map[string]any{
			arka2a.ArkMetadataKey: map[string]any{
				"agent": map[string]any{"name": "test-agent"},
				"query": map[string]any{"name": "", "namespace": ""},
			},
		},
	}

	meta, err := extractArkMetadata(message)
	require.NoError(t, err)
	assert.Empty(t, meta.Query.Name)
	assert.Empty(t, meta.Query.Namespace)
}

func TestExtractArkMetadataPreservesToolsAndHistory(t *testing.T) {
	message := protocol.Message{
		Role:  protocol.MessageRoleUser,
		Parts: []protocol.Part{protocol.NewTextPart("hello")},
		Metadata: map[string]any{
			arka2a.ArkMetadataKey: map[string]any{
				"agent": map[string]any{"name": "a", "namespace": "ns"},
				"tools": []any{
					map[string]any{"name": "tool1", "description": "desc"},
				},
				"history": []any{
					map[string]any{"role": "user", "content": "hi"},
				},
				"query": map[string]any{"name": "q", "namespace": "ns"},
			},
		},
	}

	meta, err := extractArkMetadata(message)
	require.NoError(t, err)
	assert.NotNil(t, meta.Tools)
	assert.NotNil(t, meta.History)
}

func TestSerializeResponseMessages(t *testing.T) {
	tests := []struct {
		name     string
		messages []Message
		wantJSON bool
		want     string
	}{
		{
			name:     "empty messages returns empty string",
			messages: []Message{},
			want:     "",
		},
		{
			name:     "nil messages returns empty string",
			messages: nil,
			want:     "",
		},
		{
			name:     "single assistant message serializes",
			messages: []Message{NewAssistantMessage("hello")},
			wantJSON: true,
		},
		{
			name: "multiple message types serialize",
			messages: []Message{
				NewUserMessage("input"),
				NewAssistantMessage("output"),
			},
			wantJSON: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := serializeResponseMessages(tt.messages)
			if tt.want != "" || !tt.wantJSON {
				assert.Equal(t, tt.want, result)
				return
			}
			assert.True(t, json.Valid([]byte(result)), "expected valid JSON, got: %s", result)
		})
	}
}

func TestExtractArkMetadataWithTarget(t *testing.T) {
	message := protocol.Message{
		Role:  protocol.MessageRoleUser,
		Parts: []protocol.Part{protocol.NewTextPart("hello")},
		Metadata: map[string]any{
			arka2a.ArkMetadataKey: map[string]any{
				"query":  map[string]any{"name": "q-1", "namespace": "ns"},
				"target": map[string]any{"type": "model", "name": "gpt-4"},
			},
		},
	}

	meta, err := extractArkMetadata(message)
	require.NoError(t, err)
	require.NotNil(t, meta.Target)
	assert.Equal(t, "model", meta.Target.Type)
	assert.Equal(t, "gpt-4", meta.Target.Name)
}

func newTestScheme() *runtime.Scheme {
	scheme := runtime.NewScheme()
	_ = arkv1alpha1.AddToScheme(scheme)
	return scheme
}

func newTestHandler(objs ...client.Object) *Handler {
	builder := fake.NewClientBuilder().WithScheme(newTestScheme())
	if len(objs) > 0 {
		builder = builder.WithObjects(objs...)
	}

	return &Handler{
		k8sClient: builder.Build(),
		telemetry: telemetrynoop.NewProvider(),
		eventing:  eventingnoop.NewProvider(),
	}
}

func TestResolveQueryAndTarget(t *testing.T) {
	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-query",
			Namespace: "default",
		},
		Spec: arkv1alpha1.QuerySpec{
			Target: &arkv1alpha1.QueryTarget{
				Type: "agent",
				Name: "my-agent",
			},
			Input: runtime.RawExtension{Raw: []byte(`"hello"`)},
		},
	}

	t.Run("resolves query with spec target", func(t *testing.T) {
		h := newTestHandler(query)
		msg := protocol.Message{
			Role:  protocol.MessageRoleUser,
			Parts: []protocol.Part{protocol.NewTextPart("hello")},
			Metadata: map[string]any{
				arka2a.ArkMetadataKey: map[string]any{
					"query": map[string]any{"name": "test-query", "namespace": "default"},
				},
			},
		}

		q, target, err := h.resolveQueryAndTarget(context.Background(), msg)
		require.NoError(t, err)
		assert.Equal(t, "test-query", q.Name)
		assert.Equal(t, "agent", target.Type)
		assert.Equal(t, "my-agent", target.Name)
	})

	t.Run("uses metadata target when spec target is nil", func(t *testing.T) {
		queryNoTarget := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "q-no-target",
				Namespace: "default",
			},
			Spec: arkv1alpha1.QuerySpec{
				Input: runtime.RawExtension{Raw: []byte(`"hello"`)},
			},
		}
		h := newTestHandler(queryNoTarget)
		msg := protocol.Message{
			Role:  protocol.MessageRoleUser,
			Parts: []protocol.Part{protocol.NewTextPart("hello")},
			Metadata: map[string]any{
				arka2a.ArkMetadataKey: map[string]any{
					"query":  map[string]any{"name": "q-no-target", "namespace": "default"},
					"target": map[string]any{"type": "model", "name": "gpt-4"},
				},
			},
		}

		q, target, err := h.resolveQueryAndTarget(context.Background(), msg)
		require.NoError(t, err)
		assert.Equal(t, "q-no-target", q.Name)
		assert.Equal(t, "model", target.Type)
		assert.Equal(t, "gpt-4", target.Name)
	})

	t.Run("errors when query not found", func(t *testing.T) {
		h := newTestHandler()
		msg := protocol.Message{
			Role:  protocol.MessageRoleUser,
			Parts: []protocol.Part{protocol.NewTextPart("hello")},
			Metadata: map[string]any{
				arka2a.ArkMetadataKey: map[string]any{
					"query": map[string]any{"name": "missing", "namespace": "default"},
				},
			},
		}

		_, _, err := h.resolveQueryAndTarget(context.Background(), msg)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to get query")
	})

	t.Run("errors when no target anywhere", func(t *testing.T) {
		queryNoTarget := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "q-empty",
				Namespace: "default",
			},
			Spec: arkv1alpha1.QuerySpec{
				Input: runtime.RawExtension{Raw: []byte(`"hello"`)},
			},
		}
		h := newTestHandler(queryNoTarget)
		msg := protocol.Message{
			Role:  protocol.MessageRoleUser,
			Parts: []protocol.Part{protocol.NewTextPart("hello")},
			Metadata: map[string]any{
				arka2a.ArkMetadataKey: map[string]any{
					"query": map[string]any{"name": "q-empty", "namespace": "default"},
				},
			},
		}

		_, _, err := h.resolveQueryAndTarget(context.Background(), msg)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "has no target")
	})

	t.Run("errors with empty query ref", func(t *testing.T) {
		h := newTestHandler()
		msg := protocol.Message{
			Role:  protocol.MessageRoleUser,
			Parts: []protocol.Part{protocol.NewTextPart("hello")},
			Metadata: map[string]any{
				arka2a.ArkMetadataKey: map[string]any{
					"query": map[string]any{"name": "", "namespace": ""},
				},
			},
		}

		_, _, err := h.resolveQueryAndTarget(context.Background(), msg)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "query reference is required")
	})

	t.Run("errors with no metadata", func(t *testing.T) {
		h := newTestHandler()
		msg := protocol.Message{
			Role:  protocol.MessageRoleUser,
			Parts: []protocol.Part{protocol.NewTextPart("hello")},
		}

		_, _, err := h.resolveQueryAndTarget(context.Background(), msg)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to extract ark metadata")
	})
}

func TestOpenAIToProtocolResponseMessages(t *testing.T) {
	t.Run("assistant text-only", func(t *testing.T) {
		msgs := []Message{NewAssistantMessage("hello")}
		result := openAIToProtocolResponseMessages(msgs)
		require.Len(t, result, 1)
		assert.Equal(t, protocol.MessageRoleAgent, result[0].Role)
		assert.Equal(t, "hello", arka2a.ExtractTextFromParts(result[0].Parts))
		assert.Empty(t, arka2a.ExtractDataParts(result[0].Parts))
	})

	t.Run("user message", func(t *testing.T) {
		msgs := []Message{NewUserMessage("question")}
		result := openAIToProtocolResponseMessages(msgs)
		require.Len(t, result, 1)
		assert.Equal(t, protocol.MessageRoleUser, result[0].Role)
		assert.Equal(t, "question", arka2a.ExtractTextFromParts(result[0].Parts))
	})

	t.Run("system message preserved as DataPart", func(t *testing.T) {
		msgs := []Message{NewSystemMessage("you are helpful")}
		result := openAIToProtocolResponseMessages(msgs)
		require.Len(t, result, 1)
		assert.Equal(t, protocol.MessageRoleAgent, result[0].Role)
		dps := arka2a.ExtractDataParts(result[0].Parts)
		require.Len(t, dps, 1)
		assert.Equal(t, "system", arka2a.DataPartType(dps[0]))
		assert.Equal(t, "you are helpful", arka2a.DataPartField(dps[0], "content"))
	})

	t.Run("tool result preserved as DataPart", func(t *testing.T) {
		msgs := []Message{ToolMessage("72°F sunny", "call-123")}
		result := openAIToProtocolResponseMessages(msgs)
		require.Len(t, result, 1)
		assert.Equal(t, protocol.MessageRoleAgent, result[0].Role)
		dps := arka2a.ExtractDataParts(result[0].Parts)
		require.Len(t, dps, 1)
		assert.Equal(t, "tool_result", arka2a.DataPartType(dps[0]))
		assert.Equal(t, "call-123", arka2a.DataPartField(dps[0], "tool_call_id"))
		assert.Equal(t, "72°F sunny", arka2a.DataPartField(dps[0], "content"))
	})

	t.Run("assistant with tool calls produces TextPart + DataParts", func(t *testing.T) {
		assistant := openai.ChatCompletionAssistantMessageParam{
			Content: openai.ChatCompletionAssistantMessageParamContentUnion{
				OfString: openai.Opt("I'll check the weather"),
			},
			ToolCalls: []openai.ChatCompletionMessageToolCallParam{
				{
					ID: "tc-1",
					Function: openai.ChatCompletionMessageToolCallFunctionParam{
						Name:      "weather_api",
						Arguments: `{"city":"NYC"}`,
					},
				},
			},
		}
		msgs := []Message{{OfAssistant: &assistant}}
		result := openAIToProtocolResponseMessages(msgs)
		require.Len(t, result, 1)

		text := arka2a.ExtractTextFromParts(result[0].Parts)
		assert.Equal(t, "I'll check the weather", text)

		dps := arka2a.ExtractDataParts(result[0].Parts)
		require.Len(t, dps, 1)
		assert.Equal(t, "tool_call", arka2a.DataPartType(dps[0]))
		assert.Equal(t, "tc-1", arka2a.DataPartField(dps[0], "id"))

		fn := arka2a.DataPartMap(dps[0], "function")
		require.NotNil(t, fn)
		assert.Equal(t, "weather_api", fn["name"])
		assert.Equal(t, `{"city":"NYC"}`, fn["arguments"])
	})

	t.Run("function result preserved as DataPart", func(t *testing.T) {
		fn := openai.ChatCompletionFunctionMessageParam{ //nolint:staticcheck // testing deprecated type handling
			Name:    "my_func",
			Content: openai.Opt("result data"),
		}
		msgs := []Message{{OfFunction: &fn}}
		result := openAIToProtocolResponseMessages(msgs)
		require.Len(t, result, 1)
		dps := arka2a.ExtractDataParts(result[0].Parts)
		require.Len(t, dps, 1)
		assert.Equal(t, "function_result", arka2a.DataPartType(dps[0]))
		assert.Equal(t, "my_func", arka2a.DataPartField(dps[0], "name"))
		assert.Equal(t, "result data", arka2a.DataPartField(dps[0], "content"))
	})

	t.Run("mixed message sequence preserves all types", func(t *testing.T) {
		assistant := openai.ChatCompletionAssistantMessageParam{
			Content: openai.ChatCompletionAssistantMessageParamContentUnion{
				OfString: openai.Opt("Let me look that up"),
			},
			ToolCalls: []openai.ChatCompletionMessageToolCallParam{
				{
					ID: "tc-abc",
					Function: openai.ChatCompletionMessageToolCallFunctionParam{
						Name:      "search",
						Arguments: `{"q":"test"}`,
					},
				},
			},
		}
		msgs := []Message{
			NewSystemMessage("system prompt"),
			NewUserMessage("question"),
			{OfAssistant: &assistant},
			ToolMessage("search result", "tc-abc"),
			NewAssistantMessage("Here is the answer"),
		}
		result := openAIToProtocolResponseMessages(msgs)
		require.Len(t, result, 5)

		assert.Equal(t, "system", arka2a.DataPartType(arka2a.ExtractDataParts(result[0].Parts)[0]))
		assert.Equal(t, protocol.MessageRoleUser, result[1].Role)
		assert.Equal(t, "tool_call", arka2a.DataPartType(arka2a.ExtractDataParts(result[2].Parts)[0]))
		assert.Equal(t, "tool_result", arka2a.DataPartType(arka2a.ExtractDataParts(result[3].Parts)[0]))
		assert.Equal(t, "Here is the answer", arka2a.ExtractTextFromParts(result[4].Parts))
	})
}

func TestDispatchTargetUnsupportedType(t *testing.T) {
	h := newTestHandler()
	tracer := telemetrynoop.NewTracer()
	_, span := tracer.Start(context.Background(), "test")
	state := &executionState{
		target:     &arkv1alpha1.QueryTarget{Type: "unknown", Name: "x"},
		querySpan:  span,
		targetSpan: span,
	}

	_, err := h.dispatchTarget(context.Background(), state)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unsupported target type")
}
