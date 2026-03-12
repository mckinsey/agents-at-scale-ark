package mcp

import (
	"context"
	"fmt"
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
	clients map[string]*MCPClient
}

func NewMCPClientPool() *MCPClientPool {
	return &MCPClientPool{
		clients: make(map[string]*MCPClient),
	}
}

func (p *MCPClientPool) GetOrCreateClient(ctx context.Context, cfg MCPClientConfig, mcpSettings map[string]MCPSettings) (*MCPClient, error) {
	key := fmt.Sprintf("%s/%s", cfg.ServerNamespace, cfg.ServerName)
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
