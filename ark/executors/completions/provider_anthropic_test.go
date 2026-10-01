package completions

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"mckinsey.com/ark/internal/common"
)

func TestGetAnthropicBackstop_Default(t *testing.T) {
	assert.Equal(t, defaultAnthropicBackstopSeconds*time.Second, getAnthropicBackstop())
}

func TestGetAnthropicBackstop_EnvOverride(t *testing.T) {
	t.Setenv("ARK_ANTHROPIC_HTTP_BACKSTOP_SECONDS", "120")
	assert.Equal(t, 120*time.Second, getAnthropicBackstop())
}

func TestGetAnthropicBackstop_InvalidEnvFallsBackToDefault(t *testing.T) {
	for _, v := range []string{"0", "-5", "notanumber"} {
		t.Setenv("ARK_ANTHROPIC_HTTP_BACKSTOP_SECONDS", v)
		assert.Equal(t, defaultAnthropicBackstopSeconds*time.Second, getAnthropicBackstop())
	}
}

func TestAnthropicHTTPClientHasNoTotalTimeout(t *testing.T) {
	require.Zero(t, anthropicHTTPClient.Timeout,
		"a total http.Client.Timeout would cap a caller that asked for longer via its context deadline")
	require.IsType(t, &common.BackstopTransport{}, anthropicHTTPClient.Transport,
		"the backstop must be applied per-request so it only covers deadline-less callers")
}
