package completions

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/go-logr/logr/funcr"
	"github.com/openai/openai-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
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
					arka2a.QueryExtensionMetadataKey: map[string]any{
						"name": "q-123", "namespace": "default",
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
			name: "missing extension key",
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
			arka2a.QueryExtensionMetadataKey: map[string]any{
				"name": "", "namespace": "",
			},
		},
	}

	meta, err := extractArkMetadata(message)
	require.NoError(t, err)
	assert.Empty(t, meta.Query.Name)
	assert.Empty(t, meta.Query.Namespace)
}

func TestSerializeResponseMessages(t *testing.T) {
	tests := []struct {
		name     string
		messages []Message
		wantJSON bool
		want     string
	}{
		{
			name:     "empty messages returns empty array",
			messages: []Message{},
			want:     "[]",
		},
		{
			name:     "nil messages returns empty array",
			messages: nil,
			want:     "[]",
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
				arka2a.QueryExtensionMetadataKey: map[string]any{
					"name": "test-query", "namespace": "default",
				},
			},
		}

		q, target, err := h.resolveQueryAndTarget(context.Background(), msg)
		require.NoError(t, err)
		assert.Equal(t, "test-query", q.Name)
		assert.Equal(t, "agent", target.Type)
		assert.Equal(t, "my-agent", target.Name)
	})

	t.Run("errors when query not found", func(t *testing.T) {
		h := newTestHandler()
		msg := protocol.Message{
			Role:  protocol.MessageRoleUser,
			Parts: []protocol.Part{protocol.NewTextPart("hello")},
			Metadata: map[string]any{
				arka2a.QueryExtensionMetadataKey: map[string]any{
					"name": "missing", "namespace": "default",
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
				arka2a.QueryExtensionMetadataKey: map[string]any{
					"name": "q-empty", "namespace": "default",
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
				arka2a.QueryExtensionMetadataKey: map[string]any{
					"name": "", "namespace": "",
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

func TestResolveQueryAndTargetWithSelector(t *testing.T) {
	agent := &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "labeled-agent",
			Namespace: "default",
			Labels:    map[string]string{"env": "prod"},
		},
	}
	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "selector-query",
			Namespace: "default",
		},
		Spec: arkv1alpha1.QuerySpec{
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{"env": "prod"},
			},
			Input: runtime.RawExtension{Raw: []byte(`"hello"`)},
		},
	}

	t.Run("resolves target via label selector", func(t *testing.T) {
		h := newTestHandler(query, agent)
		msg := protocol.Message{
			Role:  protocol.MessageRoleUser,
			Parts: []protocol.Part{protocol.NewTextPart("hello")},
			Metadata: map[string]any{
				arka2a.QueryExtensionMetadataKey: map[string]any{
					"name": "selector-query", "namespace": "default",
				},
			},
		}

		q, target, err := h.resolveQueryAndTarget(context.Background(), msg)
		require.NoError(t, err)
		assert.Equal(t, "selector-query", q.Name)
		assert.Equal(t, "agent", target.Type)
		assert.Equal(t, "labeled-agent", target.Name)
	})

	t.Run("no matching resources returns error", func(t *testing.T) {
		queryNoMatch := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "no-match-query",
				Namespace: "default",
			},
			Spec: arkv1alpha1.QuerySpec{
				Selector: &metav1.LabelSelector{
					MatchLabels: map[string]string{"env": "staging"},
				},
				Input: runtime.RawExtension{Raw: []byte(`"hello"`)},
			},
		}
		h := newTestHandler(queryNoMatch)
		msg := protocol.Message{
			Role:  protocol.MessageRoleUser,
			Parts: []protocol.Part{protocol.NewTextPart("hello")},
			Metadata: map[string]any{
				arka2a.QueryExtensionMetadataKey: map[string]any{
					"name": "no-match-query", "namespace": "default",
				},
			},
		}

		_, _, err := h.resolveQueryAndTarget(context.Background(), msg)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "no matching resources")
	})
}

func TestResolveSelector(t *testing.T) {
	t.Run("resolves agent by label", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "agent-1",
				Namespace: "default",
				Labels:    map[string]string{"role": "worker"},
			},
		}
		h := newTestHandler(agent)
		query := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "default"},
			Spec: arkv1alpha1.QuerySpec{
				Selector: &metav1.LabelSelector{
					MatchLabels: map[string]string{"role": "worker"},
				},
			},
		}

		target, err := h.resolveSelector(context.Background(), query)
		require.NoError(t, err)
		assert.Equal(t, "agent", target.Type)
		assert.Equal(t, "agent-1", target.Name)
	})

	t.Run("returns error when no resources match", func(t *testing.T) {
		h := newTestHandler()
		query := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "default"},
			Spec: arkv1alpha1.QuerySpec{
				Selector: &metav1.LabelSelector{
					MatchLabels: map[string]string{"role": "nonexistent"},
				},
			},
		}

		_, err := h.resolveSelector(context.Background(), query)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "no matching resources")
	})
}

