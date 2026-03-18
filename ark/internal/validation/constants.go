package validation

const (
	ProviderAzure   = "azure"
	ProviderOpenAI  = "openai"
	ProviderBedrock = "bedrock"
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

const (
	BuiltinToolNoop      = "noop"
	BuiltinToolTerminate = "terminate"
)
