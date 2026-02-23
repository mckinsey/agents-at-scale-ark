/* Copyright 2025. McKinsey & Company */

package genai

import (
	"strings"

	arkann "mckinsey.com/ark/internal/annotations"
	"mckinsey.com/ark/internal/config"
)

func GetA2AEnabledFromExecutionMode(annotations map[string]string) (bool, bool) {
	if annotations == nil {
		return false, false
	}
	mode, exists := annotations[arkann.ExecutionMode]
	if !exists {
		return false, false
	}
	switch strings.TrimSpace(strings.ToLower(mode)) {
	case "a2a":
		return true, true
	case "chat-completions":
		return false, true
	default:
		return false, false
	}
}

func getA2AEnabledFromAnnotations(resourceAnnotations map[string]string) (bool, bool) {
	if enabled, hasValue := GetA2AEnabledFromExecutionMode(resourceAnnotations); hasValue {
		return enabled, true
	}
	return GetA2AExperimentalEnabled(resourceAnnotations)
}

func IsA2AEnabled(resourceAnnotations map[string]string, cfg *config.Config) bool {
	if enabled, hasValue := getA2AEnabledFromAnnotations(resourceAnnotations); hasValue {
		return enabled
	}

	if cfg != nil {
		return cfg.GetDefaultExecutionMode() == "a2a"
	}

	return false
}

func GetExecutionModeName(isA2A bool) string {
	if isA2A {
		return "a2a"
	}
	return "chat-completions"
}
