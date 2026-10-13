package controller

import (
	"testing"

	"github.com/stretchr/testify/assert"
	a2asrv "trpc.group/trpc-go/trpc-a2a-go/server"

	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
)

func TestApplyAgentCardStatus(t *testing.T) {
	streaming := true
	card := &arka2a.A2AAgentCard{
		URL:          "http://localhost:8000/a2a/message",
		Version:      "1.0.0",
		Capabilities: a2asrv.AgentCapabilities{Streaming: &streaming},
		Skills:       []a2asrv.AgentSkill{{ID: "simple_math"}, {ID: "echo_messages"}, {ID: "basic_conversation"}},
	}
	status := &arkv1prealpha1.A2AServerStatus{}

	assert.True(t, applyAgentCardStatus(status, card, arka2a.ProtocolVersion2))
	assert.Equal(t, arka2a.ProtocolVersion2, status.NegotiatedProtocol)
	assert.Equal(t, "1.0.0", status.CardVersion)
	assert.Equal(t, "http://localhost:8000/a2a/message", status.CardURL)
	assert.Equal(t, int32(3), *status.SkillCount)
	assert.True(t, *status.StreamingSupported)

	assert.False(t, applyAgentCardStatus(status, card, arka2a.ProtocolVersion2), "same card must not report a change")

	card.Version = "1.1.0"
	assert.True(t, applyAgentCardStatus(status, card, arka2a.ProtocolVersion2))
	assert.Equal(t, "1.1.0", status.CardVersion)
}

func TestApplyAgentCardStatusRecordsZeroSkillsAndMissingStreaming(t *testing.T) {
	status := &arkv1prealpha1.A2AServerStatus{}

	applyAgentCardStatus(status, &arka2a.A2AAgentCard{}, arka2a.ProtocolVersion3)

	assert.Equal(t, int32(0), *status.SkillCount)
	assert.False(t, *status.StreamingSupported)
}

func TestClearAgentCardStatus(t *testing.T) {
	status := &arkv1prealpha1.A2AServerStatus{}
	applyAgentCardStatus(status, &arka2a.A2AAgentCard{Version: "1.0.0", URL: "http://localhost:8000"}, arka2a.ProtocolVersion3)

	clearAgentCardStatus(status)

	assert.Empty(t, status.NegotiatedProtocol)
	assert.Empty(t, status.CardVersion)
	assert.Empty(t, status.CardURL)
	assert.Nil(t, status.SkillCount)
	assert.Nil(t, status.StreamingSupported)
}
