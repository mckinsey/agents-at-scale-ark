package protocol

const (
	ErrorCodeUnsupportedModel    = "unsupported-model"
	ErrorCodeProviderError       = "provider-error"
	ErrorCodeInvalidConfig       = "invalid-config"
	ErrorCodeToolCallbackTimeout = "tool-callback-timeout"
	ErrorCodeInternalError       = "internal-error"
)

type EngineError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *EngineError) Error() string {
	return e.Code + ": " + e.Message
}

func NewEngineError(code, message string) *EngineError {
	return &EngineError{Code: code, Message: message}
}
