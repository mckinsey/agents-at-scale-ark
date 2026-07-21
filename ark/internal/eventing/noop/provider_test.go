package noop

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNewProviderRecorders(t *testing.T) {
	p := NewProvider()

	require.NotNil(t, p.ExecutionEngineRecorder())
	require.NotNil(t, p.ModelRecorder())
	require.NotNil(t, p.AgentRecorder())
	require.NotNil(t, p.TeamRecorder())
	require.NotNil(t, p.ToolRecorder())
	require.NotNil(t, p.MCPServerRecorder())
	require.NotNil(t, p.QueryRecorder())

	// A2a and Memory recorders are intentionally nil in the noop provider;
	// call them to keep the accessors covered.
	_ = p.A2aRecorder()
	_ = p.MemoryRecorder()
}
