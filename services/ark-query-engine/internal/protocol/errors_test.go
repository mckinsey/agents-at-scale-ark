package protocol

import (
	"testing"
)

func TestEngineError_Error(t *testing.T) {
	err := NewEngineError(ErrorCodeProviderError, "API key invalid")
	if err.Error() != "provider-error: API key invalid" {
		t.Errorf("unexpected error string: %s", err.Error())
	}
	if err.Code != ErrorCodeProviderError {
		t.Errorf("unexpected code: %s", err.Code)
	}
}

func TestEngineError_Codes(t *testing.T) {
	codes := []string{
		ErrorCodeUnsupportedModel,
		ErrorCodeProviderError,
		ErrorCodeInvalidConfig,
		ErrorCodeToolCallbackTimeout,
		ErrorCodeInternalError,
	}
	for _, code := range codes {
		err := NewEngineError(code, "test")
		if err.Code != code {
			t.Errorf("expected code %s, got %s", code, err.Code)
		}
	}
}
