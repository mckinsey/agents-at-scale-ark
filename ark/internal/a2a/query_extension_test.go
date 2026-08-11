/* Copyright 2025. McKinsey & Company */

package a2a

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

// The controller sent this literal before the helper existed. A top-level
// dispatch must keep producing exactly these bytes, or every engine pinned to an
// older ark-sdk breaks.
func legacyMetadata(name, namespace string) map[string]any {
	return map[string]any{
		QueryExtensionMetadataKey: map[string]string{
			"name":      name,
			"namespace": namespace,
		},
	}
}

func TestNewQueryExtensionMessageMatchesLegacyMetadata(t *testing.T) {
	msg := NewQueryExtensionMessage("hello", "", QueryExtensionRef{Name: "my-query", Namespace: "default"})

	got, err := json.Marshal(msg.Metadata)
	require.NoError(t, err)
	want, err := json.Marshal(legacyMetadata("my-query", "default"))
	require.NoError(t, err)

	assert.JSONEq(t, string(want), string(got))
	assert.Equal(t, string(want), string(got), "byte-identical metadata is what keeps older engines working")
}

func TestNewQueryExtensionMessageTarget(t *testing.T) {
	msg := NewQueryExtensionMessage("hello", "", QueryExtensionRef{
		Name:      "my-query",
		Namespace: "default",
		Target:    &QueryExtensionTarget{Type: "agent", Name: "member-a"},
	})

	got, err := json.Marshal(msg.Metadata)
	require.NoError(t, err)

	assert.JSONEq(t, `{
		"`+QueryExtensionMetadataKey+`": {
			"name": "my-query",
			"namespace": "default",
			"target": {"type": "agent", "name": "member-a"}
		}
	}`, string(got))
}

func TestNewQueryExtensionMessageDeclaresExtension(t *testing.T) {
	msg := NewQueryExtensionMessage("hello", "", QueryExtensionRef{Name: "q", Namespace: "default"})

	assert.Equal(t, []string{QueryExtensionURI}, msg.Extensions)
	assert.Equal(t, protocol.MessageRoleUser, msg.Role)
	require.Len(t, msg.Parts, 1)
	textPart, ok := msg.Parts[0].(protocol.TextPart)
	require.True(t, ok, "expected a text part")
	assert.Equal(t, "hello", textPart.Text)
}

func TestNewQueryExtensionMessageContextID(t *testing.T) {
	t.Run("set when provided", func(t *testing.T) {
		msg := NewQueryExtensionMessage("hello", "conv-1", QueryExtensionRef{Name: "q", Namespace: "default"})
		require.NotNil(t, msg.ContextID)
		assert.Equal(t, "conv-1", *msg.ContextID)
	})

	t.Run("absent when empty", func(t *testing.T) {
		msg := NewQueryExtensionMessage("hello", "", QueryExtensionRef{Name: "q", Namespace: "default"})
		assert.Nil(t, msg.ContextID)
	})
}
