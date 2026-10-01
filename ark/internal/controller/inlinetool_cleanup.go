/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"fmt"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/utils/ptr"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

// InlineFinalizer makes child removal the controller's job rather than the
// cluster garbage collector's. Owner references stay as a backstop, but the
// PostgreSQL backend serves Tools from an aggregated API server, so relying on
// owner-reference garbage collection alone would make cleanup depend on which
// storage backend is installed.
const InlineFinalizer = "ark.mckinsey.com/inline-tool-children"

// AnnotationInlineDrainStartedAt records when a scale-down was first requested.
// Storing it on the Deployment survives a controller restart, so a drain cannot
// be restarted indefinitely by a rollout.
const AnnotationInlineDrainStartedAt = "ark.mckinsey.com/inline-drain-started-at"

// inlineDrainWindow bounds in-flight work before the controller scales a runner
// to zero. It covers the activation and execution budgets together, so a call
// admitted just before the feature was disabled either finishes or fails on its
// own deadline rather than being cut off mid-execution.
const inlineDrainWindow = 90 * time.Second

// finalizeInline removes the Tool's owned children. It runs under ordinary
// delete permissions and works with the feature disabled: disabling authoring
// must not strand a deletion.
func (r *ToolReconciler) finalizeInline(ctx context.Context, tool *arkv1alpha1.Tool) (ctrl.Result, error) {
	if !controllerutil.ContainsFinalizer(tool, InlineFinalizer) {
		return ctrl.Result{}, nil
	}

	names := inlineChildNames(tool.Name)
	children := []client.Object{
		&appsv1.Deployment{ObjectMeta: metav1.ObjectMeta{Name: names.Runner, Namespace: tool.Namespace}},
		&corev1.Service{ObjectMeta: metav1.ObjectMeta{Name: names.Runner, Namespace: tool.Namespace}},
		&networkingv1.NetworkPolicy{ObjectMeta: metav1.ObjectMeta{Name: names.Runner, Namespace: tool.Namespace}},
		&corev1.ServiceAccount{ObjectMeta: metav1.ObjectMeta{Name: names.Runner, Namespace: tool.Namespace}},
		&corev1.ConfigMap{ObjectMeta: metav1.ObjectMeta{Name: names.Source, Namespace: tool.Namespace}},
	}
	for _, child := range children {
		if err := r.deleteOwnedChild(ctx, tool, child); err != nil {
			return ctrl.Result{}, err
		}
	}

	controllerutil.RemoveFinalizer(tool, InlineFinalizer)
	// Two reconciles can race here — deleting a Tool enqueues it more than once
	// — and the loser finds the object already gone. That is the intended end
	// state, not an error worth a stack trace.
	if err := r.Update(ctx, tool); err != nil && !apierrors.IsNotFound(err) {
		return ctrl.Result{}, fmt.Errorf("failed to remove the inline finalizer: %w", err)
	}
	return ctrl.Result{}, nil
}

// deleteOwnedChild deletes a child only when it is still this Tool's. A name
// that has been taken over by something else is left alone.
func (r *ToolReconciler) deleteOwnedChild(ctx context.Context, tool *arkv1alpha1.Tool, child client.Object) error {
	key := types.NamespacedName{Name: child.GetName(), Namespace: child.GetNamespace()}
	if err := r.Get(ctx, key, child); err != nil {
		if apierrors.IsNotFound(err) {
			return nil
		}
		return fmt.Errorf("failed to read %T %s: %w", child, key, err)
	}
	if owner := metav1.GetControllerOf(child); owner == nil || owner.UID != tool.UID {
		return nil
	}
	if err := r.Delete(ctx, child); err != nil && !apierrors.IsNotFound(err) {
		return fmt.Errorf("failed to delete %T %s: %w", child, key, err)
	}
	return nil
}

// drainInlineRunner scales a runner to zero once the drain window has passed.
// The activator is the only component that scales a runner up, and it stops
// admitting calls while the feature is disabled, so there is nothing to race
// here — but a call that was already running gets the window to finish.
func (r *ToolReconciler) drainInlineRunner(ctx context.Context, tool *arkv1alpha1.Tool) (time.Duration, error) {
	deployment := &appsv1.Deployment{}
	key := types.NamespacedName{Name: inlineChildNames(tool.Name).Runner, Namespace: tool.Namespace}
	if err := r.Get(ctx, key, deployment); err != nil {
		if apierrors.IsNotFound(err) {
			return 0, nil
		}
		return 0, err
	}
	if owner := metav1.GetControllerOf(deployment); owner == nil || owner.UID != tool.UID {
		return 0, nil
	}
	if deployment.Spec.Replicas != nil && *deployment.Spec.Replicas == 0 {
		return 0, nil
	}

	now := time.Now().UTC()
	started, marked := drainStart(deployment)
	if !marked {
		if deployment.Annotations == nil {
			deployment.Annotations = map[string]string{}
		}
		deployment.Annotations[AnnotationInlineDrainStartedAt] = now.Format(time.RFC3339)
		if err := r.Update(ctx, deployment); err != nil {
			return 0, fmt.Errorf("failed to start draining %s: %w", key, err)
		}
		return inlineDrainWindow, nil
	}
	if remaining := inlineDrainWindow - now.Sub(started); remaining > 0 {
		return remaining, nil
	}

	deployment.Spec.Replicas = ptr.To(int32(0))
	delete(deployment.Annotations, AnnotationInlineDrainStartedAt)
	if err := r.Update(ctx, deployment); err != nil {
		return 0, fmt.Errorf("failed to scale down %s: %w", key, err)
	}
	logf.FromContext(ctx).Info("scaled inline runner to zero after drain", "deployment", key.String())
	return 0, nil
}

func drainStart(deployment *appsv1.Deployment) (time.Time, bool) {
	value, ok := deployment.Annotations[AnnotationInlineDrainStartedAt]
	if !ok {
		return time.Time{}, false
	}
	started, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return time.Time{}, false
	}
	return started, true
}
