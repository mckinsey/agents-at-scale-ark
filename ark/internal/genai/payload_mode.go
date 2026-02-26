package genai

import "context"

func ResolvePayloadMode() string {
	return A2APayloadModeNative
}

func ResolveDelegationPayloadMode(ctx context.Context) string {
	if HasA2APayloadModeInContext(ctx) {
		return GetA2APayloadModeFromContext(ctx)
	}
	return A2APayloadModeNative
}
