package validation

import (
	"context"
	"fmt"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
)

func (v *Validator) ValidateAgent(ctx context.Context, agent *arkv1alpha1.Agent) ([]string, error) {
	var warnings []string

	if err := v.ValidateParameters(ctx, agent.Namespace, agent.Spec.Parameters); err != nil {
		return warnings, err
	}

	if err := ValidateOverrides(agent.Spec.Overrides); err != nil {
		return warnings, err
	}

	if err := ValidateUniqueHeaderNames(unselectedModelOverrideHeaders(agent.Spec.Overrides), "spec.overrides"); err != nil {
		return warnings, err
	}

	if err := validateUniqueMCPOverrideHeaderNames(agent.Spec.Overrides); err != nil {
		return warnings, err
	}

	for i, tool := range agent.Spec.Tools {
		if err := validateAgentTool(i, tool); err != nil {
			return warnings, err
		}
	}

	if warning := v.engineToolWarning(ctx, agent); warning != "" {
		warnings = append(warnings, warning)
	}

	warnings = append(warnings, CollectMigrationWarnings(agent.Annotations)...)
	return warnings, nil
}

func hasLabelSelector(selector *metav1.LabelSelector) bool {
	return selector != nil && (len(selector.MatchLabels) > 0 || len(selector.MatchExpressions) > 0)
}

func unselectedModelOverrideHeaders(overrides []arkv1alpha1.Override) []arkv1alpha1.Header {
	var headers []arkv1alpha1.Header
	for _, override := range overrides {
		if override.ResourceType != "model" || hasLabelSelector(override.LabelSelector) {
			continue
		}
		headers = append(headers, override.Headers...)
	}
	return headers
}

func validateUniqueMCPOverrideHeaderNames(overrides []arkv1alpha1.Override) error {
	headersByScope := make(map[string][]arkv1alpha1.Header)
	var scopes []string
	for _, override := range overrides {
		if override.ResourceType != "mcpserver" {
			continue
		}
		scope := "all servers"
		if hasLabelSelector(override.LabelSelector) {
			scope = metav1.FormatLabelSelector(override.LabelSelector)
		}
		if _, ok := headersByScope[scope]; !ok {
			scopes = append(scopes, scope)
		}
		headersByScope[scope] = append(headersByScope[scope], override.Headers...)
	}
	for _, scope := range scopes {
		if err := ValidateUniqueHeaderNames(headersByScope[scope], fmt.Sprintf("spec.overrides (mcpserver, %s)", scope)); err != nil {
			return err
		}
	}
	return nil
}

func (v *Validator) engineToolWarning(ctx context.Context, agent *arkv1alpha1.Agent) string {
	if !arka2a.IsNamedEngine(agent.Spec.ExecutionEngine) {
		return ""
	}

	dropped := make([]string, 0, len(agent.Spec.Tools))
	for _, tool := range agent.Spec.Tools {
		toolType := v.resolveAgentToolType(ctx, agent.Namespace, tool)
		if toolType == "" || toolType == ToolTypeMCP {
			continue
		}
		dropped = append(dropped, fmt.Sprintf("%s (%s)", tool.Name, toolType))
	}

	if len(dropped) == 0 {
		return ""
	}

	return fmt.Sprintf(
		"agent '%s': execution engine '%s' receives only mcp tools; these tools will not be available to the agent: %s",
		agent.Name,
		agent.Spec.ExecutionEngine.Name,
		strings.Join(dropped, ", "),
	)
}

func (v *Validator) resolveAgentToolType(ctx context.Context, namespace string, tool arkv1alpha1.AgentTool) string {
	if tool.Type != toolTypeCustom && tool.Type != toolTypeBuiltIn {
		return tool.Type
	}

	obj, err := v.Lookup.GetResource(ctx, "Tool", namespace, tool.GetToolCRDName())
	if err != nil {
		return ""
	}
	toolCRD, ok := obj.(*arkv1alpha1.Tool)
	if !ok {
		return ""
	}
	return toolCRD.Spec.Type
}

func validateAgentTool(index int, tool arkv1alpha1.AgentTool) error {
	hasName := tool.Name != ""

	switch tool.Type {
	case toolTypeBuiltIn:
		if !hasName {
			return fmt.Errorf("tool[%d]: built-in tools must specify a name", index)
		}
		if !isValidBuiltInTool(tool.Name) {
			return fmt.Errorf("tool[%d]: unsupported built-in tool '%s': supported built-in tools are: noop, terminate", index, tool.Name)
		}
		return nil
	case toolTypeCustom, "mcp", "http", "agent", "team", "builtin":
		if !hasName {
			return fmt.Errorf("tool[%d]: %s tools must specify a name", index, tool.Type)
		}
		if err := validateToolApprovalConfig(index, tool); err != nil {
			return err
		}
		return nil
	default:
		return fmt.Errorf("tool[%d]: unsupported tool type '%s': supported types are: built-in, mcp, http, agent, team, builtin", index, tool.Type)
	}
}

func validateToolApprovalConfig(index int, tool arkv1alpha1.AgentTool) error {
	return ValidateApprovalConfig(tool.Approval, fmt.Sprintf("tool[%d]: ", index))
}

func isValidBuiltInTool(name string) bool {
	return name == "noop" || name == "terminate"
}
