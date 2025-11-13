package genai

// Common string constants
const (
	TrueString = "true"
)

// Model type constants
const (
	ModelTypeAzure   = "azure"
	ModelTypeOpenAI  = "openai"
	ModelTypeBedrock = "bedrock"
)

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

// Tool type constants
const (
	ToolTypeHTTP    = "http"
	ToolTypeMCP     = "mcp"
	ToolTypeAgent   = "agent"
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
