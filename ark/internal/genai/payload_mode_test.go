package genai

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	arkann "mckinsey.com/ark/internal/annotations"
)

func TestResolvePayloadModeTeamAnnotation(t *testing.T) {
	teamAnnotations := map[string]string{
		arkann.A2AExperimentalEnabled: "true",
	}
	mode := ResolvePayloadMode(teamAnnotations, nil, nil)
	assert.Equal(t, A2APayloadModeNative, mode)
}

func TestResolvePayloadModeQueryAnnotation(t *testing.T) {
	queryAnnotations := map[string]string{
		arkann.A2AExperimentalEnabled: "true",
	}
	mode := ResolvePayloadMode(nil, queryAnnotations, nil)
	assert.Equal(t, A2APayloadModeNative, mode)
}

func TestResolvePayloadModeAgentsNative(t *testing.T) {
	agents := []map[string]string{
		{
			arkann.A2AExperimentalEnabled: "true",
		},
	}
	mode := ResolvePayloadMode(nil, nil, agents)
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
	mode := ResolvePayloadMode(nil, nil, agents)
	assert.Equal(t, A2APayloadModeCompat, mode)
}

func TestResolvePayloadModeDefaultCompat(t *testing.T) {
	mode := ResolvePayloadMode(nil, nil, nil)
	assert.Equal(t, A2APayloadModeCompat, mode)
}

func TestResolvePayloadModeAgentsNoModeAnnotation(t *testing.T) {
	agents := []map[string]string{
		{"ark.mckinsey.com/a2a-server-address": "http://agent1:8080"},
		{"ark.mckinsey.com/a2a-server-address": "http://agent2:8080"},
	}
	mode := ResolvePayloadMode(nil, nil, agents)
	assert.Equal(t, A2APayloadModeCompat, mode)
}

func TestResolvePayloadModeNilAnnotationsInSlice(t *testing.T) {
	agents := []map[string]string{
		nil,
		{arkann.A2AExperimentalEnabled: "true"},
	}
	mode := ResolvePayloadMode(nil, nil, agents)
	assert.Equal(t, A2APayloadModeNative, mode)
}

func TestResolvePayloadModeEmptyAgentSlice(t *testing.T) {
	agents := []map[string]string{}
	mode := ResolvePayloadMode(nil, nil, agents)
	assert.Equal(t, A2APayloadModeCompat, mode)
}

func TestResolvePayloadModeTeamOverridesMixedAgents(t *testing.T) {
	teamAnnotations := map[string]string{
		arkann.A2AExperimentalEnabled: "true",
	}
	agents := []map[string]string{
		{arkann.A2AExperimentalEnabled: "false"},
	}
	mode := ResolvePayloadMode(teamAnnotations, nil, agents)
	assert.Equal(t, A2APayloadModeNative, mode)
}

func TestResolvePayloadModeQueryOverridesAgents(t *testing.T) {
	queryAnnotations := map[string]string{
		arkann.A2AExperimentalEnabled: "false",
	}
	agents := []map[string]string{
		{arkann.A2AExperimentalEnabled: "true"},
	}
	mode := ResolvePayloadMode(nil, queryAnnotations, agents)
	assert.Equal(t, A2APayloadModeCompat, mode)
}

func TestResolvePayloadModeTeamTakesPriorityOverQuery(t *testing.T) {
	teamAnnotations := map[string]string{
		arkann.A2AExperimentalEnabled: "false",
	}
	queryAnnotations := map[string]string{
		arkann.A2AExperimentalEnabled: "true",
	}
	mode := ResolvePayloadMode(teamAnnotations, queryAnnotations, nil)
	assert.Equal(t, A2APayloadModeCompat, mode)
}

func TestResolveDelegationPayloadModeContext(t *testing.T) {
	ctx := WithA2APayloadMode(context.Background(), A2APayloadModeNative)
	annotations := map[string]string{
		arkann.A2APayloadMode: A2APayloadModeCompat,
	}
	mode := ResolveDelegationPayloadMode(ctx, annotations)
	assert.Equal(t, A2APayloadModeNative, mode)
}

func TestResolveDelegationPayloadModeAnnotations(t *testing.T) {
	ctx := context.Background()
	annotations := map[string]string{
		arkann.A2AExperimentalEnabled: "true",
	}
	mode := ResolveDelegationPayloadMode(ctx, annotations)
	assert.Equal(t, A2APayloadModeNative, mode)
}

func TestGetA2AExperimentalEnabled(t *testing.T) {
	enabled, hasValue := GetA2AExperimentalEnabled(map[string]string{
		arkann.A2AExperimentalEnabled: "yes",
	})
	assert.True(t, hasValue)
	assert.True(t, enabled)
}

func TestGetA2AExperimentalEnabledInvalidDefaultsToFalse(t *testing.T) {
	enabled, hasValue := GetA2AExperimentalEnabled(map[string]string{
		arkann.A2AExperimentalEnabled: "invalid",
	})
	assert.True(t, hasValue)
	assert.False(t, enabled)
}
