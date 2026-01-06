/* Copyright 2025. McKinsey & Company */

package v1

import (
	"context"
	"fmt"

	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/webhook"
	"sigs.k8s.io/controller-runtime/pkg/webhook/admission"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
)

// SetupAgentWebhookWithManager registers the webhook for Agent in the manager.
func SetupAgentWebhookWithManager(mgr ctrl.Manager) error {
	return ctrl.NewWebhookManagedBy(mgr).For(&arkv1alpha1.Agent{}).
		WithDefaulter(&AgentCustomDefaulter{}).
		WithValidator(&AgentCustomValidator{ResourceValidator: &ResourceValidator{Client: mgr.GetClient()}}).
		Complete()
}

// +kubebuilder:webhook:path=/mutate-ark-mckinsey-com-v1alpha1-agent,mutating=true,failurePolicy=fail,sideEffects=None,groups=ark.mckinsey.com,resources=agents,verbs=create;update,versions=v1alpha1,name=magent-v1.kb.io,admissionReviewVersions=v1

type AgentCustomDefaulter struct{}

var _ webhook.CustomDefaulter = &AgentCustomDefaulter{}

func (d *AgentCustomDefaulter) Default(ctx context.Context, obj runtime.Object) error {
	agent, ok := obj.(*arkv1alpha1.Agent)
	if !ok {
		return fmt.Errorf("expected an Agent object but got %T", obj)
	}

	_, isA2A := agent.Annotations[annotations.A2AServerName]
	hasModel := agent.Spec.ModelRef != nil

	// Set default model for non-A2A agents
	// A2A agents are identified by the presence of the a2a-server-name annotation
	// For upgrade details, see docs/content/reference/upgrading.mdx
	if !hasModel && !isA2A {
		agent.Spec.ModelRef = &arkv1alpha1.AgentModelRef{
			Name: "default",
		}
	}

	// Add deprecation warning for 'custom' tool type
	for _, tool := range agent.Spec.Tools {
		if tool.Type == "custom" {
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

	return nil
}

// +kubebuilder:webhook:path=/validate-ark-mckinsey-com-v1alpha1-agent,mutating=false,failurePolicy=fail,sideEffects=None,groups=ark.mckinsey.com,resources=agents,verbs=create;update,versions=v1alpha1,name=vagent-v1.kb.io,admissionReviewVersions=v1

type AgentCustomValidator struct {
	*ResourceValidator
}

var _ webhook.CustomValidator = &AgentCustomValidator{}

func (v *AgentCustomValidator) ValidateCreate(ctx context.Context, obj runtime.Object) (admission.Warnings, error) {
	agent, ok := obj.(*arkv1alpha1.Agent)
	if !ok {
		return nil, fmt.Errorf("expected a Agent object but got %T", obj)
	}

	return v.validateAgent(ctx, agent)
}

func (v *AgentCustomValidator) ValidateUpdate(ctx context.Context, oldObj, newObj runtime.Object) (admission.Warnings, error) {
	agent, ok := newObj.(*arkv1alpha1.Agent)
	if !ok {
		return nil, fmt.Errorf("expected a Agent object for the newObj but got %T", newObj)
	}
	return v.validateAgent(ctx, agent)
}

func (v *AgentCustomValidator) ValidateDelete(ctx context.Context, obj runtime.Object) (admission.Warnings, error) {
	_, ok := obj.(*arkv1alpha1.Agent)
	if !ok {
		return nil, fmt.Errorf("expected a Agent object but got %T", obj)
	}

	return nil, nil
}

func (v *AgentCustomValidator) validateAgent(ctx context.Context, agent *arkv1alpha1.Agent) (admission.Warnings, error) {
	var warnings admission.Warnings

	if err := v.validateAgentModel(ctx, agent); err != nil {
		return warnings, err
	}

	if err := v.ValidateParameters(ctx, agent.Namespace, agent.Spec.Parameters); err != nil {
		return warnings, err
	}

	if err := v.ValidateOverrides(agent.Spec.Overrides); err != nil {
		return warnings, err
	}

	for i, tool := range agent.Spec.Tools {
		toolWarnings, err := v.validateTool(i, tool)
		if err != nil {
			return warnings, err
		}
		warnings = append(warnings, toolWarnings...)
	}

	// Collect migration warnings (e.g., deprecated 'custom' tool type)
	warnings = append(warnings, collectMigrationWarnings(agent.Annotations)...)

	return warnings, nil
}

func (v *AgentCustomValidator) validateAgentModel(ctx context.Context, agent *arkv1alpha1.Agent) error {
	// Model validation is now handled at runtime via status conditions
	// Agents without valid models will show as Available: False
	// This allows for eventual consistency when models are created after agents
	return nil
}

func (v *AgentCustomValidator) validateBuiltInTool(tool arkv1alpha1.AgentTool, hasName bool, index int) error {
	if !hasName {
		return fmt.Errorf("tool[%d]: built-in tools must specify a name", index)
	}
	if !isValidBuiltInTool(tool.Name) {
		return fmt.Errorf("tool[%d]: unsupported built-in tool '%s': supported built-in tools are: noop, terminate", index, tool.Name)
	}
	return nil
}

func (v *AgentCustomValidator) validateCustomTool(tool arkv1alpha1.AgentTool, hasName bool, index int) (admission.Warnings, error) {
	var warnings admission.Warnings

	if !hasName {
		return warnings, fmt.Errorf("tool[%d]: %s tools must specify a name", index, tool.Type)
	}

	// Custom tools are validated at runtime by the controller
	// Allow creation to proceed without checking if tool exists
	return warnings, nil
}

func (v *AgentCustomValidator) validateTool(index int, tool arkv1alpha1.AgentTool) (admission.Warnings, error) {
	var warnings admission.Warnings
	hasName := tool.Name != ""

	switch tool.Type {
	case "built-in":
		if err := v.validateBuiltInTool(tool, hasName, index); err != nil {
			return warnings, err
		}
	case "custom", "mcp", "http", "agent", "team", "builtin":
		return v.validateCustomTool(tool, hasName, index)
	default:
		return warnings, fmt.Errorf("tool[%d]: unsupported tool type '%s': supported types are: built-in, mcp, http, agent, team, builtin", index, tool.Type)
	}

	return warnings, nil
}

func isValidBuiltInTool(name string) bool {
	validBuiltInTools := map[string]bool{
		"noop":      true,
		"terminate": true,
	}
	return validBuiltInTools[name]
}
