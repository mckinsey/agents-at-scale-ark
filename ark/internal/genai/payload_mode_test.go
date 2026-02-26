package genai

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestResolvePayloadModeAlwaysNative(t *testing.T) {
	assert.Equal(t, A2APayloadModeNative, ResolvePayloadMode())
}

func TestResolveDelegationPayloadModeContext(t *testing.T) {
	ctx := WithA2APayloadMode(context.Background(), A2APayloadModeNative)
	mode := ResolveDelegationPayloadMode(ctx)
	assert.Equal(t, A2APayloadModeNative, mode)
}

func TestResolveDelegationPayloadModeDefaultsNative(t *testing.T) {
	ctx := context.Background()
	mode := ResolveDelegationPayloadMode(ctx)
	assert.Equal(t, A2APayloadModeNative, mode)
}
