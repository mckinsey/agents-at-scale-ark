package completions

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestMCPToolCallRetryConfig(t *testing.T) {
	tests := map[string]struct {
		attempts     string
		budget       string
		wantAttempts int
		wantBudget   time.Duration
	}{
		"defaults":  {"", "", 3, 30 * time.Second},
		"valid":     {"5", "60", 5, 60 * time.Second},
		"garbage":   {"lots", "soon", 3, 30 * time.Second},
		"negative":  {"-1", "-10", 3, 30 * time.Second},
		"zero":      {"0", "0", 3, 30 * time.Second},
		"partially": {"7", "", 7, 30 * time.Second},
	}
	for name, tc := range tests {
		t.Run(name, func(t *testing.T) {
			t.Setenv(mcpMaxAttemptsEnv, tc.attempts)
			t.Setenv(mcpRetryBudgetSecondsEnv, tc.budget)
			cfg := mcpToolCallRetryConfig()
			require.Equal(t, tc.wantAttempts, cfg.MaxAttempts)
			require.Equal(t, tc.wantBudget, cfg.Budget)
		})
	}
}
