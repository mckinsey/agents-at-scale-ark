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