func TestBuildResponseMeta(t *testing.T) {
	t.Run("empty state returns meta with empty messages array", func(t *testing.T) {
		state := &executionState{}
		meta := buildResponseMeta(state, nil, nil, arkv1alpha1.TokenUsage{})
		assert.Len(t, meta, 1)
		assert.Equal(t, json.RawMessage("[]"), meta["messages"])
	})

	t.Run("includes token usage when present", func(t *testing.T) {
		state := &executionState{}
		tokens := arkv1alpha1.TokenUsage{PromptTokens: 10, CompletionTokens: 20, TotalTokens: 30}
		meta := buildResponseMeta(state, nil, nil, tokens)
		usage, ok := meta["tokenUsage"].(map[string]any)
		require.True(t, ok)
		assert.Equal(t, int64(30), usage["total_tokens"])
	})

	t.Run("includes conversation ID", func(t *testing.T) {
		state := &executionState{conversationId: "conv-1"}
		meta := buildResponseMeta(state, nil, nil, arkv1alpha1.TokenUsage{})
		assert.Equal(t, "conv-1", meta["conversationId"])
	})

	t.Run("includes A2A metadata from exec result", func(t *testing.T) {
		state := &executionState{}
		execResult := &ExecutionResult{
			A2AResponse: &arka2a.A2AResponse{ContextID: "ctx-1", TaskID: "task-1"},
		}
		meta := buildResponseMeta(state, execResult, nil, arkv1alpha1.TokenUsage{})
		a2aMeta, ok := meta["a2a"].(map[string]string)
		require.True(t, ok)
		assert.Equal(t, "ctx-1", a2aMeta["contextId"])
		assert.Equal(t, "task-1", a2aMeta["taskId"])
	})

	t.Run("skips A2A metadata when nil exec result", func(t *testing.T) {
		state := &executionState{}
		meta := buildResponseMeta(state, nil, nil, arkv1alpha1.TokenUsage{})
		_, hasA2A := meta["a2a"]
		assert.False(t, hasA2A)
	})

	t.Run("includes serialized messages", func(t *testing.T) {
		state := &executionState{}
		msgs := []Message{NewAssistantMessage("hello")}
		meta := buildResponseMeta(state, nil, msgs, arkv1alpha1.TokenUsage{})
		_, hasMessages := meta["messages"]
		assert.True(t, hasMessages)
	})
}

func TestResolveSelectorResourceTypes(t *testing.T) {
	t.Run("resolves team by label", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "my-team",
				Namespace: "default",
				Labels:    map[string]string{"env": "prod"},
			},
		}
		h := newTestHandler(team)
		query := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "default"},
			Spec: arkv1alpha1.QuerySpec{
				Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"env": "prod"}},
			},
		}
		target, err := h.resolveSelector(context.Background(), query)
		require.NoError(t, err)
		assert.Equal(t, "team", target.Type)
		assert.Equal(t, "my-team", target.Name)
	})

	t.Run("resolves model by label", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "my-model",
				Namespace: "default",
				Labels:    map[string]string{"tier": "gpu"},
			},
		}
		h := newTestHandler(model)
		query := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "default"},
			Spec: arkv1alpha1.QuerySpec{
				Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"tier": "gpu"}},
			},
		}
		target, err := h.resolveSelector(context.Background(), query)
		require.NoError(t, err)
		assert.Equal(t, "model", target.Type)
		assert.Equal(t, "my-model", target.Name)
	})

	t.Run("resolves tool by label", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "my-tool",
				Namespace: "default",
				Labels:    map[string]string{"kind": "search"},
			},
		}
		h := newTestHandler(tool)
		query := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "default"},
			Spec: arkv1alpha1.QuerySpec{
				Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"kind": "search"}},
			},
		}
		target, err := h.resolveSelector(context.Background(), query)
		require.NoError(t, err)
		assert.Equal(t, "tool", target.Type)
		assert.Equal(t, "my-tool", target.Name)
	})

	t.Run("agents take priority over teams", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "my-agent",
				Namespace: "default",
				Labels:    map[string]string{"shared": "true"},
			},
		}
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "my-team",
				Namespace: "default",
				Labels:    map[string]string{"shared": "true"},
			},
		}
		h := newTestHandler(agent, team)
		query := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "default"},
			Spec: arkv1alpha1.QuerySpec{
				Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"shared": "true"}},
			},
		}
		target, err := h.resolveSelector(context.Background(), query)
		require.NoError(t, err)
		assert.Equal(t, "agent", target.Type)
	})
}

