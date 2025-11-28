package config

import (
	ctrl "sigs.k8s.io/controller-runtime"

	"mckinsey.com/ark/internal/eventing"
	k8seventing "mckinsey.com/ark/internal/eventing/kubernetes"
	recorders "mckinsey.com/ark/internal/eventing/recorder"
)

type Provider struct {
	modelRecorder           eventing.ModelRecorder
	a2aRecorder             eventing.A2aRecorder
	agentRecorder           eventing.AgentRecorder
	teamRecorder            eventing.TeamRecorder
	executionEngineRecorder eventing.ExecutionEngineRecorder
	mcpServerRecorder       eventing.MCPServerRecorder
	queryRecorder           eventing.QueryRecorder
	toolRecorder            eventing.ToolRecorder
	memoryRecorder          eventing.MemoryRecorder
}

func NewProvider(mgr ctrl.Manager) *Provider {
	recorder := mgr.GetEventRecorderFor("ark-controller")
	emitter := k8seventing.NewKubernetesEventEmitter(recorder)

	return &Provider{
		modelRecorder:           recorders.NewModelRecorder(emitter),
		a2aRecorder:             recorders.NewA2aRecorder(emitter),
		agentRecorder:           recorders.NewAgentRecorder(emitter),
		teamRecorder:            recorders.NewTeamRecorder(emitter),
		executionEngineRecorder: recorders.NewExecutionEngineRecorder(emitter),
		mcpServerRecorder:       recorders.NewMCPServerRecorder(emitter),
		queryRecorder:           recorders.NewQueryRecorder(emitter),
		toolRecorder:            recorders.NewToolRecorder(emitter),
		memoryRecorder:          recorders.NewMemoryRecorder(emitter),
	}
}

func (p *Provider) ModelRecorder() eventing.ModelRecorder {
	return p.modelRecorder
}

func (p *Provider) A2aRecorder() eventing.A2aRecorder {
	return p.a2aRecorder
}

func (p *Provider) AgentRecorder() eventing.AgentRecorder {
	return p.agentRecorder
}

func (p *Provider) TeamRecorder() eventing.TeamRecorder {
	return p.teamRecorder
}

func (p *Provider) ExecutionEngineRecorder() eventing.ExecutionEngineRecorder {
	return p.executionEngineRecorder
}

func (p *Provider) MCPServerRecorder() eventing.MCPServerRecorder {
	return p.mcpServerRecorder
}

func (p *Provider) QueryRecorder() eventing.QueryRecorder {
	return p.queryRecorder
}

func (p *Provider) ToolRecorder() eventing.ToolRecorder {
	return p.toolRecorder
}

func (p *Provider) MemoryRecorder() eventing.MemoryRecorder {
	return p.memoryRecorder
}
