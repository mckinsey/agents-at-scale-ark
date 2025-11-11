/* Copyright 2025. McKinsey & Company */

package v1

import (
	"context"
	"fmt"

	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/webhook"
	"sigs.k8s.io/controller-runtime/pkg/webhook/admission"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/genai"
)

const (
	MemberTypeAgent  = "agent"
	MemberTypeTeam   = "team"
	StrategySelector = "selector"
)

func SetupTeamWebhookWithManager(mgr ctrl.Manager) error {
	return ctrl.NewWebhookManagedBy(mgr).For(&arkv1alpha1.Team{}).
		WithValidator(&TeamCustomValidator{ResourceValidator: &ResourceValidator{Client: mgr.GetClient()}}).
		Complete()
}

// +kubebuilder:webhook:path=/validate-ark-mckinsey-com-v1alpha1-team,mutating=false,failurePolicy=fail,sideEffects=None,groups=ark.mckinsey.com,resources=teams,verbs=create;update,versions=v1alpha1,name=vteam-v1.kb.io,admissionReviewVersions=v1

// TeamCustomValidator struct is responsible for validating the Team resource
// when it is created, updated, or deleted.
//
// NOTE: The +kubebuilder:object:generate=false marker prevents controller-gen from generating DeepCopy methods,
// as this struct is used only for temporary operations and does not need to be deeply copied.
type TeamCustomValidator struct {
	*ResourceValidator
}

var _ webhook.CustomValidator = &TeamCustomValidator{}

func (v *TeamCustomValidator) ValidateCreate(ctx context.Context, obj runtime.Object) (admission.Warnings, error) {
	team, ok := obj.(*arkv1alpha1.Team)
	if !ok {
		return nil, fmt.Errorf("expected a Team object but got %T", obj)
	}

	return v.validateTeamMembers(ctx, team)
}

func (v *TeamCustomValidator) ValidateUpdate(ctx context.Context, oldObj, newObj runtime.Object) (admission.Warnings, error) {
	team, ok := newObj.(*arkv1alpha1.Team)
	if !ok {
		return nil, fmt.Errorf("expected a Team object for the newObj but got %T", newObj)
	}

	return v.validateTeamMembers(ctx, team)
}

func (v *TeamCustomValidator) ValidateDelete(ctx context.Context, obj runtime.Object) (admission.Warnings, error) {
	_, ok := obj.(*arkv1alpha1.Team)
	if !ok {
		return nil, fmt.Errorf("expected a Team object but got %T", obj)
	}

	return nil, nil
}

func (v *TeamCustomValidator) validateTeamMembers(ctx context.Context, team *arkv1alpha1.Team) (admission.Warnings, error) {
	var warnings admission.Warnings

	if err := v.validateStrategy(ctx, team); err != nil {
		return warnings, err
	}

	for i, member := range team.Spec.Members {
		if member.Name == team.Name {
			return warnings, fmt.Errorf("team member %d: team '%s' cannot reference itself", i, member.Name)
		}

		var err error
		switch member.Type {
		case MemberTypeAgent:
			err = v.ValidateLoadAgent(ctx, member.Name, team.Namespace)
			if err != nil {
				return warnings, fmt.Errorf("team member %d references %s: %v", i, member.Type, err)
			}
		case MemberTypeTeam:
			err = v.ValidateLoadTeam(ctx, member.Name, team.Namespace)
			if err != nil {
				return warnings, fmt.Errorf("team member %d references %s: %v", i, member.Type, err)
			}
		default:
			return warnings, fmt.Errorf("team member %d has invalid type '%s': must be '%s' or '%s'", i, member.Type, MemberTypeAgent, MemberTypeTeam)
		}
	}

	if err := v.validateNoMixedTeam(ctx, team); err != nil {
		return warnings, err
	}

	return warnings, nil
}

func (v *TeamCustomValidator) validateNoMixedTeam(ctx context.Context, team *arkv1alpha1.Team) error {
	var hasInternalAgents, hasExternalAgents bool

	for i, member := range team.Spec.Members {
		if member.Type != MemberTypeAgent {
			continue
		}
		var agent arkv1alpha1.Agent
		key := types.NamespacedName{Name: member.Name, Namespace: team.Namespace}
		if err := v.Client.Get(ctx, key, &agent); err != nil {
			return fmt.Errorf("team member %d: failed to load agent '%s': %v", i, member.Name, err)
		}
		isExternal := agent.Spec.ExecutionEngine != nil && agent.Spec.ExecutionEngine.Name != "" && agent.Spec.ExecutionEngine.Name != genai.ExecutionEngineA2A
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

func (v *TeamCustomValidator) validateStrategy(ctx context.Context, team *arkv1alpha1.Team) error {
	switch team.Spec.Strategy {
	case "sequential", "round-robin":
		return nil
	case StrategySelector:
		if err := v.validateSelectorAgent(ctx, team); err != nil {
			return err
		}
		// If graph is provided, validate it (allows multiple edges from same source for selector)
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

func (v *TeamCustomValidator) validateSelectorAgent(ctx context.Context, team *arkv1alpha1.Team) error {
	if team.Spec.Selector == nil || team.Spec.Selector.Agent == "" {
		return fmt.Errorf("selector strategy requires selector.agent to be specified")
	}

	agentName := team.Spec.Selector.Agent

	err := v.ValidateLoadAgent(ctx, agentName, team.Namespace)
	if err != nil {
		return fmt.Errorf("selector agent '%s' not found in namespace %s: %v", agentName, team.Namespace, err)
	}

	return nil
}

func (v *TeamCustomValidator) validateGraphStrategy(team *arkv1alpha1.Team) error {
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

func (v *TeamCustomValidator) validateGraphForSelector(team *arkv1alpha1.Team) error {
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

	// Validate edges reference valid members
	// Note: Unlike validateGraphStrategy, we allow multiple edges with same 'from'
	// because the selector agent will choose from multiple options
	for i, edge := range team.Spec.Graph.Edges {
		if !memberNames[edge.From] {
			return fmt.Errorf("graph edge %d: 'from' member '%s' not found in team members", i, edge.From)
		}
		if !memberNames[edge.To] {
			return fmt.Errorf("graph edge %d: 'to' member '%s' not found in team members", i, edge.To)
		}
	}

	// Note: maxTurns is optional for selector strategy (it handles termination differently)
	// But if provided, it's still validated by the team spec validation

	return nil
}