func TestContextIdExtraction(t *testing.T) {
	t.Run("message with contextId extracts value", func(t *testing.T) {
		contextId := "conv-from-a2a"
		message := protocol.NewMessageWithContext(protocol.MessageRoleUser, []protocol.Part{
			protocol.NewTextPart("hello"),
		}, nil, &contextId)

		require.NotNil(t, message.ContextID)
		assert.Equal(t, "conv-from-a2a", *message.ContextID)
	})

	t.Run("message without contextId has nil", func(t *testing.T) {
		message := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
			protocol.NewTextPart("hello"),
		})

		assert.Nil(t, message.ContextID)
	})

	t.Run("a2a contextId takes precedence over query spec", func(t *testing.T) {
		a2aContextId := "from-a2a"
		queryConversationId := "from-spec"

		conversationId := a2aContextId
		if conversationId == "" {
			conversationId = queryConversationId
		}
		assert.Equal(t, "from-a2a", conversationId)
	})

	t.Run("falls back to query spec when a2a contextId empty", func(t *testing.T) {
		a2aContextId := ""
		queryConversationId := "from-spec"

		conversationId := a2aContextId
		if conversationId == "" {
			conversationId = queryConversationId
		}
		assert.Equal(t, "from-spec", conversationId)
	})

	t.Run("both empty results in empty conversationId", func(t *testing.T) {
		a2aContextId := ""
		queryConversationId := ""

		conversationId := a2aContextId
		if conversationId == "" {
			conversationId = queryConversationId
		}
		assert.Empty(t, conversationId)
	})
}

func TestFinalizeStream(t *testing.T) {
	target := &arkv1alpha1.QueryTarget{Type: "agent", Name: "my-agent"}

	t.Run("no-op when eventStream is nil", func(t *testing.T) {
		state := &executionState{
			query:  arkv1alpha1.Query{ObjectMeta: metav1.ObjectMeta{Name: "q1"}},
			target: target,
		}
		state.finalizeStream(context.Background(), nil, arkv1alpha1.TokenUsage{})
	})

	t.Run("streams final chunk with no response when messages empty", func(t *testing.T) {
		stream := &mockEventStream{}
		state := &executionState{
			query:       arkv1alpha1.Query{ObjectMeta: metav1.ObjectMeta{Name: "q1"}},
			target:      target,
			eventStream: stream,
		}
		state.finalizeStream(context.Background(), []Message{}, arkv1alpha1.TokenUsage{})

		require.Len(t, stream.chunks, 1)
		chunk, ok := stream.chunks[0].(ChunkWithMetadata)
		require.True(t, ok)
		assert.Equal(t, "chatcmpl-final", chunk.ID)
		require.NotNil(t, chunk.Ark)
		require.NotNil(t, chunk.Ark.CompletedQuery)
		assert.Equal(t, "done", chunk.Ark.CompletedQuery.Status.Phase)
		assert.Nil(t, chunk.Ark.CompletedQuery.Status.Response)
	})

	t.Run("streams final chunk with response when messages present", func(t *testing.T) {
		stream := &mockEventStream{}
		state := &executionState{
			query:          arkv1alpha1.Query{ObjectMeta: metav1.ObjectMeta{Name: "q1"}},
			target:         target,
			conversationId: "conv-123",
			eventStream:    stream,
		}
		state.finalizeStream(context.Background(), []Message{NewAssistantMessage("hello")}, arkv1alpha1.TokenUsage{})

		require.Len(t, stream.chunks, 1)
		chunk, ok := stream.chunks[0].(ChunkWithMetadata)
		require.True(t, ok)
		assert.Equal(t, "chatcmpl-final", chunk.ID)
		require.NotNil(t, chunk.Ark.CompletedQuery.Status.Response)
		assert.Equal(t, "done", chunk.Ark.CompletedQuery.Status.Phase)
		assert.Equal(t, "conv-123", chunk.Ark.CompletedQuery.Status.ConversationId)
		assert.Equal(t, "hello", chunk.Ark.CompletedQuery.Status.Response.Content)
		assert.Equal(t, "agent", chunk.Ark.CompletedQuery.Status.Response.Target.Type)
		assert.Equal(t, "my-agent", chunk.Ark.CompletedQuery.Status.Response.Target.Name)
		assert.Equal(t, "done", chunk.Ark.CompletedQuery.Status.Response.Phase)
		assert.NotEmpty(t, chunk.Ark.CompletedQuery.Status.Response.Raw)
	})

	t.Run("logs errors from stream operations", func(t *testing.T) {
		var loggedMessages []string
		logger := funcr.New(func(prefix, args string) {
			loggedMessages = append(loggedMessages, prefix+" "+args)
		}, funcr.Options{})
		logf.SetLogger(logger)

		stream := &errorEventStream{}
		state := &executionState{
			query:       arkv1alpha1.Query{ObjectMeta: metav1.ObjectMeta{Name: "q1"}},
			target:      target,
			eventStream: stream,
		}
		state.finalizeStream(context.Background(), nil, arkv1alpha1.TokenUsage{})

		logged := strings.Join(loggedMessages, "\n")
		assert.Contains(t, logged, "failed to send final chunk")
		assert.Contains(t, logged, "failed to notify stream completion")
		assert.Contains(t, logged, "failed to close event stream")
	})
}

