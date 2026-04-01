package controller

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel/baggage"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	apimachinerytypes "k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
)

func newTestScheme() *runtime.Scheme {
	scheme := runtime.NewScheme()
	_ = arkv1alpha1.AddToScheme(scheme)
	_ = arkv1prealpha1.AddToScheme(scheme)
	return scheme
}

func TestResolveDispatchAddress(t *testing.T) {
	const completionsAddr = "http://completions:8080"
	const engineAddr = "http://my-engine:9090"

	t.Run("non-agent target returns completions address", func(t *testing.T) {
		r := &QueryReconciler{
			Client:          fake.NewClientBuilder().WithScheme(newTestScheme()).Build(),
			CompletionsAddr: completionsAddr,
		}
		target := arkv1alpha1.QueryTarget{Type: targetTypeTeam, Name: "my-team"}
		addr, err := r.resolveDispatchAddress(context.Background(), target, "default")
		require.NoError(t, err)
		assert.Equal(t, completionsAddr, addr)
	})

	t.Run("agent without execution engine returns completions address", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "my-agent", Namespace: "default"},
		}
		r := &QueryReconciler{
			Client:          fake.NewClientBuilder().WithScheme(newTestScheme()).WithObjects(agent).Build(),
			CompletionsAddr: completionsAddr,
		}
		target := arkv1alpha1.QueryTarget{Type: targetTypeAgent, Name: "my-agent"}
		addr, err := r.resolveDispatchAddress(context.Background(), target, "default")
		require.NoError(t, err)
		assert.Equal(t, completionsAddr, addr)
	})

	t.Run("agent with a2a execution engine returns completions address", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "a2a-agent", Namespace: "default"},
			Spec: arkv1alpha1.AgentSpec{
				ExecutionEngine: &arkv1alpha1.ExecutionEngineRef{Name: arka2a.ExecutionEngineA2A},
			},
		}
		r := &QueryReconciler{
			Client:          fake.NewClientBuilder().WithScheme(newTestScheme()).WithObjects(agent).Build(),
			CompletionsAddr: completionsAddr,
		}
		target := arkv1alpha1.QueryTarget{Type: targetTypeAgent, Name: "a2a-agent"}
		addr, err := r.resolveDispatchAddress(context.Background(), target, "default")
		require.NoError(t, err)
		assert.Equal(t, completionsAddr, addr)
	})

	t.Run("agent with named execution engine returns engine address", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "engine-agent", Namespace: "default"},
			Spec: arkv1alpha1.AgentSpec{
				ExecutionEngine: &arkv1alpha1.ExecutionEngineRef{Name: "my-engine"},
			},
		}
		engine := &arkv1prealpha1.ExecutionEngine{
			ObjectMeta: metav1.ObjectMeta{Name: "my-engine", Namespace: "default"},
			Status:     arkv1prealpha1.ExecutionEngineStatus{LastResolvedAddress: engineAddr},
		}
		r := &QueryReconciler{
			Client:          fake.NewClientBuilder().WithScheme(newTestScheme()).WithObjects(agent, engine).Build(),
			CompletionsAddr: completionsAddr,
		}
		target := arkv1alpha1.QueryTarget{Type: targetTypeAgent, Name: "engine-agent"}
		addr, err := r.resolveDispatchAddress(context.Background(), target, "default")
		require.NoError(t, err)
		assert.Equal(t, engineAddr, addr)
	})

	t.Run("named engine not found returns error", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "orphan-agent", Namespace: "default"},
			Spec: arkv1alpha1.AgentSpec{
				ExecutionEngine: &arkv1alpha1.ExecutionEngineRef{Name: "missing-engine"},
			},
		}
		r := &QueryReconciler{
			Client:          fake.NewClientBuilder().WithScheme(newTestScheme()).WithObjects(agent).Build(),
			CompletionsAddr: completionsAddr,
		}
		target := arkv1alpha1.QueryTarget{Type: targetTypeAgent, Name: "orphan-agent"}
		_, err := r.resolveDispatchAddress(context.Background(), target, "default")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "not found")
	})

	t.Run("named engine with empty address returns error", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "pending-agent", Namespace: "default"},
			Spec: arkv1alpha1.AgentSpec{
				ExecutionEngine: &arkv1alpha1.ExecutionEngineRef{Name: "pending-engine"},
			},
		}
		engine := &arkv1prealpha1.ExecutionEngine{
			ObjectMeta: metav1.ObjectMeta{Name: "pending-engine", Namespace: "default"},
			Status:     arkv1prealpha1.ExecutionEngineStatus{LastResolvedAddress: ""},
		}
		r := &QueryReconciler{
			Client:          fake.NewClientBuilder().WithScheme(newTestScheme()).WithObjects(agent, engine).Build(),
			CompletionsAddr: completionsAddr,
		}
		target := arkv1alpha1.QueryTarget{Type: targetTypeAgent, Name: "pending-agent"}
		_, err := r.resolveDispatchAddress(context.Background(), target, "default")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "address not yet resolved")
	})

	t.Run("agent not found falls back to completions address", func(t *testing.T) {
		r := &QueryReconciler{
			Client:          fake.NewClientBuilder().WithScheme(newTestScheme()).Build(),
			CompletionsAddr: completionsAddr,
		}
		target := arkv1alpha1.QueryTarget{Type: targetTypeAgent, Name: "nonexistent"}
		addr, err := r.resolveDispatchAddress(context.Background(), target, "default")
		require.NoError(t, err)
		assert.Equal(t, completionsAddr, addr)
	})
}

