package noop

import (
	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/eventing/recorder"
)

type noopProvider struct {
	queryRecorder           eventing.QueryRecorder
	a2aRecorder             eventing.A2aRecorder
	modelRecorder           eventing.ModelRecorder
	agentRecorder           eventing.AgentRecorder
	teamRecorder            eventing.TeamRecorder
	toolRecorder            eventing.ToolRecorder
	mcpServerRecorder       eventing.MCPServerRecorder
	executionEngineRecorder eventing.ExecutionEngineRecorder
}

func NewProvider() eventing.Provider {
	emitter := NewNoopEventEmitter()
	return &noopProvider{
		queryRecorder:           NewQueryRecorder(),
		a2aRecorder:             recorder.NewA2aRecorder(emitter, emitter),
		modelRecorder:           recorder.NewModelRecorder(emitter, emitter),
		agentRecorder:           recorder.NewAgentRecorder(emitter, emitter),
		teamRecorder:            recorder.NewTeamRecorder(emitter, emitter),
		toolRecorder:            recorder.NewToolRecorder(emitter, emitter),
		mcpServerRecorder:       recorder.NewMCPServerRecorder(emitter),
		executionEngineRecorder: recorder.NewExecutionEngineRecorder(emitter, emitter),
	}
}

func (p *noopProvider) ModelRecorder() eventing.ModelRecorder {
	return p.modelRecorder
}

func (p *noopProvider) A2aRecorder() eventing.A2aRecorder {
	return p.a2aRecorder
}

func (p *noopProvider) AgentRecorder() eventing.AgentRecorder {
	return p.agentRecorder
}

func (p *noopProvider) TeamRecorder() eventing.TeamRecorder {
	return p.teamRecorder
}

func (p *noopProvider) ExecutionEngineRecorder() eventing.ExecutionEngineRecorder {
	return p.executionEngineRecorder
}

func (p *noopProvider) MCPServerRecorder() eventing.MCPServerRecorder {
	return p.mcpServerRecorder
}

func (p *noopProvider) QueryRecorder() eventing.QueryRecorder {
	return p.queryRecorder
}

func (p *noopProvider) ToolRecorder() eventing.ToolRecorder {
	return p.toolRecorder
}

func (p *noopProvider) MemoryRecorder() eventing.MemoryRecorder {
	return nil
}

func NewModelRecorder() eventing.ModelRecorder {
	emitter := NewNoopEventEmitter()
	return recorder.NewModelRecorder(emitter, emitter)
}
