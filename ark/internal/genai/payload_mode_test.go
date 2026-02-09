package genai

import (
	"testing"

	"github.com/stretchr/testify/assert"
	arkann "mckinsey.com/ark/internal/annotations"
)

func TestResolvePayloadModeTeamAnnotation(t *testing.T) {
	teamAnnotations := map[string]string{
		arkann.A2APayloadMode: A2APayloadModeNative,
	}
	mode := ResolvePayloadMode(teamAnnotations, nil, nil)
	assert.Equal(t, A2APayloadModeNative, mode)
}

func TestResolvePayloadModeQueryAnnotation(t *testing.T) {
	queryAnnotations := map[string]string{
		arkann.A2APayloadMode: A2APayloadModeCompat,
	}
	mode := ResolvePayloadMode(nil, queryAnnotations, nil)
	assert.Equal(t, A2APayloadModeCompat, mode)
}

func TestResolvePayloadModeAgentsNative(t *testing.T) {
	agents := []map[string]string{
		{
			arkann.A2APayloadMode: A2APayloadModeNative,
		},
	}
	mode := ResolvePayloadMode(nil, nil, agents)
	assert.Equal(t, A2APayloadModeNative, mode)
}

func TestResolvePayloadModeAgentsPreferCompat(t *testing.T) {
	agents := []map[string]string{
		{
			arkann.A2APayloadMode: A2APayloadModeNative,
		},
		{
			arkann.A2APayloadMode: A2APayloadModeCompat,
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
		{arkann.A2APayloadMode: A2APayloadModeNative},
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
		arkann.A2APayloadMode: A2APayloadModeNative,
	}
	agents := []map[string]string{
		{arkann.A2APayloadMode: A2APayloadModeNative},
		{arkann.A2APayloadMode: A2APayloadModeCompat},
	}
	mode := ResolvePayloadMode(teamAnnotations, nil, agents)
	assert.Equal(t, A2APayloadModeNative, mode)
}

func TestResolvePayloadModeQueryOverridesAgents(t *testing.T) {
	queryAnnotations := map[string]string{
		arkann.A2APayloadMode: A2APayloadModeNative,
	}
	agents := []map[string]string{
		{arkann.A2APayloadMode: A2APayloadModeCompat},
	}
	mode := ResolvePayloadMode(nil, queryAnnotations, agents)
	assert.Equal(t, A2APayloadModeNative, mode)
}

func TestResolvePayloadModeTeamTakesPriorityOverQuery(t *testing.T) {
	teamAnnotations := map[string]string{
		arkann.A2APayloadMode: A2APayloadModeCompat,
	}
	queryAnnotations := map[string]string{
		arkann.A2APayloadMode: A2APayloadModeNative,
	}
	mode := ResolvePayloadMode(teamAnnotations, queryAnnotations, nil)
	assert.Equal(t, A2APayloadModeCompat, mode)
}
