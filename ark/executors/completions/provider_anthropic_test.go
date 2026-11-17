package completions

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/runtime"
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

func anthropicRequestBody(t *testing.T, schema *runtime.RawExtension) map[string]any {
	t.Helper()
	var gotBody []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotBody, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"content":[{"type":"text","text":"{\"ok\":true}"}],"id":"msg_mock","model":"claude","stop_reason":"end_turn","usage":{"input_tokens":7,"output_tokens":3}}`))
	}))
	defer srv.Close()

	ap := &AnthropicProvider{Model: "claude", BaseURL: srv.URL, APIKey: "test-anthropic-key"}
	if schema != nil {
		ap.SetOutputSchema(schema, "test-schema")
	}

	_, err := ap.ChatCompletion(context.Background(), []Message{NewUserMessage("Hello")}, 1, nil, ToolChoiceUnset)
	require.NoError(t, err)

	var body map[string]any
	require.NoError(t, json.Unmarshal(gotBody, &body))
	return body
}

func TestAnthropicChatCompletion_SendsOutputSchema(t *testing.T) {
	body := anthropicRequestBody(t, &runtime.RawExtension{Raw: []byte(`{"type":"object","properties":{"ok":{"type":"boolean"},"score":{"type":"number","minimum":0,"maximum":1}},"required":["ok"],"additionalProperties":false}`)})

	require.JSONEq(t,
		`{"format":{"type":"json_schema","schema":{"type":"object","properties":{"ok":{"type":"boolean"},"score":{"type":"number","minimum":0,"maximum":1}},"required":["ok"],"additionalProperties":false}}}`,
		mustJSON(t, body["output_config"]))
}

func TestAnthropicChatCompletion_OmitsOutputConfigWithoutSchema(t *testing.T) {
	body := anthropicRequestBody(t, nil)

	require.NotContains(t, body, "output_config")
}

func mustJSON(t *testing.T, v any) string {
	t.Helper()
	b, err := json.Marshal(v)
	require.NoError(t, err)
	return string(b)
}
