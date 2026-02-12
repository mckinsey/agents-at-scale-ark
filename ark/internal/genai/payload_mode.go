package genai

import (
	"context"
	"strings"

	arkann "mckinsey.com/ark/internal/annotations"
)

func ResolvePayloadMode(teamAnnotations, queryAnnotations map[string]string, agentAnnotations []map[string]string) string {
	if ResolveA2AExperimentalEnabled(teamAnnotations, queryAnnotations, agentAnnotations) {
		return A2APayloadModeNative
	}
	return A2APayloadModeCompat
}

func ResolveA2AExperimentalEnabled(teamAnnotations, queryAnnotations map[string]string, agentAnnotations []map[string]string) bool {
	if enabled, hasValue := GetA2AExperimentalEnabled(teamAnnotations); hasValue {
		return enabled
	}
	if enabled, hasValue := GetA2AExperimentalEnabled(queryAnnotations); hasValue {
		return enabled
	}
	return scanAgentA2AExperimentalEnabled(agentAnnotations)
}

func IsA2AExperimentalEnabled(annotations map[string]string) bool {
	enabled, _ := GetA2AExperimentalEnabled(annotations)
	return enabled
}

func GetA2AExperimentalEnabled(annotations map[string]string) (bool, bool) {
	if annotations == nil {
		return false, false
	}
	value, exists := annotations[arkann.A2AExperimentalEnabled]
	if !exists {
		return false, false
	}
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" {
		return false, false
	}
	switch value {
	case "true", "1", "yes":
		return true, true
	case "false", "0", "no":
		return false, true
	default:
		return false, false
	}
}

func scanAgentA2AExperimentalEnabled(agentAnnotations []map[string]string) bool {
	hasExplicitEnabled := false
	for _, ann := range agentAnnotations {
		enabled, hasValue := GetA2AExperimentalEnabled(ann)
		if !hasValue {
			continue
		}
		if !enabled {
			return false
		}
		hasExplicitEnabled = true
	}
	return hasExplicitEnabled
}

func ResolveDelegationPayloadMode(ctx context.Context, targetAnnotations map[string]string) string {
	if HasA2APayloadModeInContext(ctx) {
		return GetA2APayloadModeFromContext(ctx)
	}
	if IsA2AExperimentalEnabled(targetAnnotations) {
		return A2APayloadModeNative
	}
	return A2APayloadModeCompat
}
