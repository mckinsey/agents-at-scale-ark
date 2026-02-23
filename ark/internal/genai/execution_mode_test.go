/* Copyright 2025. McKinsey & Company */

package genai

import (
	"testing"

	arkann "mckinsey.com/ark/internal/annotations"
	"mckinsey.com/ark/internal/config"
)

func cfgWithMode(mode string) *config.Config {
	cfg := config.Load()
	cfg.SetDefaultExecutionMode(mode)
	return cfg
}

func TestIsA2AEnabledNewAnnotation(t *testing.T) {
	tests := []struct {
		name           string
		annotationMode string
		want           bool
	}{
		{
			name:           "explicit a2a",
			annotationMode: "a2a",
			want:           true,
		},
		{
			name:           "explicit chat-completions",
			annotationMode: "chat-completions",
			want:           false,
		},
		{
			name:           "explicit a2a with whitespace and case normalization",
			annotationMode: "  A2A  ",
			want:           true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resourceAnnotations := map[string]string{
				arkann.ExecutionMode: tt.annotationMode,
			}

			result := IsA2AEnabled(resourceAnnotations, cfgWithMode("chat-completions"))
			if result != tt.want {
				t.Errorf("IsA2AEnabled() = %v, want %v", result, tt.want)
			}
		})
	}
}

func TestIsA2AEnabledLegacyAnnotation(t *testing.T) {
	tests := []struct {
		name    string
		enabled string
		want    bool
	}{
		{
			name:    "legacy enabled",
			enabled: "true",
			want:    true,
		},
		{
			name:    "legacy disabled",
			enabled: "false",
			want:    false,
		},
		{
			name:    "legacy enabled using one",
			enabled: "1",
			want:    true,
		},
		{
			name:    "legacy enabled using yes",
			enabled: "yes",
			want:    true,
		},
		{
			name:    "legacy enabled using normalized yes",
			enabled: "  YES  ",
			want:    true,
		},
		{
			name:    "legacy disabled using zero",
			enabled: "0",
			want:    false,
		},
		{
			name:    "legacy disabled using no",
			enabled: "No",
			want:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resourceAnnotations := map[string]string{
				arkann.A2AExperimentalEnabled: tt.enabled,
			}

			result := IsA2AEnabled(resourceAnnotations, cfgWithMode("chat-completions"))
			if result != tt.want {
				t.Errorf("IsA2AEnabled() = %v, want %v", result, tt.want)
			}
		})
	}
}

func TestIsA2AEnabledFeatureFlag(t *testing.T) {
	result := IsA2AEnabled(map[string]string{}, cfgWithMode("a2a"))
	if !result {
		t.Error("IsA2AEnabled() should return true when feature flag is a2a")
	}
}

func TestIsA2AEnabledDefault(t *testing.T) {
	result := IsA2AEnabled(map[string]string{}, cfgWithMode("chat-completions"))
	if result {
		t.Error("IsA2AEnabled() should return false for chat-completions default")
	}
}

func TestIsA2AEnabledLegacyInvalidFallsBackToConfig(t *testing.T) {
	resourceAnnotations := map[string]string{
		arkann.A2AExperimentalEnabled: "maybe",
	}

	if got := IsA2AEnabled(resourceAnnotations, cfgWithMode("a2a")); !got {
		t.Error("invalid legacy value should fall back to config (a2a => true)")
	}
	if got := IsA2AEnabled(resourceAnnotations, cfgWithMode("chat-completions")); got {
		t.Error("invalid legacy value should fall back to config (chat-completions => false)")
	}
}

func TestIsA2AEnabledInvalidExecutionModeFallsBackToLegacy(t *testing.T) {
	resourceAnnotations := map[string]string{
		arkann.ExecutionMode:          "invalid",
		arkann.A2AExperimentalEnabled: "yes",
	}

	if got := IsA2AEnabled(resourceAnnotations, cfgWithMode("chat-completions")); !got {
		t.Error("invalid execution-mode should fall back to legacy annotation")
	}
}

func TestIsA2AEnabledInvalidExecutionModeFallsBackToConfig(t *testing.T) {
	resourceAnnotations := map[string]string{
		arkann.ExecutionMode: "invalid",
	}

	if got := IsA2AEnabled(resourceAnnotations, cfgWithMode("a2a")); !got {
		t.Error("invalid execution-mode should fall back to config (a2a => true)")
	}
	if got := IsA2AEnabled(resourceAnnotations, cfgWithMode("chat-completions")); got {
		t.Error("invalid execution-mode should fall back to config (chat-completions => false)")
	}
}

func TestIsA2AEnabledPriority(t *testing.T) {
	resourceAnnotations := map[string]string{
		arkann.ExecutionMode: "chat-completions",
	}

	result := IsA2AEnabled(resourceAnnotations, cfgWithMode("a2a"))
	if result {
		t.Error("annotation should override feature flag (want false)")
	}
}

func TestIsA2AEnabledNewAnnotationOverridesLegacy(t *testing.T) {
	resourceAnnotations := map[string]string{
		arkann.ExecutionMode:          "chat-completions",
		arkann.A2AExperimentalEnabled: "true",
	}

	result := IsA2AEnabled(resourceAnnotations, cfgWithMode("a2a"))
	if result {
		t.Error("new annotation should override legacy")
	}
}

func TestGetA2AEnabledFromExecutionMode(t *testing.T) {
	tests := []struct {
		name        string
		annotations map[string]string
		wantEnabled bool
		wantHas     bool
	}{
		{
			name:        "a2a",
			annotations: map[string]string{arkann.ExecutionMode: "a2a"},
			wantEnabled: true,
			wantHas:     true,
		},
		{
			name:        "chat completions",
			annotations: map[string]string{arkann.ExecutionMode: "chat-completions"},
			wantEnabled: false,
			wantHas:     true,
		},
		{
			name:        "normalized a2a",
			annotations: map[string]string{arkann.ExecutionMode: "  A2A  "},
			wantEnabled: true,
			wantHas:     true,
		},
		{
			name:        "invalid mode",
			annotations: map[string]string{arkann.ExecutionMode: "invalid"},
			wantEnabled: false,
			wantHas:     false,
		},
		{
			name:        "missing mode",
			annotations: map[string]string{},
			wantEnabled: false,
			wantHas:     false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotEnabled, gotHas := GetA2AEnabledFromExecutionMode(tt.annotations)
			if gotEnabled != tt.wantEnabled || gotHas != tt.wantHas {
				t.Errorf("GetA2AEnabledFromExecutionMode() = (%v, %v), want (%v, %v)", gotEnabled, gotHas, tt.wantEnabled, tt.wantHas)
			}
		})
	}
}

func TestIsA2AEnabledNilConfig(t *testing.T) {
	result := IsA2AEnabled(map[string]string{}, nil)
	if result {
		t.Error("IsA2AEnabled() with nil config should return false")
	}
}

func TestGetExecutionModeName(t *testing.T) {
	tests := []struct {
		name  string
		isA2A bool
		want  string
	}{
		{
			name:  "a2a mode",
			isA2A: true,
			want:  "a2a",
		},
		{
			name:  "chat-completions mode",
			isA2A: false,
			want:  "chat-completions",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := GetExecutionModeName(tt.isA2A)
			if got != tt.want {
				t.Errorf("GetExecutionModeName(%v) = %v, want %v", tt.isA2A, got, tt.want)
			}
		})
	}
}
