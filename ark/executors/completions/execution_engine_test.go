package completions

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
	"mckinsey.com/ark/internal/eventing/noop"
	"mckinsey.com/ark/internal/eventing/recorder"
)

func newTestExecutionEngineClient(objects ...client.Object) (*ExecutionEngineA2AClient, client.Client) {
	scheme := runtime.NewScheme()
	_ = arkv1alpha1.AddToScheme(scheme)
	_ = arkv1prealpha1.AddToScheme(scheme)

	k8sClient := fake.NewClientBuilder().
		WithScheme(scheme).
		WithObjects(objects...).
		WithStatusSubresource(&arkv1prealpha1.ExecutionEngine{}).
		Build()

	emitter := noop.NewNoopEventEmitter()
	rec := recorder.NewExecutionEngineRecorder(emitter, emitter)
	return NewExecutionEngineA2AClient(k8sClient, rec), k8sClient
}

func TestNewExecutionEngineA2AClient(t *testing.T) {
	c, _ := newTestExecutionEngineClient()
	assert.NotNil(t, c)
	assert.NotNil(t, c.client)
	assert.NotNil(t, c.eventingRecorder)
}

func TestConvertToExecutionEngineMessage(t *testing.T) {
	tests := []struct {
		name     string
		msg      Message
		expected ExecutionEngineMessage
	}{
		{
			name:     "user message",
			msg:      NewUserMessage("hello"),
			expected: ExecutionEngineMessage{Role: "user", Content: "hello"},
		},
		{
			name:     "assistant message",
			msg:      NewAssistantMessage("response"),
			expected: ExecutionEngineMessage{Role: "assistant", Content: "response"},
		},
		{
			name:     "system message",
			msg:      NewSystemMessage("system prompt"),
			expected: ExecutionEngineMessage{Role: "system", Content: "system prompt"},
		},
		{
			name:     "tool message",
			msg:      ToolMessage("tool result", "call-1"),
			expected: ExecutionEngineMessage{Role: "tool", Content: "tool result"},
		},
		{
			name:     "empty message fallback",
			msg:      Message{},
			expected: ExecutionEngineMessage{Role: "user", Content: ""},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := convertToExecutionEngineMessage(tt.msg)
			assert.Equal(t, tt.expected.Role, result.Role)
			assert.Equal(t, tt.expected.Content, result.Content)
		})
	}
}

func TestBuildAgentConfig(t *testing.T) {
	t.Run("with model", func(t *testing.T) {
		agent := &Agent{
			Name:        "test-agent",
			Namespace:   "default",
			Prompt:      "you are helpful",
			Description: "a test agent",
			Parameters: []arkv1alpha1.Parameter{
				{Name: "key", Value: "val"},
			},
			Model: &Model{
				Model:    "gpt-4",
				Type:     "openai",
				Provider: &OpenAIProvider{},
			},
		}

		cfg, err := buildAgentConfig(agent)
		require.NoError(t, err)
		assert.Equal(t, "test-agent", cfg.Name)
		assert.Equal(t, "default", cfg.Namespace)
		assert.Equal(t, "you are helpful", cfg.Prompt)
		assert.Equal(t, "a test agent", cfg.Description)
		assert.Equal(t, "gpt-4", cfg.Model.Name)
		assert.Equal(t, ProviderOpenAI, cfg.Model.Type)
		assert.Len(t, cfg.Parameters, 1)
		assert.Equal(t, "key", cfg.Parameters[0].Name)
	})

	t.Run("without model returns error", func(t *testing.T) {
		agent := &Agent{
			Name:      "no-model",
			Namespace: "default",
		}

		_, err := buildAgentConfig(agent)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "no model configured")
	})
}

func TestBuildParameters(t *testing.T) {
	t.Run("filters empty values", func(t *testing.T) {
		params := buildParameters([]arkv1alpha1.Parameter{
			{Name: "a", Value: "1"},
			{Name: "b", Value: ""},
			{Name: "c", Value: "3"},
		})
		assert.Len(t, params, 2)
		assert.Equal(t, "a", params[0].Name)
		assert.Equal(t, "1", params[0].Value)
		assert.Equal(t, "c", params[1].Name)
	})

	t.Run("nil input", func(t *testing.T) {
		params := buildParameters(nil)
		assert.Nil(t, params)
	})
}

func TestDetectProviderName(t *testing.T) {
	tests := []struct {
		name     string
		model    *Model
		expected string
	}{
		{
			name:     "azure provider",
			model:    &Model{Type: "custom", Provider: &AzureProvider{}},
			expected: ProviderAzure,
		},
		{
			name:     "openai provider",
			model:    &Model{Type: "custom", Provider: &OpenAIProvider{}},
			expected: ProviderOpenAI,
		},
		{
			name:     "bedrock provider",
			model:    &Model{Type: "custom", Provider: &BedrockModel{}},
			expected: ProviderBedrock,
		},
		{
			name:     "unknown provider falls back to type",
			model:    &Model{Type: "custom-type", Provider: nil},
			expected: "custom-type",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, detectProviderName(tt.model))
		})
	}
}

