package validation

import (
	"encoding/json"
	"fmt"
	"net/url"

	"github.com/google/jsonschema-go/jsonschema"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/genai"
)

func ValidateTool(tool *arkv1alpha1.Tool) ([]string, error) {
	if tool.Spec.InputSchema != nil {
		if err := validateInputSchema(tool.Spec.InputSchema.Raw); err != nil {
			return nil, fmt.Errorf("invalid inputSchema: %v", err)
		}
	}

	switch tool.Spec.Type {
	case genai.ToolTypeHTTP:
		return validateHTTP(tool.Spec.HTTP)
	case genai.ToolTypeMCP:
		return validateMCPTool(tool.Spec.MCP)
	case genai.ToolTypeAgent:
		return validateAgentToolRef(tool.Spec.Agent.Name)
	case genai.ToolTypeTeam:
		return validateTeamToolRef(tool.Spec.Team.Name)
	case genai.ToolTypeBuiltin:
		return validateBuiltinTool(tool.Name)
	default:
		return nil, fmt.Errorf("unsupported tool type '%s': supported types are: http, mcp, agent, team, builtin", tool.Spec.Type)
	}
}

func validateHTTP(httpSpec *arkv1alpha1.HTTPSpec) ([]string, error) {
	if httpSpec == nil {
		return nil, fmt.Errorf("http spec is required for http type")
	}
	if httpSpec.URL == "" {
		return nil, fmt.Errorf("URL is required for http tool")
	}
	if _, err := url.Parse(httpSpec.URL); err != nil {
		return nil, fmt.Errorf("invalid URL format: %v", err)
	}
	if httpSpec.Method != "" {
		validMethods := map[string]bool{
			"GET": true, "POST": true, "PUT": true, "DELETE": true,
			"HEAD": true, "OPTIONS": true, "PATCH": true,
		}
		if !validMethods[httpSpec.Method] {
			return nil, fmt.Errorf("invalid HTTP method '%s': supported methods are GET, POST, PUT, DELETE, HEAD, OPTIONS, PATCH", httpSpec.Method)
		}
	}
	return nil, nil
}

func validateMCPTool(mcp *arkv1alpha1.MCPToolRef) ([]string, error) {
	if mcp == nil {
		return nil, fmt.Errorf("MCP spec is required for mcp type")
	}
	if mcp.MCPServerRef.Name == "" {
		return nil, fmt.Errorf("MCP server name is required")
	}
	if mcp.ToolName == "" {
		return nil, fmt.Errorf("MCP tool name is required")
	}
	return nil, nil
}

func validateAgentToolRef(agent string) ([]string, error) {
	if agent == "" {
		return nil, fmt.Errorf("agent field is required for agent type")
	}
	return nil, nil
}

func validateTeamToolRef(team string) ([]string, error) {
	if team == "" {
		return nil, fmt.Errorf("team field is required for team type")
	}
	return nil, nil
}

func validateBuiltinTool(toolName string) ([]string, error) {
	supportedBuiltinTools := []string{genai.BuiltinToolNoop, genai.BuiltinToolTerminate}
	for _, supportedTool := range supportedBuiltinTools {
		if toolName == supportedTool {
			return nil, nil
		}
	}
	return nil, fmt.Errorf("unsupported builtin tool '%s': supported builtin tools are: %v", toolName, supportedBuiltinTools)
}

func validateInputSchema(inputSchema json.RawMessage) error {
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
			if err := validateInputSchema(propBytes); err != nil {
				return fmt.Errorf("invalid property '%s' schema: %v", propName, err)
			}
		}
	}
	return nil
}
