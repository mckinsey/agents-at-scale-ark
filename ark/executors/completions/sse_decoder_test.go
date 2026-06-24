/* Copyright 2025. McKinsey & Company */

package completions

import (
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/packages/ssestream"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newSSEStream builds a ChatCompletionChunk stream over the given raw SSE body
// using the keepalive-tolerant decoder, mirroring how openai-go decodes a
// streaming response.
func newSSEStream(body string) *ssestream.Stream[openai.ChatCompletionChunk] {
	registerKeepaliveTolerantSSEDecoder()
	res := &http.Response{
		Header: http.Header{"Content-Type": []string{"text/event-stream"}},
		Body:   io.NopCloser(strings.NewReader(body)),
	}
	return ssestream.NewStream[openai.ChatCompletionChunk](ssestream.NewDecoder(res), nil)
}

func TestKeepaliveTolerantDecoder(t *testing.T) {
	chunk := func(content string) string {
		return `data: {"id":"chunk","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"` + content + `"}}]}`
	}

	tests := []struct {
		name        string
		body        string
		wantContent []string
		wantErr     bool
	}{
		{
			name: "ping keepalive frames interleaved with data",
			// Anthropic emits ": ping" comment frames every ~15s; these must
			// not produce a JSON parse error.
			body: ": ping - 2026-06-17 09:09:52.087033\r\n\r\n" +
				chunk("hello") + "\n\n" +
				": ping - 2026-06-17 09:10:07.087033\r\n\r\n" +
				chunk(" world") + "\n\n" +
				"data: [DONE]\n\n",
			wantContent: []string{"hello", " world"},
		},
		{
			name:        "leading and trailing comment-only frames",
			body:        ": ping\n\n" + chunk("hi") + "\n\n: ping\n\ndata: [DONE]\n\n",
			wantContent: []string{"hi"},
		},
		{
			name:        "no keepalives still decodes",
			body:        chunk("a") + "\n\n" + chunk("b") + "\n\ndata: [DONE]\n\n",
			wantContent: []string{"a", "b"},
		},
		{
			name:    "malformed json in real data frame still errors",
			body:    "data: {not valid json}\n\n",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stream := newSSEStream(tt.body)
			var got []string
			for stream.Next() {
				cur := stream.Current()
				if len(cur.Choices) > 0 {
					got = append(got, cur.Choices[0].Delta.Content)
				}
			}

			if tt.wantErr {
				require.Error(t, stream.Err())
				return
			}

			require.NoError(t, stream.Err())
			assert.Equal(t, tt.wantContent, got)
		})
	}
}
