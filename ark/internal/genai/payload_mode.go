package genai

import (
	"context"
	"strings"

	arkann "mckinsey.com/ark/internal/annotations"
	"mckinsey.com/ark/internal/config"
)

func ResolvePayloadMode(teamAnnotations, queryAnnotations map[string]string, agentAnnotations []map[string]string, cfg *config.Config) string {
	if ResolveA2AExperimentalEnabled(teamAnnotations, queryAnnotations, agentAnnotations, cfg) {
		return A2APayloadModeNative
	}
	return A2APayloadModeCompat
}

func ResolveA2AExperimentalEnabled(teamAnnotations, queryAnnotations map[string]string, agentAnnotations []map[string]string, cfg *config.Config) bool {
	if enabled, hasValue := getA2AEnabledFromAnnotations(teamAnnotations); hasValue {
		return enabled
	}
	if enabled, hasValue := getA2AEnabledFromAnnotations(queryAnnotations); hasValue {
		return enabled
	}
	if enabled, hasValue := scanAgentA2AEnabled(agentAnnotations); hasValue {
		return enabled
	}
	if cfg != nil {
		return strings.TrimSpace(strings.ToLower(cfg.GetDefaultExecutionMode())) == "a2a"
	}
	return false
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

func scanAgentA2AEnabled(agentAnnotations []map[string]string) (bool, bool) {
	hasExplicitEnabled := false
	for _, ann := range agentAnnotations {
		enabled, hasValue := getA2AEnabledFromAnnotations(ann)
		if !hasValue {
			continue
		}
		if !enabled {
			return false, true
		}
		hasExplicitEnabled = true
	}
	if hasExplicitEnabled {
		return true, true
	}
	return false, false
}

func ResolveDelegationPayloadMode(ctx context.Context, targetAnnotations map[string]string, cfg *config.Config) string {
	if HasA2APayloadModeInContext(ctx) {
		return GetA2APayloadModeFromContext(ctx)
	}
	if IsA2AEnabled(targetAnnotations, cfg) {
		return A2APayloadModeNative
	}
	return A2APayloadModeCompat
}
