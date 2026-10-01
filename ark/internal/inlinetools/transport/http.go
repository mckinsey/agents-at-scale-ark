/* Copyright 2025. McKinsey & Company */

// Package transport binds inline stateless MCP calls to their HTTP lifetime.
package transport

import (
	"context"
	"fmt"
	"net/http"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type requestContextKey struct{}

// Handler configures a server once. It is deliberately stateless: a stateful
// session could retain an initialization request's context for later calls.
func Handler(server *mcp.Server) http.Handler {
	server.AddReceivingMiddleware(requestCancellation)
	next := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server },
		&mcp.StreamableHTTPOptions{Stateless: true, JSONResponse: true})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// The SDK detaches cancellation, but preserves values. Keep the live
		// HTTP context as a value so tools/call can reconnect its cancellation.
		ctx := context.WithValue(r.Context(), requestContextKey{}, r.Context())
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func requestCancellation(next mcp.MethodHandler) mcp.MethodHandler {
	return func(ctx context.Context, method string, req mcp.Request) (mcp.Result, error) {
		if method != "tools/call" {
			return next(ctx, method, req)
		}
		httpCtx, ok := ctx.Value(requestContextKey{}).(context.Context)
		if !ok {
			return nil, fmt.Errorf("inline call is missing its HTTP request context")
		}
		callCtx, cancel := context.WithCancel(ctx)
		stop := context.AfterFunc(httpCtx, cancel)
		defer func() { stop(); cancel() }()
		// AfterFunc is asynchronous even when httpCtx was already canceled.
		if err := httpCtx.Err(); err != nil {
			return nil, err
		}
		if err := callCtx.Err(); err != nil {
			return nil, err
		}
		return next(callCtx, method, req)
	}
}
