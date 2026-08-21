package completions

const (
	toolImageMaxBytesEnv        = "ARK_TOOL_IMAGE_MAX_BYTES"
	toolImageMaxPerToolCallEnv  = "ARK_TOOL_IMAGE_MAX_PER_TOOL_CALL"
	toolImageMaxBytesPerTurnEnv = "ARK_TOOL_IMAGE_MAX_BYTES_PER_TURN"

	defaultToolImageMaxBytes        = 5 * 1024 * 1024
	defaultToolImageMaxPerToolCall  = 4
	defaultToolImageMaxBytesPerTurn = 15 * 1024 * 1024
)

type toolImageLimits struct {
	MaxBytes        int
	MaxPerToolCall  int
	MaxBytesPerTurn int
}

func toolImageLimitsFromEnv() toolImageLimits {
	return toolImageLimits{
		MaxBytes:        envInt(toolImageMaxBytesEnv, defaultToolImageMaxBytes),
		MaxPerToolCall:  envInt(toolImageMaxPerToolCallEnv, defaultToolImageMaxPerToolCall),
		MaxBytesPerTurn: envInt(toolImageMaxBytesPerTurnEnv, defaultToolImageMaxBytesPerTurn),
	}
}
