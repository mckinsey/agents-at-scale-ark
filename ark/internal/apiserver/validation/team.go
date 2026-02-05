package validation

import (
	"context"
	"fmt"

	"k8s.io/apimachinery/pkg/runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/genai"
)

const (
	MemberTypeAgent  = "agent"
	MemberTypeTeam   = "team"
	StrategySelector = "selector"
)

type TeamValidator struct {
	*StorageValidator
}

func NewTeamValidator(sv *StorageValidator) *TeamValidator {
	return &TeamValidator{StorageValidator: sv}
}

func (v *TeamValidator) ValidateCreate(ctx context.Context, obj runtime.Object) error {
	team, ok := obj.(*arkv1alpha1.Team)
	if !ok {
		return fmt.Errorf("expected a Team object but got %T", obj)
	}
	return v.validateTeam(ctx, team)
}

func (v *TeamValidator) ValidateUpdate(ctx context.Context, oldObj, newObj runtime.Object) error {
	team, ok := newObj.(*arkv1alpha1.Team)
	if !ok {
		return fmt.Errorf("expected a Team object but got %T", newObj)
	}
	return v.validateTeam(ctx, team)
}

func (v *TeamValidator) ValidateDelete(ctx context.Context, obj runtime.Object) error {
	return nil
}

func (v *TeamValidator) validateTeam(ctx context.Context, team *arkv1alpha1.Team) error {
	if err := v.validateStrategy(ctx, team); err != nil {
		return err
	}

	for i, member := range team.Spec.Members {
		if member.Name == team.Name {
			return fmt.Errorf("team member %d: team '%s' cannot reference itself", i, member.Name)
		}

		switch member.Type {
		case MemberTypeAgent:
			if err := v.ValidateAgentExists(ctx, member.Name, team.Namespace); err != nil {
				return fmt.Errorf("team member %d references %s: %v", i, member.Type, err)
			}
		case MemberTypeTeam:
			if err := v.ValidateTeamExists(ctx, member.Name, team.Namespace); err != nil {
				return fmt.Errorf("team member %d references %s: %v", i, member.Type, err)
			}
		default:
			return fmt.Errorf("team member %d has invalid type '%s': must be '%s' or '%s'", i, member.Type, MemberTypeAgent, MemberTypeTeam)
		}
	}

	if err := v.validateNoMixedTeam(ctx, team); err != nil {
		return err
	}

	return nil
}

func (v *TeamValidator) validateNoMixedTeam(ctx context.Context, team *arkv1alpha1.Team) error {
	var hasInternalAgents, hasExternalAgents bool

	for i, member := range team.Spec.Members {
		if member.Type != MemberTypeAgent {
			continue
		}
		agent, err := v.GetAgent(ctx, member.Name, team.Namespace)
		if err != nil {
			return fmt.Errorf("team member %d: failed to load agent '%s': %v", i, member.Name, err)
		}
		isExternal := agent.Spec.ExecutionEngine != nil &&
			agent.Spec.ExecutionEngine.Name != "" &&
			agent.Spec.ExecutionEngine.Name != genai.ExecutionEngineA2A
		if isExternal {
			hasExternalAgents = true
		} else {
			hasInternalAgents = true
		}
		if hasInternalAgents && hasExternalAgents {
			return fmt.Errorf("mixed teams are not allowed: team contains both internal and external agents. Team member %d: agent '%s' uses external execution engine '%s'",
				i, member.Name, agent.Spec.ExecutionEngine.Name)
		}
	}
	return nil
}

func (v *TeamValidator) validateStrategy(ctx context.Context, team *arkv1alpha1.Team) error {
	switch team.Spec.Strategy {
	case "sequential", "round-robin":
		return nil
	case StrategySelector:
		if err := v.validateSelectorAgent(ctx, team); err != nil {
			return err
		}
		if team.Spec.Graph != nil {
			return v.validateGraphForSelector(team)
		}
		return nil
	case "graph":
		return v.validateGraphStrategy(team)
	default:
		return fmt.Errorf("unsupported strategy '%s': must be 'sequential', 'round-robin', 'selector', or 'graph'", team.Spec.Strategy)
	}
}

func (v *TeamValidator) validateSelectorAgent(ctx context.Context, team *arkv1alpha1.Team) error {
	if team.Spec.Selector == nil || team.Spec.Selector.Agent == "" {
		return fmt.Errorf("selector strategy requires selector.agent to be specified")
	}

	if err := v.ValidateAgentExists(ctx, team.Spec.Selector.Agent, team.Namespace); err != nil {
		return fmt.Errorf("selector agent '%s' not found in namespace %s: %v", team.Spec.Selector.Agent, team.Namespace, err)
	}

	return nil
}

func (v *TeamValidator) validateGraphStrategy(team *arkv1alpha1.Team) error {
	if team.Spec.Graph == nil {
		return fmt.Errorf("graph strategy requires graph configuration")
	}

	if len(team.Spec.Graph.Edges) == 0 {
		return fmt.Errorf("graph strategy requires at least one edge")
	}

	memberNames := make(map[string]bool)
	for _, member := range team.Spec.Members {
		memberNames[member.Name] = true
	}

	transitionMap := make(map[string]bool)
	for i, edge := range team.Spec.Graph.Edges {
		if !memberNames[edge.From] {
			return fmt.Errorf("graph edge %d: 'from' member '%s' not found in team members", i, edge.From)
		}
		if !memberNames[edge.To] {
			return fmt.Errorf("graph edge %d: 'to' member '%s' not found in team members", i, edge.To)
		}
		if _, exists := transitionMap[edge.From]; exists {
			return fmt.Errorf("member '%s' has more than one outgoing edge", edge.From)
		}
		transitionMap[edge.From] = true
	}

	if team.Spec.MaxTurns == nil {
		return fmt.Errorf("graph strategy requires maxTurns to prevent infinite execution")
	}

	return nil
}

func (v *TeamValidator) validateGraphForSelector(team *arkv1alpha1.Team) error {
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
