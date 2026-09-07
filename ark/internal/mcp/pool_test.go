package mcp

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMCPClientPool_GetOrCreateClient_ReturnsCachedClient(t *testing.T) {
	cached := &MCPClient{URL: "http://cached"}
	p := &MCPClientPool{
		clients: map[string]*MCPClient{
			"default/my-server": cached,
		},
	}

	got, err := p.GetOrCreateClient(t.Context(), MCPClientConfig{
		ServerNamespace: "default",
		ServerName:      "my-server",
	}, nil)

	assert.NoError(t, err)
	assert.Equal(t, cached, got)
}

func TestMCPClientPool_Close_EmptyPool(t *testing.T) {
	p := NewMCPClientPool()
	assert.NoError(t, p.Close())
}

func TestMCPClientPool_GetOrCreateClient_WritePath_UnsupportedTransport(t *testing.T) {
	p := NewMCPClientPool()

	_, err := p.GetOrCreateClient(t.Context(), MCPClientConfig{
		ServerNamespace: "default",
		ServerName:      "my-server",
		ServerURL:       "http://localhost:9999",
		Transport:       "unsupported-xyz",
	}, nil)

	assert.ErrorContains(t, err, ErrUnsupportedTransport)
	assert.Empty(t, p.clients)
}

func TestMCPClientPool_GetOrCreateClient_PropagatesToolCallTimeout(t *testing.T) {
	server := newFlakyMCPServer(t, 0, 0, "")
	p := NewMCPClientPool()
	t.Cleanup(func() { _ = p.Close() })

	client, err := p.GetOrCreateClient(t.Context(), MCPClientConfig{
		ServerNamespace: "default",
		ServerName:      "my-server",
		ServerURL:       server.URL,
		Transport:       httpTransport,
		Timeout:         5 * time.Second,
		ToolCallTimeout: 90 * time.Second,
	}, nil)

	require.NoError(t, err)
	require.Equal(t, 90*time.Second, client.toolCallTimeout)
}

func TestParseToolCallTimeout(t *testing.T) {
	tests := []struct {
		name     string
		raw      string
		expected time.Duration
		errorMsg string
	}{
		{name: "unset means inherit the caller budget", raw: "", expected: 0},
		{name: "minutes", raw: "5m", expected: 5 * time.Minute},
		{name: "milliseconds", raw: "500ms", expected: 500 * time.Millisecond},
		{name: "compound", raw: "1m30s", expected: 90 * time.Second},
		{name: "unparseable unit", raw: "5min", errorMsg: `invalid toolCallTimeout "5min"`},
		{name: "no unit", raw: "30", errorMsg: `invalid toolCallTimeout "30"`},
		{name: "zero", raw: "0s", errorMsg: "must be positive"},
		{name: "negative", raw: "-1s", errorMsg: "must be positive"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseToolCallTimeout(tt.raw)

			if tt.errorMsg != "" {
				require.ErrorContains(t, err, tt.errorMsg)
				require.Zero(t, got)
				return
			}

			require.NoError(t, err)
			require.Equal(t, tt.expected, got)
		})
	}
}
