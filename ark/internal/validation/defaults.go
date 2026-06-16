package validation

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
	"mckinsey.com/ark/internal/resolution"
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
	loopsTrue := true
	loopsFalse := false

	switch team.Spec.Strategy {
	case StrategyRoundRobin:
		if team.Annotations == nil {
			team.Annotations = make(map[string]string)
		}

		if team.Spec.MaxTurns != nil {
			team.Spec.Strategy = StrategySequential
			team.Spec.Loops = &loopsTrue
			team.Annotations[annotations.MigrationWarningPrefix+"round-robin"] = "strategy 'round-robin' is deprecated - migrated to 'sequential' with loops: true. Will be removed in v1.0.0"
		} else {
			team.Spec.Strategy = StrategySequential
			team.Spec.Loops = &loopsFalse
			team.Annotations[annotations.MigrationWarningPrefix+"round-robin"] = "strategy 'round-robin' is deprecated - migrated to 'sequential'. Set loops: true and maxTurns to enable looping. Will be removed in v1.0.0"
		}

	case StrategySelector:
		if team.Spec.Selector != nil && team.Spec.Selector.SelectorPrompt != "" &&
			!strings.Contains(team.Spec.Selector.SelectorPrompt, "select-next-speaker") {
			if team.Annotations == nil {
				team.Annotations = make(map[string]string)
			}
			team.Annotations[annotations.MigrationWarningPrefix+"selector-prompt"] = "custom selectorPrompt should instruct the agent to use the select-next-speaker tool — add 'Use the select-next-speaker tool to make your selection.' to your selectorPrompt"
		}

	case StrategyGraph:
		if team.Annotations == nil {
			team.Annotations = make(map[string]string)
		}

		team.Spec.Strategy = StrategySequential
		team.Spec.Loops = &loopsFalse
		team.Spec.Graph = nil
		team.Spec.MaxTurns = nil
		team.Annotations[annotations.MigrationWarningPrefix+"graph"] = "strategy 'graph' is deprecated - migrated to 'sequential'. Graph edges have been discarded. Will be removed in v1.0.0"
	}
}

func DefaultQuery(ctx context.Context, query *arkv1alpha1.Query, lookup ArkConfigLookup) {
	if query.Spec.Type == "messages" {
		userText, err := resolution.ExtractFirstUserText(json.RawMessage(query.Spec.Input.Raw))
		if err != nil {
			userText = ""
		}

		query.Spec.Type = arkv1alpha1.QueryTypeUser
		_ = query.Spec.SetInputString(userText)

		if query.Annotations == nil {
			query.Annotations = make(map[string]string)
		}
		query.Annotations[annotations.MigrationWarningPrefix+"input-type"] = "spec.type 'messages' is deprecated - migrated to 'user' with extracted text. Use conversationId for multi-turn conversations"
	}

	if query.Spec.TTL == nil {
		ttl := ResolveQueryTTL(ctx, lookup)
		query.Spec.TTL = &ttl
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
