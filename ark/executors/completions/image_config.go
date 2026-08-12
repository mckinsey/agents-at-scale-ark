package completions

import (
	"os"
	"strconv"
)

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
	limits := toolImageLimits{
		MaxBytes:        defaultToolImageMaxBytes,
		MaxPerToolCall:  defaultToolImageMaxPerToolCall,
		MaxBytesPerTurn: defaultToolImageMaxBytesPerTurn,
	}
	if v, err := strconv.Atoi(os.Getenv(toolImageMaxBytesEnv)); err == nil && v > 0 {
		limits.MaxBytes = v
	}
	if v, err := strconv.Atoi(os.Getenv(toolImageMaxPerToolCallEnv)); err == nil && v > 0 {
		limits.MaxPerToolCall = v
	}
	if v, err := strconv.Atoi(os.Getenv(toolImageMaxBytesPerTurnEnv)); err == nil && v > 0 {
		limits.MaxBytesPerTurn = v
	}
	return limits
}
