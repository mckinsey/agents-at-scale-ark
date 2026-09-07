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
	ToolCallTimeout time.Duration
}

func ParseToolCallTimeout(raw string) (time.Duration, error) {
	if raw == "" {
		return 0, nil
	}

	timeout, err := time.ParseDuration(raw)
	if err != nil {
		return 0, fmt.Errorf("invalid toolCallTimeout %q: %w", raw, err)
	}
	if timeout <= 0 {
		return 0, fmt.Errorf("invalid toolCallTimeout %q: must be positive", raw)
	}

	return timeout, nil
}

type MCPClientPool struct {
	mu      sync.RWMutex
	clients map[string]*MCPClient
	opts    []Option
}

func NewMCPClientPool(opts ...Option) *MCPClientPool {
	return &MCPClientPool{
		clients: make(map[string]*MCPClient),
		opts:    opts,
	}
}

func (p *MCPClientPool) GetOrCreateClient(ctx context.Context, cfg MCPClientConfig, mcpSettings map[string]MCPSettings) (*MCPClient, error) {
	key := fmt.Sprintf("%s/%s", cfg.ServerNamespace, cfg.ServerName)

	p.mu.RLock()
	if mcpClient, exists := p.clients[key]; exists {
		p.mu.RUnlock()
		return mcpClient, nil
	}
	p.mu.RUnlock()

	p.mu.Lock()
	defer p.mu.Unlock()

	if mcpClient, exists := p.clients[key]; exists {
		return mcpClient, nil
	}

	mcpSetting := mcpSettings[key]

	opts := append([]Option{WithServerName(key), WithToolCallTimeout(cfg.ToolCallTimeout)}, p.opts...)
	mcpClient, err := NewMCPClient(ctx, cfg.ServerURL, cfg.Headers, cfg.Transport, cfg.Timeout, mcpSetting, opts...)
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