type errorEventStream struct{}

func (e *errorEventStream) StreamChunk(_ context.Context, _ interface{}) error {
	return fmt.Errorf("stream error")
}

func (e *errorEventStream) NotifyCompletion(_ context.Context) error {
	return fmt.Errorf("notify error")
}
func (e *errorEventStream) Close() error { return fmt.Errorf("close error") }

func TestDispatchTargetUnsupportedType(t *testing.T) {
	h := newTestHandler()
	tracer := telemetrynoop.NewTracer()
	_, span := tracer.Start(context.Background(), "test")
	state := &executionState{
		target:     &arkv1alpha1.QueryTarget{Type: "unknown", Name: "x"},
		querySpan:  span,
		targetSpan: span,
	}

	_, _, err := h.dispatchTarget(context.Background(), state)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unsupported target type")
}

func TestCheckResumption(t *testing.T) {
	tests := []struct {
		name             string
		a2aTask          *arkv1alpha1.A2ATask
		expectResumption bool
		expectPhase      string
	}{
		{
			name: "resumption with approved task",
			a2aTask: &arkv1alpha1.A2ATask{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "a2a-task-test-123",
					Namespace: "default",
				},
				Status: arkv1alpha1.A2ATaskStatus{
					Phase: arka2a.PhaseCompleted,
					ProtocolMetadata: map[string]string{
						"toolCalls": `[{"id":"call-1","type":"function","function":{"name":"test-tool","arguments":"{}"}}]`,
					},
				},
			},
			expectResumption: true,
			expectPhase:      arka2a.PhaseCompleted,
		},
		{
			name: "resumption with rejected task",
			a2aTask: &arkv1alpha1.A2ATask{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "a2a-task-test-123",
					Namespace: "default",
				},
				Status: arkv1alpha1.A2ATaskStatus{
					Phase: arka2a.PhaseFailed,
					Error: "Tool execution rejected by user",
					Conditions: []metav1.Condition{
						{
							Type:   string(arkv1alpha1.A2ATaskCompleted),
							Status: metav1.ConditionTrue,
							Reason: arka2a.ConditionReasonApprovalRejected,
						},
					},
				},
			},
			expectResumption: true,
			expectPhase:      arka2a.PhaseFailed,
		},
		{
			name:             "no resumption - no task",
			a2aTask:          nil,
			expectResumption: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			scheme := runtime.NewScheme()
			_ = arkv1alpha1.AddToScheme(scheme)

			var objects []client.Object
			if tt.a2aTask != nil {
				objects = append(objects, tt.a2aTask)
			}

			k8sClient := fake.NewClientBuilder().
				WithScheme(scheme).
				WithObjects(objects...).
				WithStatusSubresource(&arkv1alpha1.A2ATask{}).
				Build()

			h := &Handler{
				k8sClient: k8sClient,
			}

			query := &arkv1alpha1.Query{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-query",
					Namespace: "default",
				},
				Status: arkv1alpha1.QueryStatus{
					Response: &arkv1alpha1.Response{
						A2A: &arkv1alpha1.A2AMetadata{
							TaskID: "test-123",
						},
					},
				},
			}

			ctx := logf.IntoContext(context.Background(), funcr.New(func(pfx, args string) {}, funcr.Options{}))
			isResumption, task := h.checkResumption(ctx, query)

			assert.Equal(t, tt.expectResumption, isResumption)
			if tt.expectResumption {
				require.NotNil(t, task)
				assert.Equal(t, tt.expectPhase, task.Status.Phase)
			}
		})
	}
}

func TestParseApprovalDecision(t *testing.T) {
	tests := []struct {
		name           string
		input          string
		expectApproved bool
		expectError    bool
	}{
		{
			name:           "approved decision",
			input:          `{"decision": "approved"}`,
			expectApproved: true,
		},
		{
			name:           "rejected decision",
			input:          `{"decision": "rejected"}`,
			expectApproved: false,
		},
		{
			name:        "invalid json",
			input:       `not json`,
			expectError: true,
		},
		{
			name:        "missing decision field",
			input:       `{"other": "field"}`,
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var decision struct {
				Decision string `json:"decision"`
			}
			err := json.Unmarshal([]byte(tt.input), &decision)

			if tt.expectError {
				if err == nil && decision.Decision == "" {
					// Missing decision field
					return
				}
				if err != nil {
					return
				}
				t.Error("Expected error but got none")
				return
			}

			require.NoError(t, err)
			isApproved := decision.Decision == "approved"
			assert.Equal(t, tt.expectApproved, isApproved)
		})
	}
}

