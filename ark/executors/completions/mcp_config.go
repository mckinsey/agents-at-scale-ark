package completions

import (
	"time"

	arkmcp "mckinsey.com/ark/internal/mcp"
)

const (
	mcpMaxAttemptsEnv         = "ARK_MCP_TOOL_CALL_MAX_ATTEMPTS"
	mcpRetryBudgetSecondsEnv  = "ARK_MCP_TOOL_CALL_RETRY_BUDGET_SECONDS"
	defaultMCPMaxAttempts     = 3
	defaultMCPRetryBudgetSecs = 30
)

func mcpToolCallRetryConfig() arkmcp.RetryConfig {
	return arkmcp.RetryConfig{
		MaxAttempts: envInt(mcpMaxAttemptsEnv, defaultMCPMaxAttempts),
		Budget:      time.Duration(envInt(mcpRetryBudgetSecondsEnv, defaultMCPRetryBudgetSecs)) * time.Second,
	}
}
