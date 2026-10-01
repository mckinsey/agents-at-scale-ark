/* Copyright 2025. McKinsey & Company */

package runner

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"mckinsey.com/ark/internal/inlinetools/transport"
)

// Environment the controller sets on the runner container. The script itself
// gets none of it; see childEnv.
const (
	EnvToolName   = "ARK_INLINE_TOOL_NAME"
	EnvLanguage   = "ARK_INLINE_LANGUAGE"
	EnvSourceHash = "ARK_INLINE_SOURCE_HASH"
	EnvListenAddr = "ARK_INLINE_LISTEN_ADDR"
)

// Paths the Service and the probes use.
const (
	MCPPath     = "/mcp"
	ReadyPath   = "/readyz"
	DefaultAddr = ":8080"
	PortName    = "http"
	Port        = 8080
)

// Config is the runner's whole configuration, all of it from the controller.
type Config struct {
	ToolName   string
	Language   string
	SourceHash string
	Addr       string
}

func ConfigFromEnv() (Config, error) {
	cfg := Config{
		ToolName:   os.Getenv(EnvToolName),
		Language:   os.Getenv(EnvLanguage),
		SourceHash: os.Getenv(EnvSourceHash),
		Addr:       os.Getenv(EnvListenAddr),
	}
	if cfg.Addr == "" {
		cfg.Addr = DefaultAddr
	}
	for name, value := range map[string]string{
		EnvToolName:   cfg.ToolName,
		EnvLanguage:   cfg.Language,
		EnvSourceHash: cfg.SourceHash,
	} {
		if value == "" {
			return Config{}, fmt.Errorf("%s is required", name)
		}
	}
	return cfg, nil
}

// SourceHash is the revision identity of a script, shared by the controller
// (which stamps it on the pod template) and the runner (which verifies it).
func SourceHash(source string) string {
	sum := sha256.Sum256([]byte(source))
	return hex.EncodeToString(sum[:])
}

// Load resolves the interpreter and verifies the mounted snapshot against the
// revision the controller expects. A subPath ConfigMap mount is never updated
// in place, so a mismatch means this pod was created against another revision:
// it must not serve calls, because the caller asked for the current one.
func Load(cfg Config) (Script, error) {
	path, err := SourceFilename(cfg.Language)
	if err != nil {
		return Script{}, err
	}
	interpreter, err := Interpreter(cfg.Language)
	if err != nil {
		return Script{}, err
	}
	source, err := os.ReadFile(path)
	if err != nil {
		return Script{}, fmt.Errorf("failed to read mounted source %s: %w", path, err)
	}
	if got := SourceHash(string(source)); got != cfg.SourceHash {
		return Script{}, fmt.Errorf("mounted source at %s is revision %s but this runner serves %s: refusing to execute a mismatched revision", path, got, cfg.SourceHash)
	}
	return Script{Interpreter: interpreter, Path: path}, nil
}

// Handler serves the runner's MCP endpoint plus its readiness probe. Readiness
// is only reachable once Load has verified the revision, so an unverified pod
// never joins the Service's endpoints.
func Handler(cfg Config, script Script) http.Handler {
	server := mcp.NewServer(&mcp.Implementation{Name: "ark-inline-runner", Version: "v1"}, nil)
	server.AddTool(
		&mcp.Tool{
			Name:        cfg.ToolName,
			InputSchema: json.RawMessage(`{"type":"object"}`),
		},
		func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			result := script.Call(ctx, req.Params.Arguments)
			return &mcp.CallToolResult{
				Content: []mcp.Content{&mcp.TextContent{Text: result.Text}},
				IsError: result.IsError,
			}, nil
		},
	)

	// Stateless: the activator opens a connection per call and keeps no session
	// here, so there is nothing for a restart to lose.
	mcpHandler := transport.Handler(server)

	mux := http.NewServeMux()
	mux.Handle(MCPPath, limitBody(mcpHandler))
	mux.HandleFunc(ReadyPath, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	return mux
}

// limitBody caps the request before the MCP layer decodes it, so an oversized
// body costs a bounded read rather than an unbounded allocation.
func limitBody(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, MaxRequestBytes)
		next.ServeHTTP(w, r)
	})
}
