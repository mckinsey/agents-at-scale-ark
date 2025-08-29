package genai

// Model type constants
const (
	ModelTypeAzure   = "azure"
	ModelTypeOpenAI  = "openai"
	ModelTypeBedrock = "bedrock"
)

// Tool type constants
const (
	ToolTypeHTTP = "http"
	ToolTypeMCP  = "mcp"
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
