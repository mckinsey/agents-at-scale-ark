package validation

import (
	"context"
	"fmt"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

const (
	MemberTypeAgent    = "agent"
	MemberTypeTeam     = "team"
	StrategySequential = "sequential"
	StrategyRoundRobin = "round-robin"
	StrategySelector   = "selector"
	StrategyGraph      = "graph"
)

func (v *Validator) ValidateTeam(ctx context.Context, team *arkv1alpha1.Team) ([]string, error) {
	if err := v.validateStrategy(ctx, team); err != nil {
		return nil, err
	}

	for i, member := range team.Spec.Members {
		if member.Name == team.Name {
			return nil, fmt.Errorf("team member %d: team '%s' cannot reference itself", i, member.Name)
		}
		switch member.Type {
		case MemberTypeAgent:
			if err := v.ResourceExists(ctx, "Agent", team.Namespace, member.Name); err != nil {
				return nil, fmt.Errorf("team member %d references %s: %v", i, member.Type, err)
			}
		case MemberTypeTeam:
			if err := v.ResourceExists(ctx, "Team", team.Namespace, member.Name); err != nil {
				return nil, fmt.Errorf("team member %d references %s: %v", i, member.Type, err)
			}
		default:
			return nil, fmt.Errorf("team member %d has invalid type '%s': must be '%s' or '%s'", i, member.Type, MemberTypeAgent, MemberTypeTeam)
		}
	}

	return CollectMigrationWarnings(team.Annotations), nil
}

func (v *Validator) validateStrategy(ctx context.Context, team *arkv1alpha1.Team) error {
	switch team.Spec.Strategy {
	case StrategySequential:
		return validateSequentialStrategy(team)
	case StrategyRoundRobin:
		return nil
	case StrategySelector:
		if team.Spec.Loops != nil && *team.Spec.Loops {
			return fmt.Errorf("loops can only be used with the 'sequential' strategy")
		}
		if err := v.validateSelectorAgent(ctx, team); err != nil {
			return err
		}
		if team.Spec.MaxTurns == nil {
			return fmt.Errorf("selector strategy requires maxTurns to prevent infinite execution")
		}
		if team.Spec.Graph != nil {
			return validateGraphForSelector(team)
		}
		return nil
	default:
		return fmt.Errorf("unsupported strategy '%s': must be '%s', '%s', or '%s'", team.Spec.Strategy, StrategySequential, StrategyRoundRobin, StrategySelector)
	}
}

func validateSequentialStrategy(team *arkv1alpha1.Team) error {
	loopsEnabled := team.Spec.Loops != nil && *team.Spec.Loops
	if loopsEnabled && team.Spec.MaxTurns == nil {
		return fmt.Errorf("maxTurns is required when loops is enabled")
	}
	if !loopsEnabled && team.Spec.MaxTurns != nil {
		return fmt.Errorf("maxTurns can only be set when loops is enabled")
	}
	return nil
}

func (v *Validator) validateSelectorAgent(ctx context.Context, team *arkv1alpha1.Team) error {
	if team.Spec.Selector == nil || team.Spec.Selector.Agent == "" {
		return fmt.Errorf("selector strategy requires selector.agent to be specified")
	}
	if err := v.ResourceExists(ctx, "Agent", team.Namespace, team.Spec.Selector.Agent); err != nil {
		return fmt.Errorf("selector agent '%s' not found in namespace %s: %v", team.Spec.Selector.Agent, team.Namespace, err)
	}
	return nil
}

func validateGraphForSelector(team *arkv1alpha1.Team) error {
	if team.Spec.Graph == nil {
		return fmt.Errorf("graph constraint requires graph configuration")
	}
	if len(team.Spec.Graph.Edges) == 0 {
		return fmt.Errorf("graph constraint requires at least one edge")
	}

	memberNames := make(map[string]bool)
	for _, member := range team.Spec.Members {
		memberNames[member.Name] = true
	}

	for i, edge := range team.Spec.Graph.Edges {
		if !memberNames[edge.From] {
			return fmt.Errorf("graph edge %d: 'from' member '%s' not found in team members", i, edge.From)
		}
		if !memberNames[edge.To] {
			return fmt.Errorf("graph edge %d: 'to' member '%s' not found in team members", i, edge.To)
		}
	}

	return nil
}
