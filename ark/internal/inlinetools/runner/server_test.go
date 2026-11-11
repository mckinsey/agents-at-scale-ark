/* Copyright 2025. McKinsey & Company */

package runner

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestConfigFromEnvRequiresIdentityAndRevision(t *testing.T) {
	t.Setenv(EnvToolName, "")
	t.Setenv(EnvLanguage, "")
	t.Setenv(EnvSourceHash, "")

	_, err := ConfigFromEnv()
	assert.ErrorContains(t, err, "is required")

	t.Setenv(EnvToolName, "csv-summarise")
	t.Setenv(EnvLanguage, arkv1alpha1.InlineLanguageBash)
	t.Setenv(EnvSourceHash, SourceHash("echo hi"))

	cfg, err := ConfigFromEnv()
	require.NoError(t, err)
	assert.Equal(t, "csv-summarise", cfg.ToolName)
	assert.Equal(t, DefaultAddr, cfg.Addr)
}

func TestLoadRejectsAMismatchedRevision(t *testing.T) {
	dir := sourceDir(t, "echo new")

	_, err := Load(Config{
		Language:   arkv1alpha1.InlineLanguageBash,
		SourceHash: SourceHash("echo old"),
	})

	require.Error(t, err)
	assert.Contains(t, err.Error(), "refusing to execute a mismatched revision")
	assert.Contains(t, err.Error(), dir)
}

func TestLoadAcceptsTheCurrentRevision(t *testing.T) {
	dir := sourceDir(t, "echo hi")

	script, err := Load(Config{
		Language:   arkv1alpha1.InlineLanguageBash,
		SourceHash: SourceHash("echo hi"),
	})

	require.NoError(t, err)
	assert.Equal(t, filepath.Join(dir, "source.sh"), script.Path)
	assert.Contains(t, script.Interpreter, "bash")
}

func TestLoadReportsAMissingSnapshot(t *testing.T) {
	SourceDir = t.TempDir()
	t.Cleanup(func() { SourceDir = "/tool" })

	_, err := Load(Config{Language: arkv1alpha1.InlineLanguageBash, SourceHash: "abc"})

	assert.ErrorContains(t, err, "failed to read mounted source")
}

// sourceDir points the fixed mount path at a temporary directory holding source.
func sourceDir(t *testing.T, source string) string {
	t.Helper()
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "source.sh"), []byte(source), 0o600))
	SourceDir = dir
	t.Cleanup(func() { SourceDir = "/tool" })
	return dir
}

var testConfig = Config{ToolName: "echo-args", Language: arkv1alpha1.InlineLanguageBash, SourceHash: SourceHash("current")}

func testHandler(t *testing.T, body string) http.Handler {
	t.Helper()
	return Handler(testConfig, script(t, body))
}

type revisionHeader struct{ revision string }

func (h revisionHeader) RoundTrip(r *http.Request) (*http.Response, error) {
	r = r.Clone(r.Context())
	r.Header.Set(RevisionHeader, h.revision)
	return http.DefaultTransport.RoundTrip(r)
}

func rawCall(t *testing.T, url, revision string) (int, string) {
	t.Helper()
	body := fmt.Sprintf(`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":%q,"arguments":{}}}`, testConfig.ToolName)
	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, url+MCPPath, strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	if revision != "" {
		req.Header.Set(RevisionHeader, revision)
	}
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	return resp.StatusCode, resp.Header.Get(RevisionHeader)
}

func TestMCPRefusesACallerExpectingAnotherRevision(t *testing.T) {
	marker := filepath.Join(t.TempDir(), "ran")
	server := httptest.NewServer(testHandler(t, fmt.Sprintf(`touch %q`, marker)))
	defer server.Close()

	for _, revision := range []string{"", Revision(arkv1alpha1.InlineLanguageBash, "previous"), Revision(arkv1alpha1.InlineLanguagePython, "current")} {
		status, served := rawCall(t, server.URL, revision)

		assert.Equal(t, http.StatusConflict, status, "caller revision %q", revision)
		assert.Equal(t, testConfig.Revision(), served)
	}
	assert.NoFileExists(t, marker, "a refused call must not run the script")
}

func TestMCPServesACallerExpectingThisRevision(t *testing.T) {
	server := httptest.NewServer(testHandler(t, `printf 'ok'`))
	defer server.Close()

	status, _ := rawCall(t, server.URL, Revision(arkv1alpha1.InlineLanguageBash, "current"))

	assert.Equal(t, http.StatusOK, status)
}

