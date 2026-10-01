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

type stubRoundTripper struct {
	contentType string
}

func (s *stubRoundTripper) RoundTrip(*http.Request) (*http.Response, error) {
	header := http.Header{}
	if s.contentType != "" {
		header.Set("Content-Type", s.contentType)
	}
	return &http.Response{StatusCode: http.StatusOK, Header: header, Body: io.NopCloser(strings.NewReader(""))}, nil
}

func TestSSEContentTypeNormalizer(t *testing.T) {
	tests := []struct {
		name     string
		incoming string
		want     string
	}{
		{"bare event-stream untouched", "text/event-stream", "text/event-stream"},
		{"lowercase charset canonicalized", "text/event-stream; charset=utf-8", "text/event-stream"},
		{"uppercase charset canonicalized", "text/event-stream; charset=UTF-8", "text/event-stream"},
		{"uppercase media type canonicalized", "Text/Event-Stream", "text/event-stream"},
		{"non-sse left untouched", "application/json", "application/json"},
		{"empty left untouched", "", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			normalizer := &sseContentTypeNormalizer{base: &stubRoundTripper{contentType: tt.incoming}}
			req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, "http://example.invalid", nil)
			require.NoError(t, err)

			resp, err := normalizer.RoundTrip(req)
			require.NoError(t, err)
			defer func() { _ = resp.Body.Close() }()

			assert.Equal(t, tt.want, resp.Header.Get("Content-Type"))
		})
	}
}

func TestSSEContentTypeNormalizerRestoresTolerantDecoder(t *testing.T) {
	normalizer := &sseContentTypeNormalizer{base: &stubRoundTripper{contentType: "text/event-stream; charset=UTF-8"}}
	req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, "http://example.invalid", nil)
	require.NoError(t, err)

	resp, err := normalizer.RoundTrip(req)
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())

	resp.Body = io.NopCloser(strings.NewReader(": ping\n\ndata: [DONE]\n\n"))
	decoder := ssestream.NewDecoder(resp)
	_, ok := decoder.(*keepaliveTolerantDecoder)
	assert.True(t, ok, "after normalization openai-go must select the keepalive-tolerant decoder")
}
