package genai

import (
	"context"
)

type contextKey string

const (
	queryIDKey      contextKey = "queryId"
	sessionIDKey    contextKey = "sessionId"
	queryNameKey    contextKey = "queryName"
	a2aContextIDKey contextKey = "a2aContextId"
	// QueryContextKey is used to pass the Query resource through context to agents
	QueryContextKey contextKey = "queryContext"
	// Execution metadata keys for streaming
	// These values are sent back with streaming chunks in the 'ark' metadata field,
	// allowing callers to differentiate the source of chunks (e.g., specific agents in a team query)
	targetKey contextKey = "target" // Original query target (e.g., "team/my-team")
	teamKey   contextKey = "team"   // Current team name
	agentKey  contextKey = "agent"  // Current agent name
	modelKey  contextKey = "model"  // Current model name
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

func getQueryName(ctx context.Context) string {
	if val := ctx.Value(queryNameKey); val != nil {
		if queryName, ok := val.(string); ok {
			return queryName
		}
	}
	return ""
}

// WithExecutionMetadata adds execution metadata to context for streaming
func WithExecutionMetadata(ctx context.Context, metadata map[string]interface{}) context.Context {
	// Avoid nested context in loop by accumulating in temporary variable
	tmpCtx := ctx
	for key, value := range metadata {
		switch key {
		case "target":
			tmpCtx = context.WithValue(tmpCtx, targetKey, value) //nolint:fatcontext // accumulating context values
		case "team":
			tmpCtx = context.WithValue(tmpCtx, teamKey, value)
		case MemberTypeAgent:
			tmpCtx = context.WithValue(tmpCtx, agentKey, value)
		case "model":
			tmpCtx = context.WithValue(tmpCtx, modelKey, value)
		}
	}
	return tmpCtx
}

// GetExecutionMetadata retrieves execution metadata from context
func GetExecutionMetadata(ctx context.Context) map[string]interface{} {
	metadata := make(map[string]interface{})

	if val := ctx.Value(targetKey); val != nil {
		metadata["target"] = val
	}
	if val := ctx.Value(teamKey); val != nil {
		metadata["team"] = val
	}
	if val := ctx.Value(agentKey); val != nil {
		metadata["agent"] = val
	}
	if val := ctx.Value(modelKey); val != nil {
		metadata["model"] = val
	}

	return metadata
}

func WithA2AContextID(ctx context.Context, contextID string) context.Context {
	return context.WithValue(ctx, a2aContextIDKey, contextID)
}

func GetA2AContextID(ctx context.Context) string {
	if val := ctx.Value(a2aContextIDKey); val != nil {
		if contextID, ok := val.(string); ok {
			return contextID
		}
	}
	return ""
}
