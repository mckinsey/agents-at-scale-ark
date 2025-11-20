package genai

import (
	"context"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/stretchr/testify/require"
)

type mcpConnectionOps struct {
	host      string
	port      string
	transport string
}
type testOptions struct {
	mcpServer struct {
		connectionOptions mcpConnectionOps
	}
	mcpClient struct {
		connectionOptions mcpConnectionOps
	}
	expectedError string
}

func TestNewMCPClient(t *testing.T) {
	testCases := map[string]testOptions{
		"Throws error creating MCPClient for unsupported ABC transport": {
			mcpServer: struct{ connectionOptions mcpConnectionOps }{
				connectionOptions: mcpConnectionOps{
					host:      "localhost",
					port:      "8888",
					transport: "http",
				},
			},
			mcpClient: struct{ connectionOptions mcpConnectionOps }{
				connectionOptions: mcpConnectionOps{
					host:      "localhost",
					port:      "8888",
					transport: "ABC", // NOTE: Unsupported transport to force error
				},
			},
			expectedError: ErrUnsupportedTransport,
		},
		"Throws error when failing connection retry": {
			mcpServer: struct{ connectionOptions mcpConnectionOps }{
				connectionOptions: mcpConnectionOps{
					host:      "localhost",
					port:      "8888",
					transport: "http",
				},
			},
			mcpClient: struct{ connectionOptions mcpConnectionOps }{
				connectionOptions: mcpConnectionOps{
					host:      "localhost",
					port:      "9999", // NOTE: Wrong port to force connection failure
					transport: "http",
				},
			},
			expectedError: ErrConnectionRetryFailed,
		},
		"Creates MCPClient over HTTP transport": {
			mcpServer: struct{ connectionOptions mcpConnectionOps }{
				connectionOptions: mcpConnectionOps{
					host:      "localhost",
					port:      "8888",
					transport: "http",
				},
			},
			mcpClient: struct{ connectionOptions mcpConnectionOps }{
				connectionOptions: mcpConnectionOps{
					host:      "localhost",
					port:      "8888",
					transport: "http",
				},
			},
		},
		"Creates MCPClient over SSE transport": {
			mcpServer: struct{ connectionOptions mcpConnectionOps }{
				connectionOptions: mcpConnectionOps{
					host:      "localhost",
					port:      "8888",
					transport: "sse",
				},
			},
			mcpClient: struct{ connectionOptions mcpConnectionOps }{
				connectionOptions: mcpConnectionOps{
					host:      "localhost",
					port:      "8888",
					transport: "sse",
				},
			},
		},
	}

	for testName, tc := range testCases {
		t.Run(testName, func(t *testing.T) {
			// Store server and client for cleanup
			mcpServerMock := mcpServerMock{}.New(t, tc.mcpServer.connectionOptions)
			var mcpClient *MCPClient

			t.Cleanup(func() {
				// Release connections when test completes
				if mcpClient != nil && mcpClient.client != nil {
					_ = mcpClient.client.Close()
				}

				// And shut down server
				_ = mcpServerMock.Shutdown(t.Context())
			})

			// Start server in a goroutine since ListenAndServe blocks
			go func() {
				fmt.Println("Starting MCP server mock...")
				err := mcpServerMock.ListenAndServe(t)
				if err != nil && err != http.ErrServerClosed {
					t.Errorf("Failed to start MCP server mock: %v", err)
				}
			}()

			// Wait for the server to start
			ctx := t.Context()
			serverURL := fmt.Sprintf("http://%s:%s", tc.mcpServer.connectionOptions.host, tc.mcpServer.connectionOptions.port)
			require.NoError(t, waitForServer(t, ctx, serverURL, 5*time.Second))
			client, err := NewMCPClient(
				ctx,
				fmt.Sprintf("http://%s:%s", tc.mcpClient.connectionOptions.host, tc.mcpClient.connectionOptions.port),
				nil,
				tc.mcpClient.connectionOptions.transport,
				1*time.Second,
				MCPSettings{},
			)
			if tc.expectedError != "" {
				require.ErrorContains(t, err, tc.expectedError)
				require.Nil(t, client)
			} else {
				require.NoError(t, err)
				require.NotNil(t, client)

				// Store client for cleanup
				mcpClient = client

				tools, err := client.ListTools(ctx)
				require.NoError(t, err)
				require.Equal(t, "greet", tools[0].Name)
			}
		})
	}
}

type mcpServerMock struct {
	server     *mcp.Server
	httpServer *http.Server
	opts       mcpConnectionOps
}

func (m mcpServerMock) New(t *testing.T, opts mcpConnectionOps) *mcpServerMock {
	mcpServer := mcp.NewServer(&mcp.Implementation{Name: "greeter", Version: "v0.0.1"}, nil)

	mcp.AddTool(mcpServer, &mcp.Tool{Name: "greet", Description: "say hi"}, m.sayHi)

	return &mcpServerMock{
		server: mcpServer,
		opts:   opts,
	}
}

func (m *mcpServerMock) ListenAndServe(t *testing.T) error {
	t.Helper()

	var handler http.Handler
	switch m.opts.transport {
	case "sse":
		handler = mcp.NewSSEHandler(m.getServerFn(), nil)
	case "http":
		handler = mcp.NewStreamableHTTPHandler(m.getServerFn(), nil)
	default:
		panic("unsupported transport")
	}

	m.httpServer = &http.Server{
		Addr:    fmt.Sprintf("%s:%s", m.opts.host, m.opts.port),
		Handler: handler,
	}
	return m.httpServer.ListenAndServe()
}

func (m *mcpServerMock) Shutdown(ctx context.Context) error {
	if m.httpServer != nil {
		return m.httpServer.Shutdown(ctx)
	}
	return nil
}

func (m *mcpServerMock) getServerFn() func(request *http.Request) *mcp.Server {
	return func(request *http.Request) *mcp.Server {
		return m.server
	}
}

type sayHiParams struct {
	Name string `json:"name"`
}

func (m *mcpServerMock) sayHi(ctx context.Context, req *mcp.CallToolRequest, args sayHiParams) (*mcp.CallToolResult, any, error) {
	return &mcp.CallToolResult{
		Content: []mcp.Content{
			&mcp.TextContent{Text: "Hi " + args.Name},
		},
	}, nil, nil
}

// waitForServer polls the server URL until it responds or timeout is reached
func waitForServer(t *testing.T, ctx context.Context, url string, timeout time.Duration) error {
	t.Helper()

	client := &http.Client{Timeout: 100 * time.Millisecond}
	deadline := time.Now().Add(timeout)
	startTime := time.Now()

	for time.Now().Before(deadline) {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return fmt.Errorf("failed to create request: %w", err)
		}

		resp, err := client.Do(req)
		if err == nil {
			if err = resp.Body.Close(); err != nil {
				return fmt.Errorf("failed to close response body: %w", err)
			}

			t.Logf("server became ready in %v", time.Since(startTime))
			return nil
		}

		// Check if context was cancelled
		if ctx.Err() != nil {
			return ctx.Err()
		}

		time.Sleep(100 * time.Millisecond)
	}

	return fmt.Errorf("server at %s did not become ready within %v", url, timeout)
}
