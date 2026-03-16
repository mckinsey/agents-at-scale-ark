/* Copyright 2025. McKinsey & Company */

package controller

import (
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// getPollInterval safely extracts the poll interval duration from a pointer.
// Returns a default of 1 minute if the pointer is nil.
// This is necessary when using aggregated API server (non-CRD storage) because
// optional fields with omitempty may not be initialized.
func getPollInterval(interval *metav1.Duration) time.Duration {
	if interval == nil {
		return time.Minute
	}
	return interval.Duration
}
