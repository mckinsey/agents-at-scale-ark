package completions

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkmcp "mckinsey.com/ark/internal/mcp"
)

const (
	testConnectTimeout  = 5 * time.Second
	testToolCallTimeout = 200 * time.Millisecond
	testCallSlack       = 30 * time.Second

	testToolGreet = "greet"
	testToolSlow  = "slow"
)

type greetParams struct {
	Name string `json:"name"`
}

func newTestMCPServer(t *testing.T) string {
	t.Helper()

	release := make(chan struct{})
	server := mcpsdk.NewServer(&mcpsdk.Implementation{Name: "greeter", Version: "v0.0.1"}, nil)

	mcpsdk.AddTool(server, &mcpsdk.Tool{Name: testToolGreet, Description: "say hi"},
		func(ctx context.Context, req *mcpsdk.CallToolRequest, args greetParams) (*mcpsdk.CallToolResult, any, error) {
			return &mcpsdk.CallToolResult{
				Content: []mcpsdk.Content{&mcpsdk.TextContent{Text: "Hi " + args.Name}},
			}, nil, nil
		})

	mcpsdk.AddTool(server, &mcpsdk.Tool{Name: testToolSlow, Description: "blocks until released"},
		func(ctx context.Context, req *mcpsdk.CallToolRequest, args greetParams) (*mcpsdk.CallToolResult, any, error) {
			select {
			case <-release:
				return &mcpsdk.CallToolResult{
					Content: []mcpsdk.Content{&mcpsdk.TextContent{Text: "finally"}},
				}, nil, nil
			case <-ctx.Done():
				return nil, nil, ctx.Err()
			}
		})

	httpServer := httptest.NewServer(mcpsdk.NewStreamableHTTPHandler(
		func(*http.Request) *mcpsdk.Server { return server }, nil,
	))

	t.Cleanup(func() {
		close(release)
		httpServer.Close()
	})

	return httpServer.URL
}

func newTestMCPClient(t *testing.T, toolCallTimeout time.Duration) *arkmcp.MCPClient {
	t.Helper()

	mcpClient, err := arkmcp.NewMCPClient(t.Context(), newTestMCPServer(t), nil, "http", testConnectTimeout,
		arkmcp.MCPSettings{}, arkmcp.WithToolCallTimeout(toolCallTimeout))
	require.NoError(t, err)
	t.Cleanup(func() { _ = mcpClient.Client.Close() })

	return mcpClient
}

func greetCall() ToolCall {
	call := ToolCall{ID: "call-1"}
	call.Function.Name = testToolGreet
	call.Function.Arguments = `{"name":"ark"}`
	return call
}

func TestMCPExecutorNilClient(t *testing.T) {
	executor := &MCPExecutor{ToolName: testToolGreet}

	result, err := executor.Execute(t.Context(), greetCall())

	require.ErrorContains(t, err, "MCP client not initialized for tool greet")
	require.Empty(t, result.Content)
}

func TestMCPExecutorNilSession(t *testing.T) {
	executor := &MCPExecutor{MCPClient: &arkmcp.MCPClient{}, ToolName: testToolGreet}

	result, err := executor.Execute(t.Context(), greetCall())

	require.ErrorContains(t, err, "MCP client connection not initialized for tool greet")
	require.Empty(t, result.Content)
}

func TestMCPExecutorSucceedsWithinToolCallTimeout(t *testing.T) {
	executor := &MCPExecutor{
		MCPClient: newTestMCPClient(t, testConnectTimeout),
		ToolName:  testToolGreet,
	}

	result, err := executor.Execute(t.Context(), greetCall())

	require.NoError(t, err)
	require.Equal(t, "Hi ark", result.Content)
	require.Empty(t, result.Error)
}

