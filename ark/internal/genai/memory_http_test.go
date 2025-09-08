package genai

import (
	"encoding/json"
	"testing"

	"github.com/openai/openai-go"
)

func TestUnmarshalMessageRobust(t *testing.T) {
	testCases := []struct {
		name        string
		jsonInput   string
		expectError bool
		description string
	}{
		{
			name:        "valid discriminated union user message",
			jsonInput:   `{"role": "user", "content": "hello"}`,
			expectError: false,
			description: "Should work with primary discriminated union path",
		},
		{
			name:        "valid discriminated union assistant message",
			jsonInput:   `{"role": "assistant", "content": "Hi there!"}`,
			expectError: false,
			description: "Should work with primary discriminated union path",
		},
		{
			name:        "valid discriminated union system message",
			jsonInput:   `{"role": "system", "content": "You are helpful"}`,
			expectError: false,
			description: "Should work with primary discriminated union path",
		},
		{
			name:        "simple user message (fallback)",
			jsonInput:   `{"role": "user", "content": "simple format"}`,
			expectError: false,
			description: "Should work via fallback path if discriminated union fails",
		},
		{
			name:        "message with missing content",
			jsonInput:   `{"role": "user"}`,
			expectError: false,
			description: "Content is optional, should work",
		},
		{
			name:        "message with empty content",
			jsonInput:   `{"role": "assistant", "content": ""}`,
			expectError: false,
			description: "Empty content should work",
		},
		{
			name:        "future role - developer",
			jsonInput:   `{"role": "developer", "content": "Fix this bug"}`,
			expectError: false,
			description: "Unknown roles should fallback to user message (future-proof)",
		},
		{
			name:        "future role - function",
			jsonInput:   `{"role": "function", "content": "result data"}`,
			expectError: false,
			description: "Unknown roles should fallback to user message (future-proof)",
		},
		{
			name:        "future role - tool",
			jsonInput:   `{"role": "tool", "content": "tool output"}`,
			expectError: false,
			description: "Unknown roles should fallback to user message (future-proof)",
		},
		{
			name:        "message with extra fields",
			jsonInput:   `{"role": "user", "content": "hello", "extra": "ignored", "timestamp": 123}`,
			expectError: false,
			description: "Extra fields should be ignored",
		},
		{
			name:        "invalid - missing role",
			jsonInput:   `{"content": "hello"}`,
			expectError: true,
			description: "Missing role should fail",
		},
		{
			name:        "invalid - empty role",
			jsonInput:   `{"role": "", "content": "hello"}`,
			expectError: true,
			description: "Empty role should fail",
		},
		{
			name:        "invalid - malformed JSON",
			jsonInput:   `{malformed json}`,
			expectError: true,
			description: "Malformed JSON should fail",
		},
		{
			name:        "invalid - empty object",
			jsonInput:   `{}`,
			expectError: true,
			description: "Empty object should fail",
		},
		{
			name:        "invalid - null",
			jsonInput:   `null`,
			expectError: true,
			description: "Null should fail",
		},
		{
			name:        "invalid - empty string",
			jsonInput:   `""`,
			expectError: true,
			description: "Empty string should fail",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			rawJSON := json.RawMessage(tc.jsonInput)
			result, err := unmarshalMessageRobust(rawJSON)

			switch {
			case tc.expectError && err == nil:
				t.Errorf("Expected error for %s, but got none. Description: %s", tc.name, tc.description)
			case !tc.expectError && err != nil:
				t.Errorf("Unexpected error for %s: %v. Description: %s", tc.name, err, tc.description)
			case !tc.expectError && result == (openai.ChatCompletionMessageParamUnion{}):
				t.Errorf("Got empty message for %s. Description: %s", tc.name, tc.description)
			}
		})
	}
}

func TestUnmarshalMessageRobustFutureRoles(t *testing.T) {
	futureRoles := []string{"developer", "function", "tool", "moderator", "agent"}

	for _, role := range futureRoles {
		t.Run(role, func(t *testing.T) {
			jsonInput := `{"role": "` + role + `", "content": "test"}`
			result, err := unmarshalMessageRobust(json.RawMessage(jsonInput))
			if err != nil {
				t.Errorf("Future role '%s' should not fail: %v", role, err)
			}
			if result == (openai.ChatCompletionMessageParamUnion{}) {
				t.Errorf("Future role '%s' should produce valid message", role)
			}
		})
	}
}