func TestToolApprovalConfigParsing(t *testing.T) {
	tests := []struct {
		name            string
		config          *arkv1alpha1.ToolApprovalConfig
		expectTimeout   time.Duration
		expectOnTimeout string
	}{
		{
			name: "standard config",
			config: &arkv1alpha1.ToolApprovalConfig{
				Timeout:   &metav1.Duration{Duration: 5 * time.Minute},
				OnTimeout: "reject",
			},
			expectTimeout:   5 * time.Minute,
			expectOnTimeout: "reject",
		},
		{
			name: "approve on timeout",
			config: &arkv1alpha1.ToolApprovalConfig{
				Timeout:   &metav1.Duration{Duration: 10 * time.Minute},
				OnTimeout: "approve",
			},
			expectTimeout:   10 * time.Minute,
			expectOnTimeout: "approve",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expectTimeout, tt.config.Timeout.Duration)
			assert.Equal(t, tt.expectOnTimeout, tt.config.OnTimeout)
		})
	}
}

func TestHandleApprovalRequired(t *testing.T) {
	h := newTestHandler()
	tracer := telemetrynoop.NewTracer()
	ctx, span := tracer.Start(context.Background(), "test")

	state := &executionState{
		query: arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "default"},
		},
		conversationId: "conv-abc",
		querySpan:      span,
		targetSpan:     span,
	}

	toolCalls := []ToolCall{
		{
			ID: "call-1",
			Function: openai.ChatCompletionMessageToolCallFunction{
				Name:      "deploy-application",
				Arguments: `{"env":"prod"}`,
			},
		},
	}

	approvalErr := &ApprovalRequiredError{
		ToolCalls: toolCalls,
		Config: &arkv1alpha1.ToolApprovalConfig{
			Required:  true,
			Timeout:   &metav1.Duration{Duration: 5 * time.Minute},
			OnTimeout: "reject",
		},
		Context: &ExecutionContext{
			ConversationID:       "conv-abc",
			PendingToolCallIndex: 0,
			AgentName:            "deploy-agent",
			AgentNamespace:       "default",
		},
	}

	result := h.handleApprovalRequired(ctx, state, approvalErr)

	require.NotNil(t, result)
	task, ok := result.Result.(*protocol.Task)
	require.True(t, ok, "expected Result to be *protocol.Task")
	assert.NotEmpty(t, task.ID, "task should have a generated ID")
	assert.Equal(t, "conv-abc", task.ContextID)
	assert.Equal(t, protocol.TaskStateInputRequired, task.Status.State)

	require.NotNil(t, task.Metadata)
	assert.Equal(t, "5m0s", task.Metadata["timeout"])
	assert.Equal(t, "reject", task.Metadata["onTimeout"])

	toolCallsJSON, ok := task.Metadata["toolCalls"].(string)
	require.True(t, ok, "toolCalls metadata should be a JSON string")
	var roundtrip []ToolCall
	require.NoError(t, json.Unmarshal([]byte(toolCallsJSON), &roundtrip))
	require.Len(t, roundtrip, 1)
	assert.Equal(t, "call-1", roundtrip[0].ID)
	assert.Equal(t, "deploy-application", roundtrip[0].Function.Name)

	contextJSON, ok := task.Metadata["context"].(string)
	require.True(t, ok, "context metadata should be a JSON string")
	var roundtripCtx ExecutionContext
	require.NoError(t, json.Unmarshal([]byte(contextJSON), &roundtripCtx))
	assert.Equal(t, "deploy-agent", roundtripCtx.AgentName)
	assert.Equal(t, "default", roundtripCtx.AgentNamespace)
}

func TestHandleApprovalRequiredEmitsStreamEvent(t *testing.T) {
	h := newTestHandler()
	tracer := telemetrynoop.NewTracer()
	ctx, span := tracer.Start(context.Background(), "test")

	stream := &mockEventStream{}
	state := &executionState{
		query:          arkv1alpha1.Query{ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "default"}},
		conversationId: "conv-stream",
		querySpan:      span,
		targetSpan:     span,
		eventStream:    stream,
	}

	approvalErr := &ApprovalRequiredError{
		ToolCalls: []ToolCall{
			{
				ID:       "call-1",
				Function: openai.ChatCompletionMessageToolCallFunction{Name: "deploy-application", Arguments: "{}"},
			},
		},
		Config: &arkv1alpha1.ToolApprovalConfig{
			Required:  true,
			Timeout:   &metav1.Duration{Duration: 30 * time.Second},
			OnTimeout: "proceed",
		},
		Context: &ExecutionContext{ConversationID: "conv-stream", AgentName: "deploy-agent", AgentNamespace: "default"},
	}

	result := h.handleApprovalRequired(ctx, state, approvalErr)

	task, ok := result.Result.(*protocol.Task)
	require.True(t, ok)
	assert.Equal(t, protocol.TaskStateInputRequired, task.Status.State)
	assert.Equal(t, "conv-stream", task.ContextID)
	require.NotEmpty(t, stream.chunks, "approval request event should be streamed")
}

