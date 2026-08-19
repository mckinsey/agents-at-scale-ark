package completions

import (
	"os"
	"strconv"
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
	cfg := arkmcp.RetryConfig{
		MaxAttempts: defaultMCPMaxAttempts,
		Budget:      defaultMCPRetryBudgetSecs * time.Second,
	}
	if v, err := strconv.Atoi(os.Getenv(mcpMaxAttemptsEnv)); err == nil && v > 0 {
		cfg.MaxAttempts = v
	}
	if v, err := strconv.Atoi(os.Getenv(mcpRetryBudgetSecondsEnv)); err == nil && v > 0 {
		cfg.Budget = time.Duration(v) * time.Second
	}
	return cfg
}
