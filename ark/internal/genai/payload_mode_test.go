package genai

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	arkann "mckinsey.com/ark/internal/annotations"
	"mckinsey.com/ark/internal/config"
)

func payloadCfgWithMode(mode string) *config.Config {
	cfg := config.Load()
	cfg.SetDefaultExecutionMode(mode)
	return cfg
}

func TestResolvePayloadModeTeamAnnotation(t *testing.T) {
	teamAnnotations := map[string]string{
		arkann.A2AExperimentalEnabled: "true",
	}
	mode := ResolvePayloadMode(teamAnnotations, nil, nil, payloadCfgWithMode("chat-completions"))
	assert.Equal(t, A2APayloadModeNative, mode)
}

func TestResolvePayloadModeQueryAnnotation(t *testing.T) {
	queryAnnotations := map[string]string{
		arkann.A2AExperimentalEnabled: "true",
	}
	mode := ResolvePayloadMode(nil, queryAnnotations, nil, payloadCfgWithMode("chat-completions"))
	assert.Equal(t, A2APayloadModeNative, mode)
}

func TestResolvePayloadModeAgentsNative(t *testing.T) {
	agents := []map[string]string{
		{
			arkann.A2AExperimentalEnabled: "true",
		},
	}
	mode := ResolvePayloadMode(nil, nil, agents, payloadCfgWithMode("chat-completions"))
	assert.Equal(t, A2APayloadModeNative, mode)
}

func TestResolvePayloadModeAgentsPreferLegacy(t *testing.T) {
	agents := []map[string]string{
		{
			arkann.A2AExperimentalEnabled: "true",
		},
		{
			arkann.A2AExperimentalEnabled: "false",
		},
	}
	mode := ResolvePayloadMode(nil, nil, agents, payloadCfgWithMode("chat-completions"))
	assert.Equal(t, A2APayloadModeCompat, mode)
}

func TestResolvePayloadModeDefaultCompat(t *testing.T) {
	mode := ResolvePayloadMode(nil, nil, nil, payloadCfgWithMode("chat-completions"))
	assert.Equal(t, A2APayloadModeCompat, mode)
}

func TestResolvePayloadModeAgentsNoModeAnnotation(t *testing.T) {
	agents := []map[string]string{
		{"ark.mckinsey.com/a2a-server-address": "http://agent1:8080"},
		{"ark.mckinsey.com/a2a-server-address": "http://agent2:8080"},
	}
	mode := ResolvePayloadMode(nil, nil, agents, payloadCfgWithMode("chat-completions"))
	assert.Equal(t, A2APayloadModeCompat, mode)
}

func TestResolvePayloadModeNilAnnotationsInSlice(t *testing.T) {
	agents := []map[string]string{
		nil,
		{arkann.A2AExperimentalEnabled: "true"},
	}
	mode := ResolvePayloadMode(nil, nil, agents, payloadCfgWithMode("chat-completions"))
	assert.Equal(t, A2APayloadModeNative, mode)
}

func TestResolvePayloadModeEmptyAgentSlice(t *testing.T) {
	agents := []map[string]string{}
	mode := ResolvePayloadMode(nil, nil, agents, payloadCfgWithMode("chat-completions"))
	assert.Equal(t, A2APayloadModeCompat, mode)
}

func TestResolvePayloadModeTeamOverridesMixedAgents(t *testing.T) {
	teamAnnotations := map[string]string{
		arkann.A2AExperimentalEnabled: "true",
	}
	agents := []map[string]string{
		{arkann.A2AExperimentalEnabled: "false"},
	}
	mode := ResolvePayloadMode(teamAnnotations, nil, agents, payloadCfgWithMode("chat-completions"))
	assert.Equal(t, A2APayloadModeNative, mode)
}

func TestResolvePayloadModeQueryOverridesAgents(t *testing.T) {
	queryAnnotations := map[string]string{
		arkann.A2AExperimentalEnabled: "false",
	}
	agents := []map[string]string{
		{arkann.A2AExperimentalEnabled: "true"},
	}
	mode := ResolvePayloadMode(nil, queryAnnotations, agents, payloadCfgWithMode("chat-completions"))
	assert.Equal(t, A2APayloadModeCompat, mode)
}

