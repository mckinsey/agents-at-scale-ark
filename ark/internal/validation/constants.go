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

// DefaultModelName is the model an agent is bound to when it does not name one.
const DefaultModelName = "default"

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

const (
	BuiltinToolNoop      = "noop"
	BuiltinToolTerminate = "terminate"
)
