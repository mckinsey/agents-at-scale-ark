package genai

import (
	arkann "mckinsey.com/ark/internal/annotations"
)

func ResolvePayloadMode(teamAnnotations, queryAnnotations map[string]string, agentAnnotations []map[string]string) string {
	if teamAnnotations != nil {
		if value := teamAnnotations[arkann.A2APayloadMode]; value != "" {
			return GetA2APayloadMode(teamAnnotations)
		}
	}
	if queryAnnotations != nil {
		if value := queryAnnotations[arkann.A2APayloadMode]; value != "" {
			return GetA2APayloadMode(queryAnnotations)
		}
	}
	if len(agentAnnotations) > 0 {
		hasCompat := false
		hasNative := false
		for _, annotations := range agentAnnotations {
			mode := GetA2APayloadMode(annotations)
			if mode == A2APayloadModeCompat {
				hasCompat = true
				continue
			}
			if mode == A2APayloadModeNative {
				hasNative = true
			}
		}
		if hasCompat {
			return A2APayloadModeCompat
		}
		if hasNative {
			return A2APayloadModeNative
		}
	}
	return A2APayloadModeCompat
}