func TestBuildModelConfig(t *testing.T) {
	t.Run("with config provider", func(t *testing.T) {
		provider := &OpenAIProvider{}
		model := &Model{
			Type:     ProviderOpenAI,
			Provider: provider,
		}
		cfg := buildModelConfig(model)
		assert.Contains(t, cfg, ProviderOpenAI)
	})

	t.Run("without config provider", func(t *testing.T) {
		model := &Model{
			Type:     "test",
			Provider: nil,
		}
		cfg := buildModelConfig(model)
		assert.Empty(t, cfg)
	})
}

func TestBuildToolDefinitions(t *testing.T) {
	t.Run("nil registry", func(t *testing.T) {
		result := buildToolDefinitions(nil)
		assert.Nil(t, result)
	})

	t.Run("with registry", func(t *testing.T) {
		registry := NewToolRegistry(nil, nil, nil)
		registry.RegisterTool(ToolDefinition{Name: "tool1", Description: "desc1"}, nil)
		result := buildToolDefinitions(registry)
		assert.Len(t, result, 1)
		assert.Equal(t, "tool1", result[0].Name)
	})
}

func TestExtractResponseText(t *testing.T) {
	t.Run("nil result", func(t *testing.T) {
		_, err := extractResponseText(nil)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "nil result")
	})

	t.Run("message result", func(t *testing.T) {
		msg := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
			protocol.NewTextPart("hello from agent"),
		})
		result := &protocol.MessageResult{Result: &msg}
		text, err := extractResponseText(result)
		require.NoError(t, err)
		assert.Equal(t, "hello from agent", text)
	})

	t.Run("task result completed", func(t *testing.T) {
		task := &protocol.Task{
			ID: "task-1",
			Status: protocol.TaskStatus{
				State: arka2a.TaskStateCompleted,
			},
			History: []protocol.Message{
				{
					Role:  protocol.MessageRoleAgent,
					Parts: []protocol.Part{protocol.TextPart{Text: "task done"}},
				},
			},
		}
		result := &protocol.MessageResult{Result: task}
		text, err := extractResponseText(result)
		require.NoError(t, err)
		assert.Equal(t, "task done", text)
	})

	t.Run("task result failed", func(t *testing.T) {
		task := &protocol.Task{
			ID: "task-2",
			Status: protocol.TaskStatus{
				State: arka2a.TaskStateFailed,
				Message: &protocol.Message{
					Parts: []protocol.Part{protocol.TextPart{Text: "error occurred"}},
				},
			},
		}
		result := &protocol.MessageResult{Result: task}
		_, err := extractResponseText(result)
		assert.Error(t, err)
	})

	t.Run("nil result field", func(t *testing.T) {
		result := &protocol.MessageResult{Result: nil}
		_, err := extractResponseText(result)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "unexpected A2A result type")
	})
}

func TestResolveExecutionEngineAddress(t *testing.T) {
	t.Run("engine found with address", func(t *testing.T) {
		engine := &arkv1prealpha1.ExecutionEngine{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "my-engine",
				Namespace: "default",
			},
			Status: arkv1prealpha1.ExecutionEngineStatus{
				LastResolvedAddress: "https://engine.example.com",
			},
		}

		c, k8sClient := newTestExecutionEngineClient(engine)
		ctx := context.Background()

		_ = k8sClient.Status().Update(ctx, engine)

		ref := &arkv1alpha1.ExecutionEngineRef{Name: "my-engine"}
		addr, err := c.resolveExecutionEngineAddress(ctx, ref, "default")
		require.NoError(t, err)
		assert.Equal(t, "https://engine.example.com", addr)
	})

	t.Run("engine not found", func(t *testing.T) {
		c, _ := newTestExecutionEngineClient()
		ref := &arkv1alpha1.ExecutionEngineRef{Name: "missing-engine"}
		_, err := c.resolveExecutionEngineAddress(context.Background(), ref, "default")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "not found")
	})

	t.Run("engine with empty address", func(t *testing.T) {
		engine := &arkv1prealpha1.ExecutionEngine{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "no-addr",
				Namespace: "default",
			},
			Status: arkv1prealpha1.ExecutionEngineStatus{
				LastResolvedAddress: "",
			},
		}

		c, _ := newTestExecutionEngineClient(engine)
		ref := &arkv1alpha1.ExecutionEngineRef{Name: "no-addr"}
		_, err := c.resolveExecutionEngineAddress(context.Background(), ref, "default")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "not yet resolved")
	})

	t.Run("uses explicit namespace from ref", func(t *testing.T) {
		engine := &arkv1prealpha1.ExecutionEngine{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "ns-engine",
				Namespace: "custom-ns",
			},
			Status: arkv1prealpha1.ExecutionEngineStatus{
				LastResolvedAddress: "https://custom.example.com",
			},
		}

		c, k8sClient := newTestExecutionEngineClient(engine)
		ctx := context.Background()
		_ = k8sClient.Status().Update(ctx, engine)

		ref := &arkv1alpha1.ExecutionEngineRef{Name: "ns-engine", Namespace: "custom-ns"}
		addr, err := c.resolveExecutionEngineAddress(ctx, ref, "default")
		require.NoError(t, err)
		assert.Equal(t, "https://custom.example.com", addr)
	})
}
