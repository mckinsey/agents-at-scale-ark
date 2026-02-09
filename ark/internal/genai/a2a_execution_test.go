package genai

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

type fakeEventStream struct {
	chunks []interface{}
}

func (f *fakeEventStream) StreamChunk(_ context.Context, chunk interface{}) error {
	f.chunks = append(f.chunks, chunk)
	return nil
}

func (f *fakeEventStream) NotifyCompletion(_ context.Context) error {
	return nil
}

func (f *fakeEventStream) Close() error {
	return nil
}

func TestStreamA2AEventNative(t *testing.T) {
	ctx := context.Background()
	stream := &fakeEventStream{}
	payload := &protocol.Message{
		Kind: protocol.KindMessage,
		Role: protocol.MessageRoleAgent,
		Parts: []protocol.Part{
			protocol.TextPart{Kind: protocol.KindText, Text: "hello"},
		},
	}

	streamA2AEvent(ctx, stream, a2aPayloadModeNative, "agent/test", "completion-1", "hello", payload)

	assert.Len(t, stream.chunks, 1)
	assert.Equal(t, payload, stream.chunks[0])
}

func TestStreamA2AErrorNative(t *testing.T) {
	ctx := context.Background()
	stream := &fakeEventStream{}

	streamA2AError(ctx, stream, a2aPayloadModeNative, "agent/test", errors.New("boom"))

	assert.Len(t, stream.chunks, 1)
	message, ok := stream.chunks[0].(*protocol.Message)
	assert.True(t, ok)
	assert.Equal(t, protocol.KindMessage, message.Kind)
	assert.Equal(t, protocol.MessageRoleAgent, message.Role)
	assert.Equal(t, "boom", extractTextFromParts(message.Parts))
}
