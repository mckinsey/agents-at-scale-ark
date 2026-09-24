package validation

import (
	"encoding/json"
	"fmt"
	"net/url"
	"slices"
	"strings"

	"github.com/google/jsonschema-go/jsonschema"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

// MaxInlineSourceBytes bounds spec.inline.source. The CRD's maxLength counts
// characters, so the byte limit has to be enforced here as well.
const MaxInlineSourceBytes = 65536

var InlineLanguages = []string{"bash", "python", "node", "ts"}

func ValidateTool(tool *arkv1alpha1.Tool) ([]string, error) {
	if err := validateInlineExclusivity(&tool.Spec); err != nil {
		return nil, err
	}

	if tool.Spec.InputSchema != nil {
		if err := validateInputSchema(tool.Spec.InputSchema.Raw); err != nil {
			return nil, fmt.Errorf("invalid inputSchema: %v", err)
		}
	}

	if err := ValidateApprovalConfig(tool.Spec.Approval, ""); err != nil {
		return nil, err
	}

	switch tool.Spec.Type {
	case ToolTypeHTTP:
		return validateHTTP(tool.Spec.HTTP)
	case ToolTypeMCP:
		return validateMCPTool(tool.Spec.MCP)
	case ToolTypeAgent:
		return validateAgentToolRef(tool.Spec.Agent.Name)
	case ToolTypeTeam:
		return validateTeamToolRef(tool.Spec.Team.Name)
	case ToolTypeBuiltin:
		return validateBuiltinTool(tool.Name)
	case ToolTypeInline:
		return validateInlineTool(tool)
	default:
		return nil, fmt.Errorf("unsupported tool type '%s': supported types are: http, mcp, agent, team, builtin, inline", tool.Spec.Type)
	}
}

// ValidateToolTransition rejects updates that cross the inline/non-inline type
// boundary. Converting would leave the runner's owned children ambiguous, so v1
// requires delete and recreate.
func ValidateToolTransition(oldTool, newTool *arkv1alpha1.Tool) error {
	oldType, newType := oldTool.Spec.Type, newTool.Spec.Type
	if oldType == newType {
		return nil
	}
	if oldType != ToolTypeInline && newType != ToolTypeInline {
		return nil
	}
	return fmt.Errorf("cannot change tool type from '%s' to '%s': delete and recreate the tool instead", oldType, newType)
}

// validateInlineExclusivity keeps spec.inline and the other subtype blocks apart,
// in both directions.
func validateInlineExclusivity(spec *arkv1alpha1.ToolSpec) error {
	if spec.Type != ToolTypeInline {
		if spec.Inline != nil {
			return fmt.Errorf("spec.inline is only valid for inline type tools, not '%s'", spec.Type)
		}
		return nil
	}
	set := []struct {
		field string
		used  bool
	}{
		{"http", spec.HTTP != nil},
		{"mcp", spec.MCP != nil},
		{"agent", spec.Agent != nil},
		{"team", spec.Team != nil},
		{"builtin", spec.Builtin != nil},
	}
	for _, s := range set {
		if s.used {
			return fmt.Errorf("inline tools must not set spec.%s", s.field)
		}
	}
	return nil
}

func validateInlineTool(tool *arkv1alpha1.Tool) ([]string, error) {
	inline := tool.Spec.Inline
	if inline == nil {
		return nil, fmt.Errorf("inline spec is required for inline type")
	}
	if strings.TrimSpace(inline.Source) == "" {
		return nil, fmt.Errorf("inline source is required and must not be whitespace only")
	}
	if len(inline.Source) > MaxInlineSourceBytes {
		return nil, fmt.Errorf("inline source is %d UTF-8 bytes, exceeding the %d byte limit: use an MCPServer for larger tools", len(inline.Source), MaxInlineSourceBytes)
	}
	if inline.Language == "" {
		return nil, fmt.Errorf("inline language is required: supported languages are: %v", InlineLanguages)
	}
	if !slices.Contains(InlineLanguages, inline.Language) {
		return nil, fmt.Errorf("unsupported inline language '%s': supported languages are: %v", inline.Language, InlineLanguages)
	}
	if tool.Spec.InputSchema != nil {
		var schema jsonschema.Schema
		if err := json.Unmarshal(tool.Spec.InputSchema.Raw, &schema); err != nil {
			return nil, fmt.Errorf("invalid inputSchema: %v", err)
		}
		if schema.Type != "" && schema.Type != "object" {
			return nil, fmt.Errorf("inline inputSchema must describe a JSON object, got '%s'", schema.Type)
		}
	}
	return nil, nil
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
	supportedBuiltinTools := []string{BuiltinToolNoop, BuiltinToolTerminate}
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
