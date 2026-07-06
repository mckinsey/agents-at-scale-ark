/* Copyright 2025. McKinsey & Company */

package controller

import "mckinsey.com/ark/internal/annotations"

const (
	statusPending       = "pending"
	statusProvisioning  = "provisioning"
	statusRunning       = "running"
	statusInputRequired = "input-required"
	statusDone          = "done"
	statusError         = "error"
	statusCanceled      = "canceled"
	statusReady         = "ready"

	finalizer = annotations.Finalizer
)
