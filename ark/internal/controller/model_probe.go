/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/aws/smithy-go"
	smithyhttp "github.com/aws/smithy-go/transport/http"
	"github.com/openai/openai-go"

	completions "mckinsey.com/ark/executors/completions"
)

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
		return fmt.Sprintf("%s (%d)", openaiErr.Message, openaiErr.StatusCode)
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

	return "Probe failed (unknown error)"
}
