/* Copyright 2025. McKinsey & Company */

package controller

import (
	"errors"
	"time"

	"github.com/aws/smithy-go/transport/http"
	"github.com/openai/openai-go"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func (r *QueryReconciler) shouldRetry(query *arkv1alpha1.Query) bool {
	if query.Spec.RetryPolicy == nil {
		return false
	}

	if query.Status.RetryCount >= query.Spec.RetryPolicy.MaxRetries {
		return false
	}

	// Check if the last error was transient (retryable)
	if query.Status.LastErrorCode != nil {
		return isTransientError(*query.Status.LastErrorCode)
	}

	// When error code is unavailable (e.g., network errors, timeouts, or errors
	// from providers that don't return HTTP status codes), assume transient and retry
	return true
}

// isTransientError returns true if the HTTP status code indicates a transient error
// that may succeed on retry. Follows OpenAI SDK conventions.
func isTransientError(code int) bool {
	switch code {
	case 408, // Request Timeout
		409, // Conflict
		429, // Too Many Requests (rate limited)
		500, // Internal Server Error
		502, // Bad Gateway
		503, // Service Unavailable
		504: // Gateway Timeout
		return true
	default:
		return false
	}
}

func (r *QueryReconciler) calculateBackoffDelay(policy *arkv1alpha1.RetryPolicy, attempt int32) time.Duration {
	if policy == nil {
		return time.Second
	}

	initialDelay := time.Second
	if policy.InitialDelay != nil {
		initialDelay = policy.InitialDelay.Duration
	}

	maxDelay := 30 * time.Second
	if policy.MaxDelay != nil {
		maxDelay = policy.MaxDelay.Duration
	}

	var delay time.Duration
	switch policy.BackoffPolicy {
	case arkv1alpha1.BackoffPolicyExponential:
		delay = initialDelay * time.Duration(1<<uint(attempt))
	case arkv1alpha1.BackoffPolicyLinear:
		delay = initialDelay * time.Duration(attempt+1)
	case arkv1alpha1.BackoffPolicyFixed:
		delay = initialDelay
	default:
		delay = initialDelay * time.Duration(1<<uint(attempt))
	}

	if delay > maxDelay {
		delay = maxDelay
	}

	return delay
}

// extractHTTPStatusCode extracts the HTTP status code from various error types
func extractHTTPStatusCode(err error) *int {
	// OpenAI API error
	var openaiErr *openai.Error
	if errors.As(err, &openaiErr) {
		code := int(openaiErr.StatusCode)
		return &code
	}

	// AWS Smithy HTTP error
	var httpErr *http.ResponseError
	if errors.As(err, &httpErr) {
		code := httpErr.HTTPStatusCode()
		return &code
	}

	return nil
}
