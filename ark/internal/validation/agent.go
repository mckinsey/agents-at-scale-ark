package validation

import (
	"context"
	"fmt"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
	"mckinsey.com/ark/internal/labels"
)

func (v *Validator) ValidateAgent(ctx context.Context, agent *arkv1alpha1.Agent) ([]string, error) {
	var warnings []string

	if err := v.validateCrossNamespaceRef(ctx, "Model", agentModelRefTarget(agent), agent.Namespace); err != nil {
		return warnings, err
	}

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

func selectedMCPServerName(selector *metav1.LabelSelector) string {
	if selector == nil || len(selector.MatchExpressions) > 0 || len(selector.MatchLabels) != 1 {
		return ""
	}
	return selector.MatchLabels[labels.NameLabel]
}

type mcpHeaderGroup struct {
	scope   string
	headers []arkv1alpha1.Header
}

func appendMCPHeaderGroup(groups []mcpHeaderGroup, scope string, headers []arkv1alpha1.Header) []mcpHeaderGroup {
	for i := range groups {
		if groups[i].scope == scope {
			groups[i].headers = append(groups[i].headers, headers...)
			return groups
		}
	}
	return append(groups, mcpHeaderGroup{scope: scope, headers: append([]arkv1alpha1.Header(nil), headers...)})
}

func validateUniqueMCPOverrideHeaderNames(overrides []arkv1alpha1.Override) error {
	var unscoped []arkv1alpha1.Header
	var servers, selectors []mcpHeaderGroup
	for _, override := range overrides {
		if override.ResourceType != "mcpserver" {
			continue
		}
		switch server := selectedMCPServerName(override.LabelSelector); {
		case !hasLabelSelector(override.LabelSelector):
			unscoped = append(unscoped, override.Headers...)
		case server != "":
			servers = appendMCPHeaderGroup(servers, fmt.Sprintf("%s=%s", labels.NameLabel, server), override.Headers)
		default:
			selectors = appendMCPHeaderGroup(selectors, metav1.FormatLabelSelector(override.LabelSelector), override.Headers)
		}
	}
	if err := ValidateUniqueHeaderNames(unscoped, "spec.overrides (mcpserver, all servers)"); err != nil {
		return err
	}
	for _, group := range servers {
		headers := append(append([]arkv1alpha1.Header(nil), unscoped...), group.headers...)
		if err := ValidateUniqueHeaderNames(headers, fmt.Sprintf("spec.overrides (mcpserver, %s)", group.scope)); err != nil {
			return err
		}
	}
	for _, group := range selectors {
		if err := ValidateUniqueHeaderNames(group.headers, fmt.Sprintf("spec.overrides (mcpserver, %s)", group.scope)); err != nil {
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
