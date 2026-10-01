/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"fmt"

	appsv1 "k8s.io/api/apps/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/types"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/inlinetools"
)

// inlineVerdict is one evaluation of a Tool's usability. Available means the
// endpoint and the current configuration are usable — not that a runner pod is
// warm; an available inline Tool normally has zero pods.
type inlineVerdict struct {
	available bool
	reason    string
	message   string
	address   string
}

func (r *ToolReconciler) evaluateInline(ctx context.Context, tool *arkv1alpha1.Tool) inlineVerdict {
	if !inlinetools.Enabled() {
		return inlineVerdict{
			reason:  arkv1alpha1.ToolReasonRuntimeNotInstalled,
			message: inlineDisabledMessage,
		}
	}

	if err := r.reconcileInlineChildren(ctx, tool); err != nil {
		return inlineVerdict{
			reason:  arkv1alpha1.ToolReasonProvisioningFailed,
			message: err.Error(),
		}
	}

	conflict, err := r.checkInlinePolicies(ctx, tool)
	if err != nil {
		return inlineVerdict{reason: arkv1alpha1.ToolReasonProvisioningFailed, message: err.Error()}
	}
	if conflict != "" {
		return inlineVerdict{reason: arkv1alpha1.ToolReasonConflictingPolicy, message: conflict}
	}

	namespace := activatorNamespace()
	activator := &appsv1.Deployment{}
	key := types.NamespacedName{Name: inlinetools.ActivatorName, Namespace: namespace}
	switch err := r.Get(ctx, key, activator); {
	case apierrors.IsNotFound(err):
		return inlineVerdict{
			reason: arkv1alpha1.ToolReasonActivatorUnavailable,
			message: fmt.Sprintf("the inline tool activator %s is not installed in namespace %s: the tool is stored but not executable yet",
				inlinetools.ActivatorName, namespace),
		}
	case err != nil:
		return inlineVerdict{
			reason:  arkv1alpha1.ToolReasonActivatorUnavailable,
			message: fmt.Sprintf("cannot read the inline tool activator in namespace %s: %v", namespace, err),
		}
	case activator.Status.AvailableReplicas < 1:
		// resolvedAddress points at the activator, so an activator with no
		// available replica means there is no usable endpoint to advertise.
		return inlineVerdict{
			reason: arkv1alpha1.ToolReasonActivatorUnavailable,
			message: fmt.Sprintf("the inline tool activator %s/%s has no available replica",
				namespace, inlinetools.ActivatorName),
		}
	}

	return inlineVerdict{
		available: true,
		reason:    arkv1alpha1.ToolReasonAvailable,
		message:   inlineAvailableMessage,
		address:   inlinetools.ResolvedAddress(namespace, tool),
	}
}
