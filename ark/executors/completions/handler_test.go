package completions

import (
	"context"
	"encoding/json"
	"testing"

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
	t.Run("empty state returns empty meta", func(t *testing.T) {
		state := &executionState{}
		meta := buildResponseMeta(state, nil, nil, arkv1alpha1.TokenUsage{})
		assert.Empty(t, meta)
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