func TestExtractA2AMeta(t *testing.T) {
	t.Run("extracts contextId and taskId", func(t *testing.T) {
		arkMap := map[string]any{
			"a2a": map[string]any{
				"contextId": "ctx-123",
				"taskId":    "task-456",
			},
		}
		var meta engineResponseMeta
		extractA2AMeta(arkMap, &meta)
		assert.Equal(t, "ctx-123", meta.A2AContextID)
		assert.Equal(t, "task-456", meta.A2ATaskID)
	})

	t.Run("missing a2a key is no-op", func(t *testing.T) {
		arkMap := map[string]any{}
		var meta engineResponseMeta
		extractA2AMeta(arkMap, &meta)
		assert.Empty(t, meta.A2AContextID)
		assert.Empty(t, meta.A2ATaskID)
	})

	t.Run("partial data extracts what exists", func(t *testing.T) {
		arkMap := map[string]any{
			"a2a": map[string]any{
				"contextId": "ctx-only",
			},
		}
		var meta engineResponseMeta
		extractA2AMeta(arkMap, &meta)
		assert.Equal(t, "ctx-only", meta.A2AContextID)
		assert.Empty(t, meta.A2ATaskID)
	})
}

func TestExtractTokenUsage(t *testing.T) {
	t.Run("extracts token usage", func(t *testing.T) {
		arkMap := map[string]any{
			"tokenUsage": map[string]any{
				"prompt_tokens":     float64(100),
				"completion_tokens": float64(50),
				"total_tokens":      float64(150),
			},
		}
		var meta engineResponseMeta
		extractTokenUsage(arkMap, &meta)
		require.NotNil(t, meta.TokenUsage)
		assert.Equal(t, int64(100), meta.TokenUsage.PromptTokens)
		assert.Equal(t, int64(50), meta.TokenUsage.CompletionTokens)
		assert.Equal(t, int64(150), meta.TokenUsage.TotalTokens)
	})

	t.Run("zero total tokens returns nil", func(t *testing.T) {
		arkMap := map[string]any{
			"tokenUsage": map[string]any{
				"total_tokens": float64(0),
			},
		}
		var meta engineResponseMeta
		extractTokenUsage(arkMap, &meta)
		assert.Nil(t, meta.TokenUsage)
	})

	t.Run("missing tokenUsage is no-op", func(t *testing.T) {
		arkMap := map[string]any{}
		var meta engineResponseMeta
		extractTokenUsage(arkMap, &meta)
		assert.Nil(t, meta.TokenUsage)
	})
}

func TestExtractEngineResponseMeta(t *testing.T) {
	t.Run("nil result returns empty meta", func(t *testing.T) {
		meta := extractEngineResponseMeta(nil)
		assert.Empty(t, meta.ConversationId)
		assert.Nil(t, meta.TokenUsage)
	})

	t.Run("extracts all fields from message result", func(t *testing.T) {
		messagesData := []map[string]string{{"role": "assistant", "content": "hi"}}
		messagesBytes, _ := json.Marshal(messagesData)

		msg := &protocol.Message{
			Role:  protocol.MessageRoleAgent,
			Parts: []protocol.Part{protocol.NewTextPart("response")},
			Metadata: map[string]any{
				arka2a.QueryExtensionMetadataKey: map[string]any{
					"conversationId": "conv-1",
					"messages":       json.RawMessage(messagesBytes),
					"a2a": map[string]any{
						"contextId": "ctx-1",
						"taskId":    "task-1",
					},
					"tokenUsage": map[string]any{
						"prompt_tokens":     float64(10),
						"completion_tokens": float64(20),
						"total_tokens":      float64(30),
					},
				},
			},
		}

		result := &protocol.MessageResult{Result: msg}
		meta := extractEngineResponseMeta(result)
		assert.Equal(t, "conv-1", meta.ConversationId)
		assert.Equal(t, "ctx-1", meta.A2AContextID)
		assert.Equal(t, "task-1", meta.A2ATaskID)
		require.NotNil(t, meta.TokenUsage)
		assert.Equal(t, int64(30), meta.TokenUsage.TotalTokens)
		assert.NotEmpty(t, meta.MessagesRaw)
	})

	t.Run("non-message result returns empty meta", func(t *testing.T) {
		task := &protocol.Task{ID: "t1"}
		result := &protocol.MessageResult{Result: task}
		meta := extractEngineResponseMeta(result)
		assert.Empty(t, meta.ConversationId)
	})
}

