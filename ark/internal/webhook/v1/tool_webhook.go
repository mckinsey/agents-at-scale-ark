/* Copyright 2025. McKinsey & Company */

package v1

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"

	"github.com/google/jsonschema-go/jsonschema"
	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"sigs.k8s.io/controller-runtime/pkg/webhook"
	"sigs.k8s.io/controller-runtime/pkg/webhook/admission"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/genai"
)

// nolint:unused
var log = logf.Log

// SetupToolWebhookWithManager registers the webhook for Tool in the manager.
func SetupToolWebhookWithManager(mgr ctrl.Manager) error {
	return ctrl.NewWebhookManagedBy(mgr).For(&arkv1alpha1.Tool{}).
		WithValidator(&ToolCustomValidator{}).
		Complete()
}

// +kubebuilder:webhook:path=/validate-ark-mckinsey-com-v1alpha1-tool,mutating=false,failurePolicy=fail,sideEffects=None,groups=ark.mckinsey.com,resources=tools,verbs=create;update,versions=v1alpha1,name=vtool-v1.kb.io,admissionReviewVersions=v1

type ToolCustomValidator struct{}

var _ webhook.CustomValidator = &ToolCustomValidator{}

func (v *ToolCustomValidator) ValidateCreate(ctx context.Context, obj runtime.Object) (admission.Warnings, error) {
	tool, ok := obj.(*arkv1alpha1.Tool)
	if !ok {
		return nil, fmt.Errorf("expected a Tool object but got %T", obj)
	}

	return v.validateTool(ctx, tool)
}

func (v *ToolCustomValidator) ValidateUpdate(ctx context.Context, oldObj, newObj runtime.Object) (admission.Warnings, error) {
	tool, ok := newObj.(*arkv1alpha1.Tool)
	if !ok {
		return nil, fmt.Errorf("expected a Tool object for the newObj but got %T", newObj)
	}

	return v.validateTool(ctx, tool)
}

func (v *ToolCustomValidator) ValidateDelete(ctx context.Context, obj runtime.Object) (admission.Warnings, error) {
	_, ok := obj.(*arkv1alpha1.Tool)
	if !ok {
		return nil, fmt.Errorf("expected a Tool object but got %T", obj)
	}

	return nil, nil
}

func (v *ToolCustomValidator) validateTool(_ context.Context, tool *arkv1alpha1.Tool) (admission.Warnings, error) {
	var warnings admission.Warnings

	// Validate inputSchema if present
	if tool.Spec.InputSchema != nil {
		if err := v.validateInputSchema(tool.Spec.InputSchema.Raw); err != nil {
			return warnings, fmt.Errorf("invalid inputSchema: %v", err)
		}
	}

	switch tool.Spec.Type {
	case genai.ToolTypeHTTP:
		return v.validateHTTP(tool.Spec.HTTP)
	case genai.ToolTypeMCP:
		return v.validateMCPTool(tool.Spec.MCP)
	case genai.ToolTypeAgent:
		return v.validateAgentTool(tool.Spec.Agent.Name)
	case genai.ToolTypeTeam:
		return v.validateTeamTool(tool.Spec.Team.Name)
	case genai.ToolTypeBuiltin:
		return v.validateBuiltinTool(tool.Name)
	default:
		return warnings, fmt.Errorf("unsupported tool type '%s': supported types are: http, mcp, agent, team, builtin", tool.Spec.Type)
	}
}

// validateHTTP validates HTTP-specific configuration
func (v *ToolCustomValidator) validateHTTP(httpSpec *arkv1alpha1.HTTPSpec) (admission.Warnings, error) {
	var warnings admission.Warnings

	if httpSpec == nil {
		return warnings, fmt.Errorf("http spec is required for http type")
	}

	if httpSpec.URL == "" {
		return warnings, fmt.Errorf("URL is required for http tool")
	}

	if _, err := url.Parse(httpSpec.URL); err != nil {
		return warnings, fmt.Errorf("invalid URL format: %v", err)
	}

	if httpSpec.Method != "" {
		validMethods := map[string]bool{
			"GET": true, "POST": true, "PUT": true, "DELETE": true,
			"HEAD": true, "OPTIONS": true, "PATCH": true,
		}
		if !validMethods[httpSpec.Method] {
			return warnings, fmt.Errorf("invalid HTTP method '%s': supported methods are GET, POST, PUT, DELETE, HEAD, OPTIONS, PATCH", httpSpec.Method)
		}
	}

	return warnings, nil
}

// validateMCPTool validates MCP-specific configuration
func (v *ToolCustomValidator) validateMCPTool(mcp *arkv1alpha1.MCPToolRef) (admission.Warnings, error) {
	var warnings admission.Warnings

	if mcp == nil {
		return warnings, fmt.Errorf("MCP spec is required for mcp type")
	}

	if mcp.MCPServerRef.Name == "" {
		return warnings, fmt.Errorf("MCP server name is required")
	}

	if mcp.ToolName == "" {
		return warnings, fmt.Errorf("MCP tool name is required")
	}

	return warnings, nil
}

// validateAgentTool validates Agent-specific configuration
func (v *ToolCustomValidator) validateAgentTool(agent string) (admission.Warnings, error) {
	var warnings admission.Warnings
	if agent == "" {
		return warnings, fmt.Errorf("agent field is required for agent type")
	}

	return warnings, nil
}

// validateTeamTool validates Team-specific configuration
func (v *ToolCustomValidator) validateTeamTool(team string) (admission.Warnings, error) {
	var warnings admission.Warnings
	if team == "" {
		return warnings, fmt.Errorf("team field is required for team type")
	}

	return warnings, nil
}

// validateBuiltinTool validates Builtin-specific configuration
func (v *ToolCustomValidator) validateBuiltinTool(toolName string) (admission.Warnings, error) {
	var warnings admission.Warnings

	supportedBuiltinTools := []string{genai.BuiltinToolNoop, genai.BuiltinToolTerminate}
	for _, supportedTool := range supportedBuiltinTools {
		if toolName == supportedTool {
			return warnings, nil
		}
	}

	return warnings, fmt.Errorf("unsupported builtin tool '%s': supported builtin tools are: %v", toolName, supportedBuiltinTools)
}

// validateInputSchema validates the tool's inputSchema using jsonschema
func (v *ToolCustomValidator) validateInputSchema(inputSchema json.RawMessage) error {
	// Parse the JSON schema
	var schema jsonschema.Schema
	if err := json.Unmarshal(inputSchema, &schema); err != nil {
		return fmt.Errorf("failed to parse inputSchema as JSON: %v", err)
	}

	// Validate that it's a valid JSON schema structure
	// Basic validation - ensure it has required fields for a valid schema
	if schema.Type != "" {
		validTypes := map[string]bool{
			"object": true, "array": true, "string": true, "number": true,
			"integer": true, "boolean": true, "null": true,
		}
		if !validTypes[schema.Type] {
			return fmt.Errorf("invalid schema type '%s': must be one of object, array, string, number, integer, boolean, null", schema.Type)
		}
	}

	// If type is "object", validate properties structure
	if schema.Type == "object" && schema.Properties != nil {
		for propName, propSchema := range schema.Properties {
			if propName == "" {
				return fmt.Errorf("property name cannot be empty")
			}
			// Recursively validate property schemas
			propBytes, err := json.Marshal(propSchema)
			if err != nil {
				return fmt.Errorf("failed to marshal property '%s' schema: %v", propName, err)
			}
			if err := v.validateInputSchema(propBytes); err != nil {
				return fmt.Errorf("invalid property '%s' schema: %v", propName, err)
			}
		}
	}

	return nil
}
