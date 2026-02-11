package genai

// Common string constants
const (
	TrueString = "true"
)

// Provider constants - specifies which AI provider client to use.
const (
	ProviderAzure   = "azure"
	ProviderOpenAI  = "openai"
	ProviderBedrock = "bedrock"
)

// Model type constants - specifies the API capability of the model.
// New types can be added in the future (e.g., embeddings, responses).
// See: https://github.com/mckinsey/agents-at-scale-ark/issues/37
const (
	ModelTypeCompletions = "completions"
)

// Deprecated: Ark < 0.50 used spec.type for provider selection.
// Use Provider* constants instead. Will be removed in release 1.0.
const (
	ModelTypeAzure   = ProviderAzure
	ModelTypeOpenAI  = ProviderOpenAI
	ModelTypeBedrock = ProviderBedrock
)

// IsDeprecatedProviderInType returns true if the type value is a provider name.
// Deprecated format (spec.type as provider) will be removed in release 1.0.
func IsDeprecatedProviderInType(typeValue string) bool {
	return typeValue == ProviderOpenAI || typeValue == ProviderAzure || typeValue == ProviderBedrock
}

// Agent tool type constants
const (
	AgentToolTypeBuiltIn = "built-in"
	AgentToolTypeCustom  = "custom"
)

// Role constants for execution engine messages
const (
	RoleUser      = "user"
	RoleAssistant = "assistant"
	RoleSystem    = "system"
	RoleTool      = "tool"
)

const (
	MetadataRoleKey       = "ark.mckinsey.com/role"
	MetadataToolCallIDKey = "ark.mckinsey.com/tool-call-id"
	MetadataToolNameKey   = "ark.mckinsey.com/tool-name"
	MetadataToolCallsKey  = "ark.mckinsey.com/tool-calls"
	MetadataAgentNameKey  = "ark.mckinsey.com/agent-name"
	MetadataA2AResultKey  = "ark.mckinsey.com/a2a-result"
)

const (
	A2APayloadModeCompat = "compat"
	A2APayloadModeNative = "native-a2a"
)

// Tool type constants
const (
	ToolTypeHTTP    = "http"
	ToolTypeMCP     = "mcp"
	ToolTypeAgent   = "agent"
	ToolTypeTeam    = "team"
	ToolTypeBuiltin = "builtin"
)

// Team member type constants
const (
	MemberTypeAgent = "agent"
)

// Built-in tool name constants
const (
	BuiltinToolNoop      = "noop"
	BuiltinToolTerminate = "terminate"
)
