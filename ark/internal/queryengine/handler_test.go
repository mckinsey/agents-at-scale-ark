package queryengine

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	"mckinsey.com/ark/internal/genai"
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
					genai.ArkMetadataKey: map[string]any{
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
		messages []genai.Message
		want     string
	}{
		{
			name:     "single assistant message",
			messages: []genai.Message{genai.NewAssistantMessage("hello world")},
			want:     "hello world",
		},
		{
			name: "multiple messages returns last assistant",
			messages: []genai.Message{
				genai.NewAssistantMessage("first"),
				genai.NewAssistantMessage("second"),
			},
			want: "second",
		},
		{
			name:     "empty messages",
			messages: []genai.Message{},
			want:     "",
		},
		{
			name:     "no assistant messages",
			messages: []genai.Message{genai.NewUserMessage("user input")},
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
			genai.ArkMetadataKey: map[string]any{
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
			genai.ArkMetadataKey: map[string]any{
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
