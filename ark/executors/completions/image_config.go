package completions

const (
	toolImageMaxBytesEnv        = "ARK_TOOL_IMAGE_MAX_BYTES"
	toolImageMaxPerToolCallEnv  = "ARK_TOOL_IMAGE_MAX_PER_TOOL_CALL"
	toolImageMaxBytesPerTurnEnv = "ARK_TOOL_IMAGE_MAX_BYTES_PER_TURN"

	toolImageMaxBytesPerRequestEnv = "ARK_TOOL_IMAGE_MAX_BYTES_PER_REQUEST"

	defaultToolImageMaxBytes        = 5 * 1024 * 1024
	defaultToolImageMaxPerToolCall  = 4
	defaultToolImageMaxBytesPerTurn = 15 * 1024 * 1024

	defaultToolImageMaxBytesPerRequest = 15 * 1024 * 1024
)

type toolImageLimits struct {
	MaxBytes        int
	MaxPerToolCall  int
	MaxBytesPerTurn int

	// MaxBytesPerRequest bounds every image in an outbound request, including images replayed
	// from the conversation history. MaxBytesPerTurn only bounds images admitted this turn.
	MaxBytesPerRequest int
}

func toolImageLimitsFromEnv() toolImageLimits {
	return toolImageLimits{
		MaxBytes:        envInt(toolImageMaxBytesEnv, defaultToolImageMaxBytes),
		MaxPerToolCall:  envInt(toolImageMaxPerToolCallEnv, defaultToolImageMaxPerToolCall),
		MaxBytesPerTurn: envInt(toolImageMaxBytesPerTurnEnv, defaultToolImageMaxBytesPerTurn),

		MaxBytesPerRequest: envInt(toolImageMaxBytesPerRequestEnv, defaultToolImageMaxBytesPerRequest),
	}
}
