package config

import (
	"context"

	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	"mckinsey.com/ark/internal/eventing"
	brokereventing "mckinsey.com/ark/internal/eventing/broker"
	k8seventing "mckinsey.com/ark/internal/eventing/kubernetes"
	recorders "mckinsey.com/ark/internal/eventing/recorder"
	"mckinsey.com/ark/internal/telemetry/routing"
)

var log = logf.Log.WithName("eventing.config")

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

func NewProvider(mgr ctrl.Manager, k8sClient client.Client) *Provider {
	recorder := mgr.GetEventRecorderFor("ark-controller")
	k8sEmitter := k8seventing.NewKubernetesEventEmitter(recorder)

	operationEmitter := k8sEmitter

	if k8sClient != nil {
		ctx := context.Background()
		endpoints, err := routing.DiscoverBrokerEndpoints(ctx, k8sClient)

		switch {
		case err != nil:
			log.Error(err, "failed to discover broker endpoints, using Kubernetes events for operations",
				"troubleshooting", "check RBAC permissions for listing ConfigMaps",
				"configmap", "ark-config-broker")
		case len(endpoints) > 0:
			namespaces := make([]string, 0, len(endpoints))
			for _, ep := range endpoints {
				namespaces = append(namespaces, ep.Namespace)
			}
			log.Info("broker endpoints discovered, using broker for operation events", "count", len(endpoints), "namespaces", namespaces)
			operationEmitter = brokereventing.NewBrokerEventEmitter(endpoints)
		default:
			log.Info("no broker endpoints found, using Kubernetes events for operations")
		}
	}

	return &Provider{
		modelRecorder:           recorders.NewModelRecorder(k8sEmitter, operationEmitter),
		a2aRecorder:             recorders.NewA2aRecorder(k8sEmitter, operationEmitter),
		agentRecorder:           recorders.NewAgentRecorder(k8sEmitter, operationEmitter),
		teamRecorder:            recorders.NewTeamRecorder(k8sEmitter, operationEmitter),
		executionEngineRecorder: recorders.NewExecutionEngineRecorder(k8sEmitter, operationEmitter),
		mcpServerRecorder:       recorders.NewMCPServerRecorder(k8sEmitter),
		queryRecorder:           recorders.NewQueryRecorder(k8sEmitter, operationEmitter),
		toolRecorder:            recorders.NewToolRecorder(k8sEmitter, operationEmitter),
		memoryRecorder:          recorders.NewMemoryRecorder(k8sEmitter, operationEmitter),
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
