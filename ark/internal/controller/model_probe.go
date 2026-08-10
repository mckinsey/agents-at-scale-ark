/* Copyright 2025. McKinsey & Company */

package controller

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/aws/smithy-go"
	smithyhttp "github.com/aws/smithy-go/transport/http"
	"github.com/openai/openai-go"

	completions "mckinsey.com/ark/executors/completions"
)

const maxProbeErrorLength = 256

var volatileTokenPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)(^|\s)(?:trace|correlation|request|activity|client-request)[ _-]?id\s*[:=]\s*\S+`),
	regexp.MustCompile(`(?i)(^|\s)timestamp\s*[:=]\s*\d{4}-\d{2}-\d{2}[ t]\d{2}:\d{2}:\d{2}z?`),
	regexp.MustCompile(`(?i)(^|\s)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b`),
	regexp.MustCompile(`(?i)(^|\s)[0-9a-f]{16,}\b`),
}

type ProbeResult struct {
	Available     bool
	Message       string
	DetailedError error
}

func ProbeModel(ctx context.Context, model *completions.Model, timeout time.Duration) ProbeResult {
	probeCtx := completions.ContextWithProbeMode(ctx)
	probeCtx, cancel := context.WithTimeout(probeCtx, timeout)
	defer cancel()

	err := model.HealthCheck(probeCtx)
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

func extractStableError(err error, timeout time.Duration) string {
	if errors.Is(err, context.DeadlineExceeded) {
		return fmt.Sprintf("Probe failed (timeout after %d seconds)", int(timeout.Seconds()))
	}

	var openaiErr *openai.Error
	if errors.As(err, &openaiErr) {
		message := cmp.Or(openaiErr.Message, http.StatusText(openaiErr.StatusCode), "unknown error")
		return fmt.Sprintf("%s (%d)", message, openaiErr.StatusCode)
	}

	var httpErr *smithyhttp.ResponseError
	if errors.As(err, &httpErr) {
		var apiErr smithy.APIError
		if errors.As(err, &apiErr) {
			return fmt.Sprintf("%s (%d)", apiErr.ErrorMessage(), httpErr.HTTPStatusCode())
		}
		return fmt.Sprintf("Probe failed (%d)", httpErr.HTTPStatusCode())
	}

	if errors.Is(err, context.Canceled) {
		return "Probe canceled (connection error)"
	}

	return fmt.Sprintf("Probe failed (%s)", stabilizeProbeError(err))
}

func stabilizeProbeError(err error) string {
	msg := err.Error()
	for _, pattern := range volatileTokenPatterns {
		msg = pattern.ReplaceAllString(msg, "${1}")
	}
	msg = strings.Join(strings.Fields(msg), " ")
	msg = strings.TrimRight(msg, " ,;:-")
	if msg == "" {
		return "unknown error"
	}
	if runes := []rune(msg); len(runes) > maxProbeErrorLength {
		return strings.TrimSpace(string(runes[:maxProbeErrorLength])) + "..."
	}
	return msg
}
