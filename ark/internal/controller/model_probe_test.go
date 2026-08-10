/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/aws/smithy-go"
	smithyhttp "github.com/aws/smithy-go/transport/http"
	"github.com/openai/openai-go"
	"github.com/stretchr/testify/require"
)

const testProbeTimeout = 60 * time.Second

type emptyError struct{}

func (emptyError) Error() string { return "" }

func TestExtractStableError_UnrecognisedErrors(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected string
	}{
		{
			name:     "model missing at provider",
			err:      errors.New("model gpt-4 is not available in the provider"),
			expected: "Probe failed (model gpt-4 is not available in the provider)",
		},
		{
			name:     "nil provider",
			err:      errors.New("provider is nil"),
			expected: "Probe failed (provider is nil)",
		},
		{
			name:     "wrapped error keeps both layers",
			err:      fmt.Errorf("azure identity get token: %w", errors.New("no identity configuration found")),
			expected: "Probe failed (azure identity get token: no identity configuration found)",
		},
		{
			name:     "bedrock config load failure",
			err:      fmt.Errorf("failed to load AWS config: %w", errors.New("missing region")),
			expected: "Probe failed (failed to load AWS config: missing region)",
		},
		{
			name:     "multiline error collapses to one line",
			err:      errors.New("anthropic API returned status 400:\n{\n\t\"type\": \"error\"\n}"),
			expected: `Probe failed (anthropic API returned status 400: { "type": "error" })`,
		},
		{
			name:     "empty error message falls back to unknown error",
			err:      emptyError{},
			expected: "Probe failed (unknown error)",
		},
		{
			name:     "labelled trace correlation and timestamp are stripped",
			err:      errors.New("AADSTS700016: Application not found. Trace ID: 3f2a1b4c-5d6e-7f80-9a1b-2c3d4e5f6071 Correlation ID: aabbccdd-1122-3344-5566-778899aabbcc Timestamp: 2026-08-10 11:22:33Z"),
			expected: "Probe failed (AADSTS700016: Application not found.)",
		},
		{
			name:     "bare uuid is stripped",
			err:      errors.New("probe rejected 3f2a1b4c-5d6e-7f80-9a1b-2c3d4e5f6071 by gateway"),
			expected: "Probe failed (probe rejected by gateway)",
		},
		{
			name:     "long hex token is stripped",
			err:      errors.New("upstream refused req 0123456789abcdef0123456789abcdef"),
			expected: "Probe failed (upstream refused req)",
		},
		{
			name:     "request id with equals separator is stripped",
			err:      errors.New("service unavailable, request-id=abc123xyz789"),
			expected: "Probe failed (service unavailable)",
		},
		{
			name:     "anthropic json request id is stripped",
			err:      errors.New(`anthropic API returned status 404: {"type":"error","error":{"type":"not_found_error","message":"model: claude-x"},"request_id":"req_011CQabcDEF123"}`),
			expected: `Probe failed (anthropic API returned status 404: {"type":"error","error":{"type":"not_found_error","message":"model: claude-x"}})`,
		},
		{
			name:     "json request id with spaced separator is stripped",
			err:      errors.New(`upstream rejected {"request_id": "req_99", "code": 503}`),
			expected: `Probe failed (upstream rejected {"code": 503})`,
		},
		{
			name:     "rfc3339 timestamp with fractional seconds is stripped",
			err:      errors.New("AADSTS50126: Invalid credentials. Timestamp: 2026-08-10T11:22:33.1234567Z"),
			expected: "Probe failed (AADSTS50126: Invalid credentials.)",
		},
		{
			name:     "rfc3339 timestamp with timezone offset is stripped",
			err:      errors.New("AADSTS50126: Invalid credentials. Timestamp: 2026-08-10T11:22:33.123+05:30"),
			expected: "Probe failed (AADSTS50126: Invalid credentials.)",
		},
		{
			name:     "two adjacent volatile json fields leave valid json",
			err:      errors.New(`gateway error {"request_id":"req_99","timestamp":"2026-08-10T11:22:33.123Z","code":503}`),
			expected: `Probe failed (gateway error {"code":503})`,
		},
		{
			name:     "three adjacent volatile json fields leave valid json",
			err:      errors.New(`gateway error {"request_id":"a","trace_id":"b","timestamp":"2026-08-10T11:22:33Z","code":503}`),
			expected: `Probe failed (gateway error {"code":503})`,
		},
		{
			name:     "adjacent volatile fields between other fields leave valid json",
			err:      errors.New(`gateway error {"code":503,"request_id":"a","timestamp":"2026-08-10T11:22:33Z","x":1}`),
			expected: `Probe failed (gateway error {"code":503,"x":1})`,
		},
		{
			name:     "adjacent volatile fields at the tail leave valid json",
			err:      errors.New(`gateway error {"code":503,"request_id":"a","timestamp":"2026-08-10T11:22:33Z"}`),
			expected: `Probe failed (gateway error {"code":503})`,
		},
		{
			name:     "json timestamp is stripped",
			err:      errors.New(`gateway error {"code":"unavailable","timestamp":"2026-08-10T11:22:33.123Z"}`),
			expected: `Probe failed (gateway error {"code":"unavailable"})`,
		},
		{
			name:     "uuid inside a url path is preserved",
			err:      errors.New(`POST "https://gateway.example.com/ead325ff-fca1-493c-8043-8c7cfdb0ddb8/v1/chat/completions": 403 Forbidden`),
			expected: `Probe failed (POST "https://gateway.example.com/ead325ff-fca1-493c-8043-8c7cfdb0ddb8/v1/chat/completions": 403 Forbidden)`,
		},
		{
			name:     "hex path segment is preserved",
			err:      errors.New(`Get "https://gateway.example.com/0123456789abcdef0123456789abcdef/v1/models": connection refused`),
			expected: `Probe failed (Get "https://gateway.example.com/0123456789abcdef0123456789abcdef/v1/models": connection refused)`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.expected, extractStableError(tt.err, testProbeTimeout))
		})
	}
}