func TestResolveResumptionAgent(t *testing.T) {
	makeTask := func(ctx *ExecutionContext) *arkv1alpha1.A2ATask {
		meta := map[string]string{}
		if ctx != nil {
			raw, _ := json.Marshal(ctx)
			meta["context"] = string(raw)
		}
		return &arkv1alpha1.A2ATask{Status: arkv1alpha1.A2ATaskStatus{ProtocolMetadata: meta}}
	}
	state := func(targetName string) *executionState {
		return &executionState{
			target: &arkv1alpha1.QueryTarget{Type: "agent", Name: targetName},
			query:  arkv1alpha1.Query{ObjectMeta: metav1.ObjectMeta{Namespace: "default"}},
		}
	}

	t.Run("falls back to target when no context", func(t *testing.T) {
		name, ns := resolveResumptionAgent(state("my-agent"), makeTask(nil))
		assert.Equal(t, "my-agent", name)
		assert.Equal(t, "default", ns)
	})

	t.Run("uses context agent for team target", func(t *testing.T) {
		task := makeTask(&ExecutionContext{AgentName: "member-agent", AgentNamespace: "team-ns"})
		name, ns := resolveResumptionAgent(state("test-team"), task)
		assert.Equal(t, "member-agent", name, "team member from context, not the team name")
		assert.Equal(t, "team-ns", ns)
	})

	t.Run("keeps query namespace when context omits namespace", func(t *testing.T) {
		task := makeTask(&ExecutionContext{AgentName: "member-agent"})
		name, ns := resolveResumptionAgent(state("test-team"), task)
		assert.Equal(t, "member-agent", name)
		assert.Equal(t, "default", ns)
	})

	t.Run("falls back to target on unparseable context", func(t *testing.T) {
		task := &arkv1alpha1.A2ATask{
			Status: arkv1alpha1.A2ATaskStatus{ProtocolMetadata: map[string]string{"context": "{not json"}},
		}
		name, ns := resolveResumptionAgent(state("my-agent"), task)
		assert.Equal(t, "my-agent", name)
		assert.Equal(t, "default", ns)
	})
}

func TestBuildA2AResponse(t *testing.T) {
	h := newTestHandler()
	tracer := telemetrynoop.NewTracer()
	ctx, span := tracer.Start(context.Background(), "test")

	state := &executionState{
		query:          arkv1alpha1.Query{ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "default"}},
		target:         &arkv1alpha1.QueryTarget{Type: "agent", Name: "my-agent"},
		conversationId: "conv-1",
		querySpan:      span,
		targetSpan:     span,
	}

	responseMessages := []Message{NewAssistantMessage("the final answer")}
	execResult := &ExecutionResult{Messages: responseMessages}

	result := h.buildA2AResponse(ctx, state, responseMessages, execResult)

	require.NotNil(t, result)
	msg, ok := result.Result.(*protocol.Message)
	require.True(t, ok, "expected Result to be *protocol.Message")
	assert.Equal(t, protocol.MessageRoleAgent, msg.Role)
	require.NotEmpty(t, msg.Parts)
}

type stubMemory struct {
	addCalls    int
	receivedIDs []string
	receivedMsg [][]Message
	failOnAdd   error
	getMessages []Message
	failOnGet   error
}

func (m *stubMemory) AddMessages(_ context.Context, queryID string, messages []Message) error {
	m.addCalls++
	m.receivedIDs = append(m.receivedIDs, queryID)
	m.receivedMsg = append(m.receivedMsg, messages)
	return m.failOnAdd
}

func (m *stubMemory) GetMessages(_ context.Context) ([]Message, error) {
	return m.getMessages, m.failOnGet
}

func (m *stubMemory) DeleteQuery(_ context.Context, _ string) error { return nil }

func (m *stubMemory) Close() error { return nil }

