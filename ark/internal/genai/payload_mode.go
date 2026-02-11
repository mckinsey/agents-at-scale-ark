package genai

import (
	"context"

	arkann "mckinsey.com/ark/internal/annotations"
)

func ResolvePayloadMode(teamAnnotations, queryAnnotations map[string]string, agentAnnotations []map[string]string) string {
	if hasExplicitPayloadMode(teamAnnotations) {
		return GetA2APayloadMode(teamAnnotations)
	}
	if hasExplicitPayloadMode(queryAnnotations) {
		return GetA2APayloadMode(queryAnnotations)
	}
	if hasExplicitCompat, hasNative := scanAgentPayloadModes(agentAnnotations); hasExplicitCompat {
		return A2APayloadModeCompat
	} else if hasNative {
		return A2APayloadModeNative
	}
	return A2APayloadModeCompat
}

func hasExplicitPayloadMode(annotations map[string]string) bool {
	if annotations == nil {
		return false
	}
	return annotations[arkann.A2APayloadMode] != ""
}

func scanAgentPayloadModes(agentAnnotations []map[string]string) (bool, bool) {
	hasExplicitCompat := false
	hasNative := false
	for _, ann := range agentAnnotations {
		if !hasExplicitPayloadMode(ann) {
			continue
		}
		switch GetA2APayloadMode(ann) {
		case A2APayloadModeCompat:
			hasExplicitCompat = true
		case A2APayloadModeNative:
			hasNative = true
		}
	}
	return hasExplicitCompat, hasNative
}

func ResolveDelegationPayloadMode(ctx context.Context, targetAnnotations map[string]string) string {
	if HasA2APayloadModeInContext(ctx) {
		return GetA2APayloadModeFromContext(ctx)
	}
	return GetA2APayloadMode(targetAnnotations)
}
