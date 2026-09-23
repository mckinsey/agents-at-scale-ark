package completions

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/openai/openai-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// failingEventStream fails every StreamChunk and, unlike the real
// HTTPEventStream, has no abandon-latch. It isolates the model loop's behavior:
// broker-side suppression after the first failure is covered by
// TestHTTPEventStream_AbandonsAfterWriteFailure.
type failingEventStream struct {
	calls int
}

func (f *failingEventStream) StreamChunk(_ context.Context, _ interface{}) error {
	f.calls++
	return errors.New("broker unavailable")
}

func (f *failingEventStream) NotifyCompletion(_ context.Context) error { return nil }
func (f *failingEventStream) Close() error                             { return nil }

func TestAgentExecute_ChunkStreamFailureIsNonFatal(t *testing.T) {
	finalResponse := &openai.ChatCompletion{
		ID:    "cmpl-1",
		Model: "test-model",
		Choices: []openai.ChatCompletionChoice{
			{
				Message:      openai.ChatCompletionMessage{Role: "assistant", Content: "hello"},
				FinishReason: "stop",
			},
		},
	}
	chunks := []*openai.ChatCompletionChunk{
		{
			ID:      "cmpl-1",
			Model:   "test-model",
			Choices: []openai.ChatCompletionChunkChoice{{Delta: openai.ChatCompletionChunkChoiceDelta{Content: "hel"}}},
		},
		{
			ID:      "cmpl-1",
			Model:   "test-model",
			Choices: []openai.ChatCompletionChunkChoice{{Delta: openai.ChatCompletionChunkChoiceDelta{Content: "lo"}}},
		},
		{
			ID:      "cmpl-1",
			Model:   "test-model",
			Choices: []openai.ChatCompletionChunkChoice{{FinishReason: "stop"}},
		},
	}

	provider := &mockChatProvider{response: finalResponse, chunks: chunks}
	agent := newTestAgent("resilient-agent", provider)
	stream := &failingEventStream{}

	res, err := agent.Execute(context.Background(), NewUserMessage("hi"), nil, nil, stream, ExecuteOptions{})
	require.NoError(t, err, "a chunk stream failure must not fail the query")
	require.NotNil(t, res)
	assert.Equal(t, len(chunks), stream.calls,
		"the model loop must keep invoking StreamChunk and drain the full LLM stream despite failures "+
			"(this mock has no abandon-latch; broker-side suppression is covered by TestHTTPEventStream_AbandonsAfterWriteFailure)")
	assert.Equal(t, "hello", extractAssistantText(res.Messages),
		"the accumulated response must still be delivered")
}

type failingWriteCloser struct {
	closed bool
}

func (f *failingWriteCloser) Write(_ []byte) (int, error) {
	return 0, errors.New("io: read/write on closed pipe")
}

func (f *failingWriteCloser) Close() error {
	f.closed = true
	return nil
}

func TestHTTPEventStream_AbandonsAfterWriteFailure(t *testing.T) {
	var requests int32
	broker := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&requests, 1)
		w.WriteHeader(http.StatusOK)
	}))
	defer broker.Close()

	stream := &HTTPEventStream{
		baseURL:   broker.URL,
		queryName: "test-query",
		client:    &http.Client{Timeout: 5 * time.Second},
	}
	fw := &failingWriteCloser{}
	stream.streamWriter = fw

	err := stream.StreamChunk(context.Background(), map[string]string{"delta": "hi"})
	require.Error(t, err, "the first failing write should surface an error")
	assert.True(t, stream.streamAbandoned, "the stream must latch abandoned after a write failure")
	assert.True(t, fw.closed, "the failed writer must be closed")

	// Later chunks are no-ops: no reopen, no broker request.
	err = stream.StreamChunk(context.Background(), map[string]string{"delta": "more"})
	require.NoError(t, err, "an abandoned stream must not error on later chunks")
	assert.Zero(t, atomic.LoadInt32(&requests), "an abandoned stream must not reopen the connection")
}

// Even after the chunk stream is abandoned, NotifyCompletion must still POST the
// completion signal: it is a separate request (not over the broken pipe) and is
// the only thing that terminates the broker's SSE stream. Skipping it hangs any
// consumer that already received a chunk.
func TestHTTPEventStream_NotifyCompletionSendsCompletionWhenAbandoned(t *testing.T) {
	var completeRequests int32
	broker := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/complete") {
			atomic.AddInt32(&completeRequests, 1)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer broker.Close()

	stream := &HTTPEventStream{
		baseURL:         broker.URL,
		queryName:       "test-query",
		client:          &http.Client{Timeout: 5 * time.Second},
		streamAbandoned: true,
	}

	err := stream.NotifyCompletion(context.Background())
	require.NoError(t, err)
	assert.Equal(t, int32(1), atomic.LoadInt32(&completeRequests),
		"an abandoned stream must still POST completion so the consumer's stream terminates")
}