func TestConversationIdToContextId(t *testing.T) {
	t.Run("conversationId creates message with contextId", func(t *testing.T) {
		conversationId := "conv-123"
		message := protocol.NewMessageWithContext(protocol.MessageRoleUser, []protocol.Part{
			protocol.NewTextPart("hello"),
		}, nil, &conversationId)
		require.NotNil(t, message.ContextID)
		assert.Equal(t, "conv-123", *message.ContextID)
	})

	t.Run("empty conversationId creates message without contextId", func(t *testing.T) {
		message := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
			protocol.NewTextPart("hello"),
		})
		assert.Nil(t, message.ContextID)
	})

	t.Run("status.conversationId set from engineMeta.ConversationId", func(t *testing.T) {
		meta := engineResponseMeta{ConversationId: "conv-from-engine", A2AContextID: "ctx-from-a2a"}
		var query arkv1alpha1.Query
		if meta.ConversationId != "" {
			query.Status.ConversationId = meta.ConversationId
		} else if meta.A2AContextID != "" {
			query.Status.ConversationId = meta.A2AContextID
		}
		assert.Equal(t, "conv-from-engine", query.Status.ConversationId)
	})

	t.Run("status.conversationId falls back to A2AContextID", func(t *testing.T) {
		meta := engineResponseMeta{A2AContextID: "ctx-from-a2a"}
		var query arkv1alpha1.Query
		if meta.ConversationId != "" {
			query.Status.ConversationId = meta.ConversationId
		} else if meta.A2AContextID != "" {
			query.Status.ConversationId = meta.A2AContextID
		}
		assert.Equal(t, "ctx-from-a2a", query.Status.ConversationId)
	})

	t.Run("status.conversationId empty when neither set", func(t *testing.T) {
		meta := engineResponseMeta{}
		var query arkv1alpha1.Query
		if meta.ConversationId != "" {
			query.Status.ConversationId = meta.ConversationId
		} else if meta.A2AContextID != "" {
			query.Status.ConversationId = meta.A2AContextID
		}
		assert.Empty(t, query.Status.ConversationId)
	})
}

func TestSessionIDBaggage(t *testing.T) {
	t.Run("baggage is set with session ID from spec", func(t *testing.T) {
		query := arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q1", Namespace: "default"},
			Spec:       arkv1alpha1.QuerySpec{SessionId: "explicit-session"},
		}

		sessionId := query.Spec.SessionId
		if sessionId == "" {
			sessionId = string(query.UID)
		}

		ctx := context.Background()
		member, err := baggage.NewMember("ark.session.id", sessionId)
		require.NoError(t, err)
		bag, err := baggage.New(member)
		require.NoError(t, err)
		ctx = baggage.ContextWithBaggage(ctx, bag)

		extractedBag := baggage.FromContext(ctx)
		assert.Equal(t, "explicit-session", extractedBag.Member("ark.session.id").Value())
	})

	t.Run("baggage uses UID when session ID is empty", func(t *testing.T) {
		query := arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "q2",
				Namespace: "default",
				UID:       apimachinerytypes.UID("uid-123"),
			},
		}

		sessionId := query.Spec.SessionId
		if sessionId == "" {
			sessionId = string(query.UID)
		}

		ctx := context.Background()
		member, err := baggage.NewMember("ark.session.id", sessionId)
		require.NoError(t, err)
		bag, err := baggage.New(member)
		require.NoError(t, err)
		ctx = baggage.ContextWithBaggage(ctx, bag)

		extractedBag := baggage.FromContext(ctx)
		assert.Equal(t, "uid-123", extractedBag.Member("ark.session.id").Value())
	})
}