func TestMCPExecutorBoundsToolCallByToolCallTimeout(t *testing.T) {
	executor := &MCPExecutor{
		MCPClient: newTestMCPClient(t, testToolCallTimeout),
		ToolName:  testToolSlow,
	}

	call := greetCall()
	call.Function.Name = testToolSlow

	start := time.Now()
	result, err := executor.Execute(t.Context(), call)
	elapsed := time.Since(start)

	require.Error(t, err)
	require.ErrorIs(t, err, arkmcp.ErrToolCallTimeout)
	require.ErrorIs(t, err, context.DeadlineExceeded)
	require.ErrorContains(t, err, `tool "slow"`)
	require.ErrorContains(t, err, testToolCallTimeout.String())
	require.Less(t, elapsed, testCallSlack, "the call must be bounded, not left hanging")
	require.Empty(t, result.Content)
	require.Equal(t, err.Error(), result.Error, "the timeout must reach the tool message, not surface as a blank result")
}

func TestMCPExecutorSessionSurvivesToolCallTimeout(t *testing.T) {
	mcpClient := newTestMCPClient(t, testToolCallTimeout)

	slow := &MCPExecutor{MCPClient: mcpClient, ToolName: testToolSlow}
	slowCall := greetCall()
	slowCall.Function.Name = testToolSlow

	_, err := slow.Execute(t.Context(), slowCall)
	require.ErrorIs(t, err, arkmcp.ErrToolCallTimeout)

	fast := &MCPExecutor{MCPClient: mcpClient, ToolName: testToolGreet}
	result, err := fast.Execute(t.Context(), greetCall())
	require.NoError(t, err, "a per-call deadline must not damage the shared session")
	require.Equal(t, "Hi ark", result.Content)

	tools, err := mcpClient.ListTools(t.Context())
	require.NoError(t, err)
	require.NotEmpty(t, tools)
}

func TestMCPExecutorWithoutToolCallTimeoutInheritsContext(t *testing.T) {
	executor := &MCPExecutor{MCPClient: newTestMCPClient(t, 0), ToolName: testToolSlow}

	ctx, cancel := context.WithTimeout(t.Context(), testToolCallTimeout)
	defer cancel()

	call := greetCall()
	call.Function.Name = testToolSlow

	result, err := executor.Execute(ctx, call)

	require.ErrorIs(t, err, context.DeadlineExceeded)
	require.NotErrorIs(t, err, arkmcp.ErrToolCallTimeout,
		"a query budget expiry must not be reported as a per-server toolCallTimeout")
	require.Empty(t, result.Error)
}

func TestCreateMCPExecutorResolvesToolCallTimeout(t *testing.T) {
	tests := []struct {
		name            string
		toolCallTimeout string
	}{
		{name: "valid duration", toolCallTimeout: "90s"},
		{name: "unset inherits the query budget", toolCallTimeout: ""},
		{name: "unparseable value falls back without failing registration", toolCallTimeout: "banana"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			serverURL := newTestMCPServer(t)

			mcpServer := &arkv1alpha1.MCPServer{
				ObjectMeta: metav1.ObjectMeta{Name: "test-server", Namespace: "default"},
				Spec: arkv1alpha1.MCPServerSpec{
					Address:         arkv1alpha1.ValueSource{Value: serverURL},
					Transport:       "http",
					Timeout:         "5s",
					ToolCallTimeout: tt.toolCallTimeout,
				},
			}
			tool := &arkv1alpha1.Tool{
				ObjectMeta: metav1.ObjectMeta{Name: "test-tool", Namespace: "default"},
				Spec: arkv1alpha1.ToolSpec{
					Type: "mcp",
					MCP: &arkv1alpha1.MCPToolRef{
						MCPServerRef: arkv1alpha1.MCPServerRef{Name: "test-server", Namespace: "default"},
						ToolName:     testToolGreet,
					},
				},
			}

			k8sClient := setupTestClientForTools([]client.Object{mcpServer, tool})
			pool := arkmcp.NewMCPClientPool()
			t.Cleanup(func() { _ = pool.Close() })

			executor, err := createMCPExecutor(t.Context(), k8sClient, tool, "default", pool, nil)
			require.NoError(t, err, "an invalid toolCallTimeout must not fail tool registration")

			mcpExecutor, ok := executor.(*MCPExecutor)
			require.True(t, ok)
			require.NotNil(t, mcpExecutor.MCPClient)
		})
	}
}
