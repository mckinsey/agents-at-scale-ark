package validation

import (
	"fmt"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
)

const toolTypeCustom = "custom"

func DefaultAgent(agent *arkv1alpha1.Agent) {
	_, isA2A := agent.Annotations[annotations.A2AServerName]
	hasModel := agent.Spec.ModelRef != nil

	if !hasModel && !isA2A {
		agent.Spec.ModelRef = &arkv1alpha1.AgentModelRef{
			Name: "default",
		}
	}

	for _, tool := range agent.Spec.Tools {
		if tool.Type == toolTypeCustom {
			if agent.Annotations == nil {
				agent.Annotations = make(map[string]string)
			}
			agent.Annotations[annotations.MigrationWarningPrefix+"tool-type-custom"] = fmt.Sprintf(
				"agent '%s' tool '%s': type 'custom' is deprecated, use the tool's actual type (mcp, http, agent, team, builtin) instead",
				agent.Name,
				tool.Name,
			)
			break
		}
	}
}

func DefaultTeam(team *arkv1alpha1.Team) {
	if team.Spec.Strategy != StrategyRoundRobin {
		return
	}

	if team.Annotations == nil {
		team.Annotations = make(map[string]string)
	}

	if team.Spec.MaxTurns != nil {
		team.Spec.Strategy = StrategySequential
		team.Spec.Loops = true
		team.Annotations[annotations.MigrationWarningPrefix+"round-robin"] = "strategy 'round-robin' is deprecated - migrated to 'sequential' with loops: true. Will be removed in v1.0.0"
	} else {
		team.Spec.Strategy = StrategySequential
		team.Spec.Loops = false
		team.Annotations[annotations.MigrationWarningPrefix+"round-robin"] = "strategy 'round-robin' is deprecated - migrated to 'sequential'. Set loops: true and maxTurns to enable looping. Will be removed in v1.0.0"
	}
}

func DefaultModel(model *arkv1alpha1.Model) {
	if model.Spec.Provider == "" && IsDeprecatedProviderInType(model.Spec.Type) {
		originalType := model.Spec.Type
		model.Spec.Provider = model.Spec.Type
		model.Spec.Type = ModelTypeCompletions

		if model.Annotations == nil {
			model.Annotations = make(map[string]string)
		}
		model.Annotations[annotations.MigrationWarningPrefix+"provider"] = fmt.Sprintf(
			"spec.type is deprecated for provider values - migrated '%s' to spec.provider",
			originalType,
		)
	}
}
