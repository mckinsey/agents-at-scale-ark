package validation

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"

	"github.com/google/jsonschema-go/jsonschema"
	"k8s.io/apimachinery/pkg/runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/genai"
)

type ToolValidator struct {
	*StorageValidator
}

func NewToolValidator(sv *StorageValidator) *ToolValidator {
	return &ToolValidator{StorageValidator: sv}
}

func (v *ToolValidator) ValidateCreate(ctx context.Context, obj runtime.Object) error {
	tool, ok := obj.(*arkv1alpha1.Tool)
	if !ok {
		return fmt.Errorf("expected a Tool object but got %T", obj)
	}
	return v.validateTool(ctx, tool)
}

func (v *ToolValidator) ValidateUpdate(ctx context.Context, oldObj, newObj runtime.Object) error {
	tool, ok := newObj.(*arkv1alpha1.Tool)
	if !ok {
		return fmt.Errorf("expected a Tool object but got %T", newObj)
	}
	return v.validateTool(ctx, tool)
}

func (v *ToolValidator) ValidateDelete(ctx context.Context, obj runtime.Object) error {
	return nil
}

func (v *ToolValidator) validateTool(_ context.Context, tool *arkv1alpha1.Tool) error {
	if tool.Spec.InputSchema != nil {
		if err := v.validateInputSchema(tool.Spec.InputSchema.Raw); err != nil {
			return fmt.Errorf("invalid inputSchema: %v", err)
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
		return fmt.Errorf("unsupported tool type '%s': supported types are: http, mcp, agent, team, builtin", tool.Spec.Type)
	}
}

func (v *ToolValidator) validateHTTP(httpSpec *arkv1alpha1.HTTPSpec) error {
	if httpSpec == nil {
		return fmt.Errorf("http spec is required for http type")
	}

	if httpSpec.URL == "" {
		return fmt.Errorf("URL is required for http tool")
	}

	if _, err := url.Parse(httpSpec.URL); err != nil {
		return fmt.Errorf("invalid URL format: %v", err)
	}

	if httpSpec.Method != "" {
		validMethods := map[string]bool{
			"GET": true, "POST": true, "PUT": true, "DELETE": true,
			"HEAD": true, "OPTIONS": true, "PATCH": true,
		}
		if !validMethods[httpSpec.Method] {
			return fmt.Errorf("invalid HTTP method '%s': supported methods are GET, POST, PUT, DELETE, HEAD, OPTIONS, PATCH", httpSpec.Method)
		}
	}

	return nil
}

func (v *ToolValidator) validateMCPTool(mcp *arkv1alpha1.MCPToolRef) error {
	if mcp == nil {
		return fmt.Errorf("MCP spec is required for mcp type")
	}

	if mcp.MCPServerRef.Name == "" {
		return fmt.Errorf("MCP server name is required")
	}

	if mcp.ToolName == "" {
		return fmt.Errorf("MCP tool name is required")
	}

	return nil
}

func (v *ToolValidator) validateAgentTool(agent string) error {
	if agent == "" {
		return fmt.Errorf("agent field is required for agent type")
	}
	return nil
}

func (v *ToolValidator) validateTeamTool(team string) error {
	if team == "" {
		return fmt.Errorf("team field is required for team type")
	}
	return nil
}

func (v *ToolValidator) validateBuiltinTool(toolName string) error {
	supportedBuiltinTools := []string{genai.BuiltinToolNoop, genai.BuiltinToolTerminate}
	for _, supportedTool := range supportedBuiltinTools {
		if toolName == supportedTool {
			return nil
		}
	}
	return fmt.Errorf("unsupported builtin tool '%s': supported builtin tools are: %v", toolName, supportedBuiltinTools)
}

func (v *ToolValidator) validateInputSchema(inputSchema json.RawMessage) error {
	var schema jsonschema.Schema
	if err := json.Unmarshal(inputSchema, &schema); err != nil {
		return fmt.Errorf("failed to parse inputSchema as JSON: %v", err)
	}

	if schema.Type != "" {
		validTypes := map[string]bool{
			"object": true, "array": true, "string": true, "number": true,
			"integer": true, "boolean": true, "null": true,
		}
		if !validTypes[schema.Type] {
			return fmt.Errorf("invalid schema type '%s': must be one of object, array, string, number, integer, boolean, null", schema.Type)
		}
	}

	if schema.Type == "object" && schema.Properties != nil {
		for propName, propSchema := range schema.Properties {
			if propName == "" {
				return fmt.Errorf("property name cannot be empty")
			}
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
