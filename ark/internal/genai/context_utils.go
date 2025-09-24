package genai

import (
	"context"
)

type contextKey string

const (
	queryIDKey   contextKey = "queryId"
	sessionIDKey contextKey = "sessionId"
	queryNameKey contextKey = "queryName"
	// QueryContextKey is used to pass the Query resource through context to agents
	QueryContextKey contextKey = "queryContext"
)

func WithQueryContext(ctx context.Context, queryID, sessionID, queryName string) context.Context {
	ctx = context.WithValue(ctx, queryIDKey, queryID)
	ctx = context.WithValue(ctx, sessionIDKey, sessionID)
	ctx = context.WithValue(ctx, queryNameKey, queryName)
	return ctx
}

func getQueryID(ctx context.Context) string {
	if val := ctx.Value(queryIDKey); val != nil {
		if queryID, ok := val.(string); ok {
			return queryID
		}
	}
	return ""
}

func getSessionID(ctx context.Context) string {
	if val := ctx.Value(sessionIDKey); val != nil {
		if sessionID, ok := val.(string); ok {
			return sessionID
		}
	}
	return ""
}