func TestSaveInputMessagesToMemory(t *testing.T) {
	h := newTestHandler()
	ctx := context.Background()

	t.Run("no-op when memory is nil", func(t *testing.T) {
		state := &executionState{
			query:         arkv1alpha1.Query{ObjectMeta: metav1.ObjectMeta{Name: "q"}},
			inputMessages: []Message{NewUserMessage("hi")},
		}
		h.saveInputMessagesToMemory(ctx, state)
	})

	t.Run("no-op when inputMessages is empty", func(t *testing.T) {
		mem := &stubMemory{}
		state := &executionState{
			query:  arkv1alpha1.Query{ObjectMeta: metav1.ObjectMeta{Name: "q"}},
			memory: mem,
		}
		h.saveInputMessagesToMemory(ctx, state)
		assert.Zero(t, mem.addCalls, "should not call AddMessages on empty input")
	})

	t.Run("no-op when memoryMessages already populated", func(t *testing.T) {
		mem := &stubMemory{}
		state := &executionState{
			query:          arkv1alpha1.Query{ObjectMeta: metav1.ObjectMeta{Name: "q"}},
			memory:         mem,
			inputMessages:  []Message{NewUserMessage("hi")},
			memoryMessages: []Message{NewUserMessage("previous")},
		}
		h.saveInputMessagesToMemory(ctx, state)
		assert.Zero(t, mem.addCalls, "should skip save when memory already has history")
	})

	t.Run("saves input messages on first approval", func(t *testing.T) {
		mem := &stubMemory{}
		state := &executionState{
			query:         arkv1alpha1.Query{ObjectMeta: metav1.ObjectMeta{Name: "query-1"}},
			memory:        mem,
			inputMessages: []Message{NewUserMessage("approve me")},
		}
		h.saveInputMessagesToMemory(ctx, state)
		require.Equal(t, 1, mem.addCalls)
		assert.Equal(t, "query-1", mem.receivedIDs[0])
		assert.Len(t, mem.receivedMsg[0], 1)
	})

	t.Run("tolerates AddMessages error without panicking", func(t *testing.T) {
		mem := &stubMemory{failOnAdd: fmt.Errorf("memory down")}
		state := &executionState{
			query:         arkv1alpha1.Query{ObjectMeta: metav1.ObjectMeta{Name: "q"}},
			memory:        mem,
			inputMessages: []Message{NewUserMessage("hi")},
		}
		h.saveInputMessagesToMemory(ctx, state)
		assert.Equal(t, 1, mem.addCalls)
	})
}

func TestSaveErrorMessagesToMemory(t *testing.T) {
	h := newTestHandler()
	ctx := context.Background()
	someErr := fmt.Errorf("boom")

	t.Run("no-op when memory is nil", func(t *testing.T) {
		state := &executionState{
			query:         arkv1alpha1.Query{ObjectMeta: metav1.ObjectMeta{Name: "q"}},
			inputMessages: []Message{NewUserMessage("hi")},
		}
		h.saveErrorMessagesToMemory(ctx, state, someErr)
	})

	t.Run("no-op when inputMessages is empty", func(t *testing.T) {
		mem := &stubMemory{}
		state := &executionState{
			query:  arkv1alpha1.Query{ObjectMeta: metav1.ObjectMeta{Name: "q"}},
			memory: mem,
		}
		h.saveErrorMessagesToMemory(ctx, state, someErr)
		assert.Zero(t, mem.addCalls)
	})

	t.Run("appends error message and persists", func(t *testing.T) {
		mem := &stubMemory{}
		state := &executionState{
			query:         arkv1alpha1.Query{ObjectMeta: metav1.ObjectMeta{Name: "q"}},
			memory:        mem,
			inputMessages: []Message{NewUserMessage("hi")},
		}
		h.saveErrorMessagesToMemory(ctx, state, someErr)
		require.Equal(t, 1, mem.addCalls)
		require.NotEmpty(t, mem.receivedMsg[0])
	})
}

func TestSaveFinalMessagesToMemory(t *testing.T) {
	h := newTestHandler()
	ctx := context.Background()

	t.Run("no-op when memory is nil", func(t *testing.T) {
		state := &executionState{
			query:         arkv1alpha1.Query{ObjectMeta: metav1.ObjectMeta{Name: "q"}},
			inputMessages: []Message{NewUserMessage("hi")},
		}
		h.saveFinalMessagesToMemory(ctx, state, []Message{NewAssistantMessage("done")})
	})

	t.Run("no-op when responseMessages is empty", func(t *testing.T) {
		mem := &stubMemory{}
		state := &executionState{
			query:  arkv1alpha1.Query{ObjectMeta: metav1.ObjectMeta{Name: "q"}},
			memory: mem,
		}
		h.saveFinalMessagesToMemory(ctx, state, nil)
		assert.Zero(t, mem.addCalls)
	})

	t.Run("first-execution path saves prepared messages", func(t *testing.T) {
		mem := &stubMemory{}
		state := &executionState{
			query:         arkv1alpha1.Query{ObjectMeta: metav1.ObjectMeta{Name: "q-first"}},
			memory:        mem,
			inputMessages: []Message{NewUserMessage("ask")},
		}
		response := []Message{NewAssistantMessage("answer")}
		h.saveFinalMessagesToMemory(ctx, state, response)
		require.Equal(t, 1, mem.addCalls)
		assert.Equal(t, "q-first", mem.receivedIDs[0])
		assert.NotEmpty(t, mem.receivedMsg[0])
	})

	t.Run("resumption path saves only response messages", func(t *testing.T) {
		mem := &stubMemory{}
		state := &executionState{
			query:          arkv1alpha1.Query{ObjectMeta: metav1.ObjectMeta{Name: "q-resume"}},
			memory:         mem,
			inputMessages:  []Message{NewUserMessage("orig")},
			memoryMessages: []Message{NewUserMessage("from-memory")},
		}
		response := []Message{NewAssistantMessage("post-approval")}
		h.saveFinalMessagesToMemory(ctx, state, response)
		require.Equal(t, 1, mem.addCalls)
		assert.Len(t, mem.receivedMsg[0], 1)
	})

	t.Run("tolerates AddMessages error", func(t *testing.T) {
		mem := &stubMemory{failOnAdd: fmt.Errorf("boom")}
		state := &executionState{
			query:         arkv1alpha1.Query{ObjectMeta: metav1.ObjectMeta{Name: "q"}},
			memory:        mem,
			inputMessages: []Message{NewUserMessage("hi")},
		}
		h.saveFinalMessagesToMemory(ctx, state, []Message{NewAssistantMessage("done")})
		assert.Equal(t, 1, mem.addCalls)
	})
}

