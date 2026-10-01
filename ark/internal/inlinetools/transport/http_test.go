/* Copyright 2025. McKinsey & Company */

package transport

import (
	"context"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCallRequiresLiveHTTPRequestContext(t *testing.T) {
	called := false
	next := requestCancellation(func(context.Context, string, mcp.Request) (mcp.Result, error) {
		called = true
		return nil, nil
	})
	_, err := next(context.Background(), "tools/call", nil)
	require.ErrorContains(t, err, "missing its HTTP request context")
	assert.False(t, called)

	httpCtx, cancel := context.WithCancel(context.Background())
	cancel()
	ctx := context.WithValue(context.Background(), requestContextKey{}, httpCtx)
	_, err = next(ctx, "tools/call", nil)
	require.ErrorIs(t, err, context.Canceled)
	assert.False(t, called, "already-abandoned requests must not dispatch")

	ctx, cancel = context.WithCancel(context.WithValue(context.Background(), requestContextKey{}, context.Background()))
	cancel()
	_, err = next(ctx, "tools/call", nil)
	require.ErrorIs(t, err, context.Canceled)
	assert.False(t, called, "MCP cancellation must be preserved too")

	_, err = next(context.Background(), "ping", nil)
	require.NoError(t, err)
	assert.True(t, called, "discovery does not require call lifecycle state")
}

func TestCallRetainsSDKValuesAndReleasesDerivedContext(t *testing.T) {
	type sdkKey struct{}
	httpCtx, cancelHTTP := context.WithCancel(context.Background())
	defer cancelHTTP()
	ctx := context.WithValue(context.WithValue(context.Background(), requestContextKey{}, httpCtx), sdkKey{}, "sdk-value")
	var retained context.Context
	next := requestCancellation(func(ctx context.Context, _ string, _ mcp.Request) (mcp.Result, error) {
		assert.Equal(t, "sdk-value", ctx.Value(sdkKey{}))
		retained = ctx
		return nil, nil
	})
	_, err := next(ctx, "tools/call", nil)
	require.NoError(t, err)
	require.NotNil(t, retained)
	assert.ErrorIs(t, retained.Err(), context.Canceled)
	assert.NoError(t, httpCtx.Err(), "finishing a call must not cancel its HTTP parent")
}
