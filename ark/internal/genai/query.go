/* Copyright 2025. McKinsey & Company */

package genai

import (
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
)

// IsStreamingEnabled checks if streaming is requested for a query
func IsStreamingEnabled(query arkv1alpha1.Query) bool {
	return query.GetAnnotations() != nil && query.GetAnnotations()[annotations.StreamingEnabled] == TrueString
}
