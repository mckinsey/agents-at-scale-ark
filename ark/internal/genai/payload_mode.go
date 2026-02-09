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
		hasExplicitCompat := false
		hasNative := false
		for _, ann := range agentAnnotations {
			if ann == nil {
				continue
			}
			explicit := ann[arkann.A2APayloadMode]
			if explicit == "" {
				continue
			}
			mode := GetA2APayloadMode(ann)
			if mode == A2APayloadModeCompat {
				hasExplicitCompat = true
			}
			if mode == A2APayloadModeNative {
				hasNative = true
			}
		}
		if hasExplicitCompat {
			return A2APayloadModeCompat
		}
		if hasNative {
			return A2APayloadModeNative
		}
	}
	return A2APayloadModeCompat
}
