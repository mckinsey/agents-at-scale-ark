package mcp

import (
	"testing"

	"github.com/stretchr/testify/assert"
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
