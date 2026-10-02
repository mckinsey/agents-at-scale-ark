/* Copyright 2025. McKinsey & Company */

package controller

import (
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
)

const (
	statusPending       = arkv1alpha1.QueryPhasePending
	statusProvisioning  = arkv1alpha1.QueryPhaseProvisioning
	statusRunning       = arkv1alpha1.QueryPhaseRunning
	statusQueued        = arkv1alpha1.QueryPhaseQueued
	statusInputRequired = arkv1alpha1.QueryPhaseInputRequired
	statusDone          = arkv1alpha1.QueryPhaseDone
	statusError         = arkv1alpha1.QueryPhaseError
	statusCanceled      = arkv1alpha1.QueryPhaseCanceled
	statusReady         = "ready"

	finalizer = annotations.Finalizer
)
