/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/inlinetools"
)

// inlineRuntimeNotInstalledMessage is what an author sees until the runner
// runtime exists. It has to say "not executable" rather than imply a transient
// wait, because in the authoring-first release there is nothing to wait for.
const inlineRuntimeNotInstalledMessage = "Inline tool runtime is not installed: the tool is stored but not executable yet"

type ToolReconciler struct {
	client.Client
	Scheme   *runtime.Scheme
	Eventing eventing.Provider
}

// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=tools,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=tools/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=tools/finalizers,verbs=update
// Inline tool runners: the controller owns one ConfigMap, ServiceAccount,
// Service, NetworkPolicy and Deployment per inline Tool.
// +kubebuilder:rbac:groups="",resources=configmaps;services;serviceaccounts,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=apps,resources=deployments,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=networking.k8s.io,resources=networkpolicies,verbs=get;list;watch;create;update;patch;delete

func (r *ToolReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	tool := &arkv1alpha1.Tool{}
	if err := r.Get(ctx, req.NamespacedName, tool); err != nil {
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}

	if tool.Spec.Type == arkv1alpha1.ToolTypeInline {
		return r.reconcileInline(ctx, tool)
	}

	if tool.Status.State == arkv1alpha1.ToolStateReady {
		return ctrl.Result{}, nil
	}

	return r.updateToolStatus(ctx, tool, arkv1alpha1.ToolStateReady, "Tool configuration is valid")
}

// reconcileInline provisions the Tool's owned runner objects and reports an
// honest status. Provisioning a runner does not make the Tool callable: the
// activator that fronts it is not part of this release, so the Tool stays
// Pending.
func (r *ToolReconciler) reconcileInline(ctx context.Context, tool *arkv1alpha1.Tool) (ctrl.Result, error) {
	r.emitSourceChange(ctx, tool)

	reason, message := arkv1alpha1.ToolReasonRuntimeNotInstalled, inlineRuntimeNotInstalledMessage
	var provisionErr error
	if inlinetools.Enabled() {
		if provisionErr = r.reconcileInlineChildren(ctx, tool); provisionErr != nil {
			reason, message = arkv1alpha1.ToolReasonProvisioningFailed, provisionErr.Error()
		}
	}

	if err := r.setInlineUnavailable(ctx, tool, reason, message); err != nil {
		return ctrl.Result{}, err
	}
	return ctrl.Result{}, provisionErr
}

// setInlineUnavailable records that the Tool is stored but not callable, with
// the reason a reader can branch on. No endpoint is advertised while it is set.
func (r *ToolReconciler) setInlineUnavailable(ctx context.Context, tool *arkv1alpha1.Tool, reason, message string) error {
	// A settled inline tool is not rewritten, mirroring the Ready short-circuit
	// on the non-inline path. Children are still reconciled above, and a changed
	// reason or message is still a transition worth recording.
	if c := meta.FindStatusCondition(tool.Status.Conditions, arkv1alpha1.ToolConditionAvailable); c != nil &&
		c.ObservedGeneration == tool.Generation && c.Reason == reason && c.Message == message {
		return nil
	}

	tool.Status.State = arkv1alpha1.ToolStatePending
	tool.Status.Message = message
	tool.Status.ResolvedAddress = ""
	meta.SetStatusCondition(&tool.Status.Conditions, metav1.Condition{
		Type:               arkv1alpha1.ToolConditionAvailable,
		Status:             metav1.ConditionFalse,
		Reason:             reason,
		Message:            message,
		ObservedGeneration: tool.Generation,
	})

	if err := r.Status().Update(ctx, tool); err != nil {
		return fmt.Errorf("failed to update tool status: %v", err)
	}
	return nil
}

// emitSourceChange records a change of executable source as an event. Audit logs
// can be disabled on the PostgreSQL backend, so this is the second trail the
// authorship annotations need.
//
// NOTE: keyed on metadata.generation rather than a stored hash, because
// phase 1 has no runner to carry the reconciled revision. A spec edit that does
// not touch source therefore also emits. Phase 2 owns the pod-template source
// hash; compare against that once it exists.
func (r *ToolReconciler) emitSourceChange(ctx context.Context, tool *arkv1alpha1.Tool) {
	if r.Eventing == nil || tool.Spec.Inline == nil {
		return
	}
	if conditionUpToDate(tool) {
		return
	}
	r.Eventing.ToolRecorder().InlineSourceChanged(ctx, tool,
		fmt.Sprintf("inline source hash is %s (authored by %q)", sourceHash(tool.Spec.Inline.Source), tool.Annotations[arkv1alpha1.AnnotationInlineAuthoredBy]))
}

func conditionUpToDate(tool *arkv1alpha1.Tool) bool {
	c := meta.FindStatusCondition(tool.Status.Conditions, arkv1alpha1.ToolConditionAvailable)
	return c != nil && c.ObservedGeneration == tool.Generation
}

func sourceHash(source string) string {
	sum := sha256.Sum256([]byte(source))
	return hex.EncodeToString(sum[:])
}

func (r *ToolReconciler) updateToolStatus(ctx context.Context, tool *arkv1alpha1.Tool, state, message string) (ctrl.Result, error) {
	tool.Status.State = state
	tool.Status.Message = message

	if err := r.Status().Update(ctx, tool); err != nil {
		return ctrl.Result{}, fmt.Errorf("failed to update tool status: %v", err)
	}

	return ctrl.Result{}, nil
}

func (r *ToolReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&arkv1alpha1.Tool{}).
		// Owned children are watched so drift is corrected without waiting for a
		// resync, and so a deleted child is recreated.
		Owns(&corev1.ConfigMap{}).
		Owns(&corev1.Service{}).
		Owns(&appsv1.Deployment{}).
		Owns(&networkingv1.NetworkPolicy{}).
		Named("tool").
		Complete(r)
}