func TestReadinessProbeServesOnceLoaded(t *testing.T) {
	recorder := httptest.NewRecorder()
	testHandler(t, `printf 'x'`).ServeHTTP(recorder, httptest.NewRequestWithContext(context.Background(), http.MethodGet, ReadyPath, nil))

	assert.Equal(t, http.StatusOK, recorder.Code)
}

func TestToolCallRunsTheScript(t *testing.T) {
	server := httptest.NewServer(testHandler(t, `printf '%s' "$1"`))
	defer server.Close()

	result := callTool(t, server.URL, map[string]any{"v": "value"})

	require.False(t, result.IsError, resultText(result))
	assert.JSONEq(t, `{"v":"value"}`, resultText(result))
}

func TestHTTPCallCancellationStopsTheRunningScript(t *testing.T) {
	pidPath := filepath.Join(t.TempDir(), "pid")
	running := script(t, fmt.Sprintf(`printf '%%s' "$$" > %q; sleep 5`, pidPath))
	server := httptest.NewServer(Handler(testConfig, running))
	defer server.Close()
	session := connect(t, server.URL)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() {
		_, err := session.CallTool(ctx, &mcp.CallToolParams{Name: testConfig.ToolName, Arguments: map[string]any{}})
		done <- err
	}()
	var pid int
	require.Eventually(t, func() bool {
		contents, err := os.ReadFile(pidPath)
		if err != nil {
			return false
		}
		pid, err = strconv.Atoi(string(contents))
		return err == nil
	}, time.Second, time.Millisecond)
	cancel()
	select {
	case err := <-done:
		require.Error(t, err)
	case <-time.After(time.Second):
		t.Fatal("canceled MCP call did not return")
	}
	require.Eventually(t, func() bool { return syscall.Kill(pid, 0) == syscall.ESRCH }, time.Second, time.Millisecond,
		"HTTP cancellation must kill the script, not wait for its execution timeout")
}

func TestToolCallReportsScriptErrorsAsIsError(t *testing.T) {
	server := httptest.NewServer(testHandler(t, `printf 'boom' >&2; exit 2`))
	defer server.Close()

	result := callTool(t, server.URL, map[string]any{})

	require.True(t, result.IsError)
	assert.Contains(t, resultText(result), "exit status 2")
}

func TestDiscoveryListsOnlyTheToolName(t *testing.T) {
	server := httptest.NewServer(testHandler(t, `printf 'secret source'`))
	defer server.Close()

	session := connect(t, server.URL)
	tools, err := session.ListTools(context.Background(), nil)
	require.NoError(t, err)

	require.Len(t, tools.Tools, 1)
	assert.Equal(t, testConfig.ToolName, tools.Tools[0].Name)
	listing, err := json.Marshal(tools)
	require.NoError(t, err)
	assert.NotContains(t, string(listing), "secret source")
}

func TestOversizedBodyIsRejectedBeforeDecoding(t *testing.T) {
	server := httptest.NewServer(testHandler(t, `printf 'ran'`))
	defer server.Close()

	body := `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"echo-args","arguments":{"v":"` +
		strings.Repeat("x", MaxRequestBytes) + `"}}}`
	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, server.URL+MCPPath, strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	req.Header.Set(RevisionHeader, testConfig.Revision())

	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	assert.NotEqual(t, http.StatusOK, resp.StatusCode)
}

func connect(t *testing.T, url string) *mcp.ClientSession {
	t.Helper()
	client := mcp.NewClient(&mcp.Implementation{Name: "test", Version: "v1"}, nil)
	session, err := client.Connect(context.Background(), &mcp.StreamableClientTransport{
		Endpoint: url + MCPPath, HTTPClient: &http.Client{Transport: revisionHeader{testConfig.Revision()}},
	}, nil)
	require.NoError(t, err)
	t.Cleanup(func() { _ = session.Close() })
	return session
}

func callTool(t *testing.T, url string, arguments map[string]any) *mcp.CallToolResult {
	t.Helper()
	session := connect(t, url)
	result, err := session.CallTool(context.Background(), &mcp.CallToolParams{Name: testConfig.ToolName, Arguments: arguments})
	require.NoError(t, err)
	return result
}

func resultText(result *mcp.CallToolResult) string {
	var parts []string
	for _, content := range result.Content {
		if text, ok := content.(*mcp.TextContent); ok {
			parts = append(parts, text.Text)
		}
	}
	return strings.Join(parts, "")
}
