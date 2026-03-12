package mcp

import (
	"context"
	"fmt"
	"net/http"
	"testing"
	"time"

	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
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
					transport: "ABC",
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
					port:      "9999",
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
			mcpServerMock := mcpServerMock{}.New(t, tc.mcpServer.connectionOptions)
			var mcpClient *MCPClient

			t.Cleanup(func() {
				if mcpClient != nil && mcpClient.Client != nil {
					_ = mcpClient.Client.Close()
				}

				_ = mcpServerMock.Shutdown(t.Context())
			})

			go func() {
				fmt.Println("Starting MCP server mock...")
				err := mcpServerMock.ListenAndServe(t)
				if err != nil && err != http.ErrServerClosed {
					t.Errorf("Failed to start MCP server mock: %v", err)
				}
			}()

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

				mcpClient = client

				tools, err := client.ListTools(ctx)
				require.NoError(t, err)
				require.Equal(t, "greet", tools[0].Name)
			}
		})
	}
}

type mcpServerMock struct {
	server     *mcpsdk.Server
	httpServer *http.Server
	opts       mcpConnectionOps
}

func (m mcpServerMock) New(t *testing.T, opts mcpConnectionOps) *mcpServerMock {
	mcpServer := mcpsdk.NewServer(&mcpsdk.Implementation{Name: "greeter", Version: "v0.0.1"}, nil)

	mcpsdk.AddTool(mcpServer, &mcpsdk.Tool{Name: "greet", Description: "say hi"}, m.sayHi)

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
		handler = mcpsdk.NewSSEHandler(m.getServerFn(), nil)
	case "http":
		handler = mcpsdk.NewStreamableHTTPHandler(m.getServerFn(), nil)
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

func (m *mcpServerMock) getServerFn() func(request *http.Request) *mcpsdk.Server {
	return func(request *http.Request) *mcpsdk.Server {
		return m.server
	}
}

type sayHiParams struct {
	Name string `json:"name"`
}

func (m *mcpServerMock) sayHi(ctx context.Context, req *mcpsdk.CallToolRequest, args sayHiParams) (*mcpsdk.CallToolResult, any, error) {
	return &mcpsdk.CallToolResult{
		Content: []mcpsdk.Content{
			&mcpsdk.TextContent{Text: "Hi " + args.Name},
		},
	}, nil, nil
}

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

		if ctx.Err() != nil {
			return ctx.Err()
		}

		time.Sleep(100 * time.Millisecond)
	}

	return fmt.Errorf("server at %s did not become ready within %v", url, timeout)
}
