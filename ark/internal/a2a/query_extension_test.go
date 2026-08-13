/* Copyright 2025. McKinsey & Company */

package a2a

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	"mckinsey.com/ark/internal/eventing"
	eventnoop "mckinsey.com/ark/internal/eventing/noop"
)

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

func TestNewQueryExtensionMessageConversationID(t *testing.T) {
	msg := NewQueryExtensionMessage("hello", "parent-context", QueryExtensionRef{
		Name:           "my-query",
		Namespace:      "default",
		Target:         &QueryExtensionTarget{Type: "agent", Name: "member-a"},
		ConversationID: "9f2c4e1a7b8d3f50",
	})

	got, err := json.Marshal(msg.Metadata)
	require.NoError(t, err)

	assert.JSONEq(t, `{
		"`+QueryExtensionMetadataKey+`": {
			"name": "my-query",
			"namespace": "default",
			"target": {"type": "agent", "name": "member-a"},
			"conversationId": "9f2c4e1a7b8d3f50"
		}
	}`, string(got))

	require.NotNil(t, msg.ContextID)
	assert.Equal(t, "parent-context", *msg.ContextID, "the scope rides in metadata, not on contextId")
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

func sendMessageStub(t *testing.T, reply string, captured *map[string]any) *httptest.Server {
	t.Helper()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)

		var request map[string]any
		require.NoError(t, json.Unmarshal(body, &request))
		if captured != nil {
			*captured = request
		}

		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0",
			"id":      request["id"],
			"result": map[string]any{
				"kind":      "message",
				"role":      "agent",
				"messageId": "reply-1",
				"parts":     []map[string]any{{"kind": "text", "text": reply}},
			},
		}))
	}))
	t.Cleanup(server.Close)

	return server
}

type recordingA2aRecorder struct {
	eventing.A2aRecorder
	messageFailures []string
}

func (r *recordingA2aRecorder) A2AMessageFailed(_ context.Context, reason string) {
	r.messageFailures = append(r.messageFailures, reason)
}

func TestSendQueryExtensionMessage(t *testing.T) {
	var captured map[string]any
	server := sendMessageStub(t, "engine reply", &captured)

	msg := NewQueryExtensionMessage("run it", "ctx-1", QueryExtensionRef{
		Name:           "my-query",
		Namespace:      "default",
		Target:         &QueryExtensionTarget{Type: "agent", Name: "member-a"},
		ConversationID: "9f2c4e1a7b8d3f50",
	})

	result, err := SendQueryExtensionMessage(t.Context(), nil, server.URL, nil, "default", "member-a", msg, nil)
	require.NoError(t, err)
	require.NotNil(t, result)

	reply, ok := result.Result.(*protocol.Message)
	require.True(t, ok, "expected a message result, got %T", result.Result)
	assert.Equal(t, "engine reply", ExtractTextFromParts(reply.Parts))

	assert.Equal(t, string(protocol.MethodMessageSend), captured["method"])

	params, ok := captured["params"].(map[string]any)
	require.True(t, ok, "expected params on the request body")

	configuration, ok := params["configuration"].(map[string]any)
	require.True(t, ok, "expected configuration on the request body")
	assert.Equal(t, true, configuration["blocking"], "the engine path is request-response, not streaming")

	sentMessage, ok := params["message"].(map[string]any)
	require.True(t, ok, "expected a message on the request body")

	sentMetadata, err := json.Marshal(sentMessage["metadata"])
	require.NoError(t, err)
	assert.JSONEq(t, `{
		"`+QueryExtensionMetadataKey+`": {
			"name": "my-query",
			"namespace": "default",
			"target": {"type": "agent", "name": "member-a"},
			"conversationId": "9f2c4e1a7b8d3f50"
		}
	}`, string(sentMetadata), "the extension metadata must survive the wire, not just message construction")
}

func TestSendQueryExtensionMessageRecordsSendFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	t.Cleanup(server.Close)

	msg := NewQueryExtensionMessage("run it", "", QueryExtensionRef{Name: "my-query", Namespace: "default"})
	recorder := &recordingA2aRecorder{A2aRecorder: eventnoop.NewProvider().A2aRecorder()}

	result, err := SendQueryExtensionMessage(t.Context(), nil, server.URL, nil, "default", "member-a", msg, recorder)
	require.Error(t, err)
	assert.Nil(t, result)
	require.Len(t, recorder.messageFailures, 1)
	assert.Contains(t, recorder.messageFailures[0], "A2A SendMessage failed")
}

func TestSendQueryExtensionMessageSendFailureWithoutRecorder(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	t.Cleanup(server.Close)

	msg := NewQueryExtensionMessage("run it", "", QueryExtensionRef{Name: "my-query", Namespace: "default"})

	result, err := SendQueryExtensionMessage(t.Context(), nil, server.URL, nil, "default", "member-a", msg, nil)
	require.Error(t, err)
	assert.Nil(t, result)
}

func TestSendQueryExtensionMessageClientCreationFails(t *testing.T) {
	msg := NewQueryExtensionMessage("run it", "", QueryExtensionRef{Name: "my-query", Namespace: "default"})

	result, err := SendQueryExtensionMessage(t.Context(), nil, "not-an-absolute-url", nil, "default", "member-a", msg, nil)
	require.Error(t, err)
	assert.Nil(t, result)
	assert.Contains(t, err.Error(), "failed to create A2A client")
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
