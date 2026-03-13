/* Copyright 2025. McKinsey & Company */

package completions

import (
	"context"
)

type probeContextKey struct{}

func ContextWithProbeMode(ctx context.Context) context.Context {
	return context.WithValue(ctx, probeContextKey{}, true)
}

func IsProbeContext(ctx context.Context) bool {
	val, ok := ctx.Value(probeContextKey{}).(bool)
	return ok && val
}
