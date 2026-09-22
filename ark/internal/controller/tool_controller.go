/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"

	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/eventing"
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

// reconcileInline is the authoring-only path: no runner, no endpoint, and a
// status that says so. Phase 2 replaces the body of this with child
// reconciliation; the honest Pending report is what phase 1 owes an author.
func (r *ToolReconciler) reconcileInline(ctx context.Context, tool *arkv1alpha1.Tool) (ctrl.Result, error) {
	r.emitSourceChange(ctx, tool)

	tool.Status.State = arkv1alpha1.ToolStatePending
	tool.Status.Message = inlineRuntimeNotInstalledMessage
	tool.Status.ResolvedAddress = ""
	meta.SetStatusCondition(&tool.Status.Conditions, metav1.Condition{
		Type:               arkv1alpha1.ToolConditionAvailable,
		Status:             metav1.ConditionFalse,
		Reason:             arkv1alpha1.ToolReasonRuntimeNotInstalled,
		Message:            inlineRuntimeNotInstalledMessage,
		ObservedGeneration: tool.Generation,
	})

	if err := r.Status().Update(ctx, tool); err != nil {
		return ctrl.Result{}, fmt.Errorf("failed to update tool status: %v", err)
	}
	return ctrl.Result{}, nil
}

// emitSourceChange records a change of executable source as an event. Audit logs
// can be disabled on the PostgreSQL backend, so this is the second trail the
// authorship annotations need.
//
// ponytail: keyed on metadata.generation rather than a stored hash, because
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
	return ctrl.NewControllerManagedBy(mgr).For(&arkv1alpha1.Tool{}).Named("tool").Complete(r)
}
