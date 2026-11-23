package controller

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
)

func engineReplyStub(t *testing.T, reply string, responseMeta map[string]any) *httptest.Server {
	t.Helper()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)

		var request map[string]any
		require.NoError(t, json.Unmarshal(body, &request))

		result := map[string]any{
			"kind":      "message",
			"role":      protocol.MessageRoleAgent,
			"messageId": "reply-1",
			"parts":     []map[string]any{{"kind": "text", "text": reply}},
		}
		if responseMeta != nil {
			result["metadata"] = map[string]any{arka2a.QueryExtensionMetadataKey: responseMeta}
		}

		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0",
			"id":      request["id"],
			"result":  result,
		}))
	}))
	t.Cleanup(server.Close)

	return server
}

type engineMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

func toolAndAssistantMessages(toolContent string) []engineMessage {
	return []engineMessage{
		{Role: "tool", Content: toolContent},
		{Role: "assistant", Content: "hello"},
	}
}

func TestSendQueryA2AResponseRaw(t *testing.T) {
	target := arkv1alpha1.QueryTarget{Type: targetTypeAgent, Name: "raw-agent"}
	query := arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "raw-query", Namespace: "default"},
		Spec:       arkv1alpha1.QuerySpec{Target: &target},
	}
	reconciler := &QueryReconciler{
		Client: fake.NewClientBuilder().WithScheme(newTestScheme()).Build(),
	}

	send := func(t *testing.T, responseMeta map[string]any) (*arkv1alpha1.Response, engineResponseMeta, string) {
		t.Helper()
		server := engineReplyStub(t, "hello", responseMeta)
		logger, lines := newCapturingLogger()
		ctx := logf.IntoContext(context.Background(), logger)

		response, meta, err := reconciler.sendQueryA2A(ctx, server.URL, query, target)
		require.NoError(t, err)
		require.NotNil(t, response)
		assert.Equal(t, "hello", response.Content)
		assert.Equal(t, statusDone, response.Phase)
		assert.Equal(t, target, response.Target)

		return response, meta, strings.Join(*lines, "\n")
	}

	t.Run("stores engine messages within the size limit", func(t *testing.T) {
		messages := toolAndAssistantMessages("result")

		response, meta, logs := send(t, map[string]any{"messages": messages})

		expected, err := json.Marshal(messages)
		require.NoError(t, err)
		assert.JSONEq(t, string(expected), response.Raw)
		assert.Equal(t, meta.MessagesRaw, response.Raw)
		assert.NotContains(t, logs, "exceed size limit")
	})

	t.Run("falls back to assistant text when engine messages exceed the size limit", func(t *testing.T) {
		messages := toolAndAssistantMessages(strings.Repeat("x", maxResponseRawBytes))

		response, meta, logs := send(t, map[string]any{"messages": messages})

		assert.Greater(t, len(meta.MessagesRaw), maxResponseRawBytes)
		assert.Equal(t, buildFallbackRaw("hello"), response.Raw)
		assert.Contains(t, logs, "engine response messages exceed size limit")
		assert.Contains(t, logs, `"query":"raw-query"`)
		assert.Contains(t, logs, `"limit":524288`)
	})

	t.Run("falls back to assistant text when engine sends no messages", func(t *testing.T) {
		response, _, logs := send(t, nil)

		assert.Equal(t, buildFallbackRaw("hello"), response.Raw)
		assert.NotContains(t, logs, "exceed size limit")
	})
}