func TestResolvePayloadModeTeamTakesPriorityOverQuery(t *testing.T) {
	teamAnnotations := map[string]string{
		arkann.A2AExperimentalEnabled: "false",
	}
	queryAnnotations := map[string]string{
		arkann.A2AExperimentalEnabled: "true",
	}
	mode := ResolvePayloadMode(teamAnnotations, queryAnnotations, nil, payloadCfgWithMode("chat-completions"))
	assert.Equal(t, A2APayloadModeCompat, mode)
}

func TestResolvePayloadModeConfigFallback(t *testing.T) {
	mode := ResolvePayloadMode(nil, nil, nil, payloadCfgWithMode("a2a"))
	assert.Equal(t, A2APayloadModeNative, mode)
}

func TestResolvePayloadModeExecutionModeOverridesLegacy(t *testing.T) {
	teamAnnotations := map[string]string{
		arkann.ExecutionMode:          "chat-completions",
		arkann.A2AExperimentalEnabled: "true",
	}
	mode := ResolvePayloadMode(teamAnnotations, nil, nil, payloadCfgWithMode("a2a"))
	assert.Equal(t, A2APayloadModeCompat, mode)
}

func TestResolvePayloadModeInvalidExecutionModeFallsBackToLegacy(t *testing.T) {
	teamAnnotations := map[string]string{
		arkann.ExecutionMode:          "maybe",
		arkann.A2AExperimentalEnabled: "true",
	}
	mode := ResolvePayloadMode(teamAnnotations, nil, nil, payloadCfgWithMode("chat-completions"))
	assert.Equal(t, A2APayloadModeNative, mode)
}

func TestResolvePayloadModeInvalidExecutionModeFallsBackToConfig(t *testing.T) {
	teamAnnotations := map[string]string{
		arkann.ExecutionMode: "maybe",
	}
	mode := ResolvePayloadMode(teamAnnotations, nil, nil, payloadCfgWithMode("a2a"))
	assert.Equal(t, A2APayloadModeNative, mode)
}

func TestResolveDelegationPayloadModeContext(t *testing.T) {
	ctx := WithA2APayloadMode(context.Background(), A2APayloadModeNative)
	annotations := map[string]string{
		arkann.A2APayloadMode: A2APayloadModeCompat,
	}
	mode := ResolveDelegationPayloadMode(ctx, annotations, payloadCfgWithMode("chat-completions"))
	assert.Equal(t, A2APayloadModeNative, mode)
}

func TestResolveDelegationPayloadModeAnnotations(t *testing.T) {
	ctx := context.Background()
	annotations := map[string]string{
		arkann.A2AExperimentalEnabled: "true",
	}
	mode := ResolveDelegationPayloadMode(ctx, annotations, payloadCfgWithMode("chat-completions"))
	assert.Equal(t, A2APayloadModeNative, mode)
}

func TestResolveDelegationPayloadModeExecutionMode(t *testing.T) {
	ctx := context.Background()
	annotations := map[string]string{
		arkann.ExecutionMode: "a2a",
	}
	mode := ResolveDelegationPayloadMode(ctx, annotations, payloadCfgWithMode("chat-completions"))
	assert.Equal(t, A2APayloadModeNative, mode)
}

func TestResolveDelegationPayloadModeInvalidExecutionModeFallsBackToConfig(t *testing.T) {
	ctx := context.Background()
	annotations := map[string]string{
		arkann.ExecutionMode: "invalid",
	}
	mode := ResolveDelegationPayloadMode(ctx, annotations, payloadCfgWithMode("a2a"))
	assert.Equal(t, A2APayloadModeNative, mode)
}

func TestGetA2AExperimentalEnabled(t *testing.T) {
	enabled, hasValue := GetA2AExperimentalEnabled(map[string]string{
		arkann.A2AExperimentalEnabled: "yes",
	})
	assert.True(t, hasValue)
	assert.True(t, enabled)
}

func TestGetA2AExperimentalEnabledInvalidTreatedAsNotSet(t *testing.T) {
	enabled, hasValue := GetA2AExperimentalEnabled(map[string]string{
		arkann.A2AExperimentalEnabled: "invalid",
	})
	assert.False(t, hasValue)
	assert.False(t, enabled)
}