func TestHandleResumption_EarlyExits(t *testing.T) {
	tracer := telemetrynoop.NewTracer()
	target := &arkv1alpha1.QueryTarget{Type: "agent", Name: "missing-agent"}
	baseQuery := arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "default"},
	}

	t.Run("returns error when A2ATask has no contextId", func(t *testing.T) {
		h := newTestHandler()
		_, span := tracer.Start(context.Background(), "test")
		state := &executionState{
			query:      baseQuery,
			target:     target,
			querySpan:  span,
			targetSpan: span,
		}
		task := &arkv1alpha1.A2ATask{} // no Spec.ContextID

		_, _, err := h.handleResumption(context.Background(), state, task)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "contextId")
	})

	t.Run("returns error when toolCalls metadata is missing", func(t *testing.T) {
		h := newTestHandler()
		_, span := tracer.Start(context.Background(), "test")
		state := &executionState{
			query:      baseQuery,
			target:     target,
			querySpan:  span,
			targetSpan: span,
		}
		task := &arkv1alpha1.A2ATask{
			Spec: arkv1alpha1.A2ATaskSpec{ContextID: "conv-1"},
			Status: arkv1alpha1.A2ATaskStatus{
				ProtocolMetadata: map[string]string{},
			},
		}

		_, _, err := h.handleResumption(context.Background(), state, task)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "toolCalls")
	})

	t.Run("returns error when toolCalls JSON is malformed", func(t *testing.T) {
		h := newTestHandler()
		_, span := tracer.Start(context.Background(), "test")
		state := &executionState{
			query:      baseQuery,
			target:     target,
			querySpan:  span,
			targetSpan: span,
		}
		task := &arkv1alpha1.A2ATask{
			Spec: arkv1alpha1.A2ATaskSpec{ContextID: "conv-1"},
			Status: arkv1alpha1.A2ATaskStatus{
				ProtocolMetadata: map[string]string{
					"toolCalls": `not-valid-json`,
				},
			},
		}

		_, _, err := h.handleResumption(context.Background(), state, task)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to parse toolCalls")
	})

	t.Run("returns error when agent CRD is missing", func(t *testing.T) {
		h := newTestHandler() // empty fake client — no agent
		_, span := tracer.Start(context.Background(), "test")
		state := &executionState{
			query:      baseQuery,
			target:     target,
			querySpan:  span,
			targetSpan: span,
		}
		task := &arkv1alpha1.A2ATask{
			Spec: arkv1alpha1.A2ATaskSpec{ContextID: "conv-1"},
			Status: arkv1alpha1.A2ATaskStatus{
				ProtocolMetadata: map[string]string{
					"toolCalls": `[{"id":"c1","type":"function","function":{"name":"f","arguments":"{}"}}]`,
				},
			},
		}

		_, _, err := h.handleResumption(context.Background(), state, task)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to get agent")
	})
}

func TestHandleApprovalRequired_OnTimeoutProceed(t *testing.T) {
	h := newTestHandler()
	tracer := telemetrynoop.NewTracer()
	ctx, span := tracer.Start(context.Background(), "test")

	state := &executionState{
		query:          arkv1alpha1.Query{ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "default"}},
		conversationId: "conv-xyz",
		querySpan:      span,
		targetSpan:     span,
	}

	approvalErr := &ApprovalRequiredError{
		ToolCalls: []ToolCall{{ID: "c1"}},
		Config: &arkv1alpha1.ToolApprovalConfig{
			Timeout:   &metav1.Duration{Duration: 30 * time.Second},
			OnTimeout: "proceed",
		},
		Context: &ExecutionContext{ConversationID: "conv-xyz"},
	}

	result := h.handleApprovalRequired(ctx, state, approvalErr)

	task, ok := result.Result.(*protocol.Task)
	require.True(t, ok)
	assert.Equal(t, "30s", task.Metadata["timeout"])
	assert.Equal(t, "proceed", task.Metadata["onTimeout"])
}
