package mcp

import (
	"context"
	"fmt"
	"sync"
	"time"
)

type MCPClientConfig struct {
	ServerName      string
	ServerNamespace string
	ServerURL       string
	Headers         map[string]string
	Transport       string
	Timeout         time.Duration
}

type MCPClientPool struct {
	mu      sync.RWMutex
	clients map[string]*MCPClient
}

func NewMCPClientPool() *MCPClientPool {
	return &MCPClientPool{
		clients: make(map[string]*MCPClient),
	}
}

func (p *MCPClientPool) GetOrCreateClient(ctx context.Context, cfg MCPClientConfig, mcpSettings map[string]MCPSettings) (*MCPClient, error) {
	key := fmt.Sprintf("%s/%s", cfg.ServerNamespace, cfg.ServerName)

	// Fast path: read lock for checking existence
	p.mu.RLock()
	if mcpClient, exists := p.clients[key]; exists {
		p.mu.RUnlock()
		return mcpClient, nil
	}
	p.mu.RUnlock()

	// Slow path: write lock for creating client
	p.mu.Lock()
	defer p.mu.Unlock()

	// Double-check after acquiring write lock (another goroutine may have created it)
	if mcpClient, exists := p.clients[key]; exists {
		return mcpClient, nil
	}

	mcpSetting := mcpSettings[key]

	mcpClient, err := NewMCPClient(ctx, cfg.ServerURL, cfg.Headers, cfg.Transport, cfg.Timeout, mcpSetting)
	if err != nil {
		return nil, err
	}

	p.clients[key] = mcpClient
	return mcpClient, nil
}

func (p *MCPClientPool) Close() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	var lastErr error
	for key, mcpClient := range p.clients {
		if mcpClient != nil && mcpClient.Client != nil {
			if err := mcpClient.Client.Close(); err != nil {
				lastErr = fmt.Errorf("failed to close MCP client %s: %w", key, err)
			}
		}
		delete(p.clients, key)
	}
	return lastErr
}