func TestExtractStableError_IsStableAcrossAttempts(t *testing.T) {
	first := errors.New("AADSTS7000215: Invalid client secret provided. Trace ID: 11111111-2222-3333-4444-555555555555 Correlation ID: 66666666-7777-8888-9999-000000000000 Timestamp: 2026-08-10 11:22:33Z")
	second := errors.New("AADSTS7000215: Invalid client secret provided. Trace ID: 99999999-8888-7777-6666-555555555555 Correlation ID: 44444444-3333-2222-1111-000000000000 Timestamp: 2026-08-10 11:23:47Z")

	firstMessage := extractStableError(first, testProbeTimeout)
	secondMessage := extractStableError(second, testProbeTimeout)

	require.Equal(t, firstMessage, secondMessage)
	require.Equal(t, "Probe failed (AADSTS7000215: Invalid client secret provided.)", firstMessage)
}

func TestExtractStableError_IsStableAcrossAnthropicAttempts(t *testing.T) {
	body := `anthropic API returned status 429: {"type":"error","error":{"type":"rate_limit_error","message":"rate limited"},"request_id":%q}`
	first := fmt.Errorf(body, "req_011CQabcDEF123")
	second := fmt.Errorf(body, "req_011CQzzz999XY")

	firstMessage := extractStableError(first, testProbeTimeout)
	secondMessage := extractStableError(second, testProbeTimeout)

	require.Equal(t, firstMessage, secondMessage)
	require.NotContains(t, firstMessage, "req_011")
	require.Contains(t, firstMessage, "rate_limit_error")
}

func TestExtractStableError_IsStableAcrossFractionalTimestamps(t *testing.T) {
	template := "AADSTS50126: Invalid username or password. Timestamp: %s"
	first := fmt.Errorf(template, "2026-08-10T11:22:33.1234567Z")
	second := fmt.Errorf(template, "2026-08-10T11:22:34.9876543Z")

	firstMessage := extractStableError(first, testProbeTimeout)
	secondMessage := extractStableError(second, testProbeTimeout)

	require.Equal(t, firstMessage, secondMessage)
	require.NotContains(t, firstMessage, "2026-08-10")
	require.Equal(t, "Probe failed (AADSTS50126: Invalid username or password.)", firstMessage)
}

func TestExtractStableError_TruncatesLongMessages(t *testing.T) {
	message := extractStableError(errors.New(strings.Repeat("x", 500)), testProbeTimeout)

	require.Equal(t, "Probe failed ("+strings.Repeat("x", maxProbeErrorLength)+"...)", message)
}

func TestExtractStableError_TruncationTrimsTrailingSpace(t *testing.T) {
	message := extractStableError(errors.New(strings.Repeat("abc ", 100)), testProbeTimeout)

	require.Equal(t, "Probe failed ("+strings.TrimSpace(strings.Repeat("abc ", 64))+"...)", message)
}

func TestExtractStableError_TruncationIsRuneSafe(t *testing.T) {
	message := extractStableError(errors.New(strings.Repeat("é", 400)), testProbeTimeout)

	require.True(t, utf8.ValidString(message))
	require.Equal(t, "Probe failed ("+strings.Repeat("é", maxProbeErrorLength)+"...)", message)
}

func TestExtractStableError_DeadlineExceeded(t *testing.T) {
	err := fmt.Errorf("list models: %w", context.DeadlineExceeded)

	require.Equal(t, "Probe failed (timeout after 60 seconds)", extractStableError(err, testProbeTimeout))
}

func TestExtractStableError_Canceled(t *testing.T) {
	err := fmt.Errorf("list models: %w", context.Canceled)

	require.Equal(t, "Probe canceled (connection error)", extractStableError(err, testProbeTimeout))
}

func TestExtractStableError_OpenAIError(t *testing.T) {
	request, err := http.NewRequestWithContext(context.Background(), http.MethodGet, "https://api.openai.com/v1/models", nil)
	require.NoError(t, err)

	openaiErr := &openai.Error{
		Message:    "The model `gpt-9` does not exist",
		StatusCode: http.StatusNotFound,
		Request:    request,
		Response:   &http.Response{StatusCode: http.StatusNotFound},
	}

	require.Equal(t, "The model `gpt-9` does not exist (404)",
		extractStableError(fmt.Errorf("model gpt-9 is not accessible: %w", openaiErr), testProbeTimeout))
}

func TestExtractStableError_OpenAIErrorWithoutMessage(t *testing.T) {
	tests := []struct {
		name       string
		statusCode int
		expected   string
	}{
		{name: "forbidden", statusCode: http.StatusForbidden, expected: "Forbidden (403)"},
		{name: "bad gateway", statusCode: http.StatusBadGateway, expected: "Bad Gateway (502)"},
		{name: "unrecognised status", statusCode: 0, expected: "unknown error (0)"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			openaiErr := &openai.Error{StatusCode: tt.statusCode}

			require.Equal(t, tt.expected, extractStableError(openaiErr, testProbeTimeout))
		})
	}
}

func TestExtractStableError_SmithyResponseError(t *testing.T) {
	err := &smithyhttp.ResponseError{
		Response: &smithyhttp.Response{Response: &http.Response{StatusCode: http.StatusForbidden}},
		Err:      &smithy.GenericAPIError{Code: "AccessDenied", Message: "The security token is invalid."},
	}

	require.Equal(t, "The security token is invalid. (403)", extractStableError(err, testProbeTimeout))
}
