/* Copyright 2025. McKinsey & Company */

package genai

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/aws/smithy-go"
	smithyhttp "github.com/aws/smithy-go/transport/http"
	"github.com/openai/openai-go"
)

type probeContextKey struct{}

func contextWithProbeMode(ctx context.Context) context.Context {
	return context.WithValue(ctx, probeContextKey{}, true)
}

func IsProbeContext(ctx context.Context) bool {
	val, ok := ctx.Value(probeContextKey{}).(bool)
	return ok && val
}

// ProbeResult contains the outcome of a model probe
type ProbeResult struct {
	Available     bool
	Message       string // Stable message for status condition
	DetailedError error  // Full error for logging
}

// ProbeModel tests if a model is available
func ProbeModel(ctx context.Context, model *Model) ProbeResult {
	timeout := 30 * time.Second
	probeCtx := contextWithProbeMode(context.Background())
	probeCtx, cancel := context.WithTimeout(probeCtx, timeout)
	defer cancel()

	testMessages := []Message{NewUserMessage("Hello")}

	_, err := model.ChatCompletion(probeCtx, testMessages, nil, 1)
	if err != nil {
		return ProbeResult{
			Available:     false,
			Message:       extractStableError(err, timeout),
			DetailedError: err,
		}
	}

	return ProbeResult{
		Available:     true,
		Message:       "Model is available",
		DetailedError: nil,
	}
}

// Returns a stable error message suitable for a 'condition'. If error messages
// are not stable (for example, including a request ID or UUID) then adding
// this message to a condition will change the message and trigger
// reconcillation, which can lead to an unwanted 'tight loop'.
func extractStableError(err error, timeout time.Duration) string {
	// Check for context timeout first
	if errors.Is(err, context.DeadlineExceeded) {
		return fmt.Sprintf("Probe failed (timeout after %d seconds)", int(timeout.Seconds()))
	}

	// OpenAI API error
	var openaiErr *openai.Error
	if errors.As(err, &openaiErr) {
		return fmt.Sprintf("%s (%d)", openaiErr.Message, openaiErr.StatusCode)
	}

	// AWS Smithy API error with HTTP response
	var httpErr *smithyhttp.ResponseError
	if errors.As(err, &httpErr) {
		// Get the API error for the message
		var apiErr smithy.APIError
		if errors.As(err, &apiErr) {
			return fmt.Sprintf("%s (%d)", apiErr.ErrorMessage(), httpErr.HTTPStatusCode())
		}
		// Fallback to just status code if no API error
		return fmt.Sprintf("Probe failed (%d)", httpErr.HTTPStatusCode())
	}

	// Connection errors
	if errors.Is(err, context.Canceled) {
		return "Probe canceled (connection error)"
	}

	// Generic fallback
	return "Probe failed (unknown error)"
}
