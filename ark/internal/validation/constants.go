package validation

const (
	ProviderAzure     = "azure"
	ProviderOpenAI    = "openai"
	ProviderBedrock   = "bedrock"
	ProviderAnthropic = "anthropic"
)

const (
	ModelTypeCompletions = "completions"
)

func IsDeprecatedProviderInType(typeValue string) bool {
	return typeValue == ProviderOpenAI || typeValue == ProviderAzure || typeValue == ProviderBedrock
}

const (
	ToolTypeHTTP    = "http"
	ToolTypeMCP     = "mcp"
	ToolTypeAgent   = "agent"
	ToolTypeTeam    = "team"
	ToolTypeBuiltin = "builtin"
)

// AgentToolTypeBuiltIn is the agent-tool type for tools with no Tool CRD
// (noop, terminate). Distinct from ToolTypeBuiltin, which is a Tool CRD type.
const AgentToolTypeBuiltIn = "built-in"

const (
	BuiltinToolNoop      = "noop"
	BuiltinToolTerminate = "terminate"
)
