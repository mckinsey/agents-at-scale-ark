/* Copyright 2025. McKinsey & Company */

package controller

import "mckinsey.com/ark/internal/annotations"

const (
	statusPending    = "pending"
	statusRunning    = "running"
	statusEvaluating = "evaluating"
	statusDone       = "done"
	statusError      = "error"
	statusCanceled   = "canceled"
	statusReady      = "ready"

	finalizer = annotations.Finalizer
)
