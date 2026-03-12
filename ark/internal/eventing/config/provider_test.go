package config

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewProviderWithClientNil(t *testing.T) {
	p := NewProviderWithClient(context.Background(), nil)

	assert.NotNil(t, p.ModelRecorder())
	assert.NotNil(t, p.A2aRecorder())
	assert.NotNil(t, p.AgentRecorder())
	assert.NotNil(t, p.TeamRecorder())
	assert.NotNil(t, p.ExecutionEngineRecorder())
	assert.NotNil(t, p.MCPServerRecorder())
	assert.NotNil(t, p.QueryRecorder())
	assert.NotNil(t, p.ToolRecorder())
	assert.NotNil(t, p.MemoryRecorder())
}
