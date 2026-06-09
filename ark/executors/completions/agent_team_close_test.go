package completions

import (
	"testing"

	"github.com/stretchr/testify/assert"

	eventnoop "mckinsey.com/ark/internal/eventing/noop"
	"mckinsey.com/ark/internal/telemetry/noop"
)

func newTestRegistry() *ToolRegistry {
	return NewToolRegistry(nil, noop.NewProvider().ToolRecorder(), eventnoop.NewProvider().ToolRecorder())
}

func TestAgentClose_NilTools(t *testing.T) {
	agent := &Agent{Name: "test"}
	assert.NotPanics(t, agent.Close)
}

func TestAgentClose_WithTools(t *testing.T) {
	agent := &Agent{Name: "test", Tools: newTestRegistry()}
	assert.NotPanics(t, agent.Close)
	assert.NotPanics(t, agent.Close)
}

func TestTeamClose_NoMembers(t *testing.T) {
	team := &Team{Name: "test"}
	assert.NotPanics(t, team.Close)
}

func TestTeamClose_AgentMembers(t *testing.T) {
	team := &Team{
		Name: "test-team",
		Members: []TeamMember{
			&Agent{Name: "agent-1", Tools: newTestRegistry()},
			&Agent{Name: "agent-2", Tools: newTestRegistry()},
		},
	}
	assert.NotPanics(t, team.Close)
}

func TestTeamClose_Recursive(t *testing.T) {
	innerTeam := &Team{
		Name: "inner-team",
		Members: []TeamMember{
			&Agent{Name: "inner-agent", Tools: newTestRegistry()},
		},
	}
	outerTeam := &Team{
		Name:    "outer-team",
		Members: []TeamMember{innerTeam},
	}
	assert.NotPanics(t, outerTeam.Close)
}

func TestTeamClose_NonAgentMembersSkipped(t *testing.T) {
	team := &Team{
		Name:    "test",
		Members: []TeamMember{&mockTeamMember{name: "tool-member"}},
	}
	assert.NotPanics(t, team.Close)
}
