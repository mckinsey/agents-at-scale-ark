/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/inlinetools"
)

// inlineRuntimeNotInstalledMessage is what an author sees until the runner
// runtime exists. It has to say "not executable" rather than imply a transient
// wait, because in the authoring-first release there is nothing to wait for.
const inlineRuntimeNotInstalledMessage = "Inline tool runtime is not installed: the tool is stored but not executable yet"

// inlineDisabledMessage and inlineAvailableMessage are the other two states an
// author sees. Available deliberately says nothing about a running pod: a
// callable inline tool normally has none.
const (
	inlineDisabledMessage  = "Inline tools are disabled on this installation: the tool is stored but not executable yet"
	inlineAvailableMessage = "Inline tool is callable; its runner starts on the first call"
)

// inlineActivatorRetry is how long to wait before re-checking an activator that
// is missing or has no available replica. There is no watch for it: a periodic
// re-check only runs while the Tool is unusable.
const inlineActivatorRetry = 30 * time.Second

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
		if !tool.DeletionTimestamp.IsZero() {
			return r.finalizeInline(ctx, tool)
		}
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
	// The finalizer goes on before any child exists, so a Tool deleted mid-way
	// through provisioning still has its children removed.
	if controllerutil.AddFinalizer(tool, InlineFinalizer) {
		if err := r.Update(ctx, tool); err != nil {
			return ctrl.Result{}, fmt.Errorf("failed to add the inline finalizer: %v", err)
		}
	}

	r.emitSourceChange(ctx, tool)

	verdict := r.evaluateInline(ctx, tool)
	if err := r.setInlineStatus(ctx, tool, verdict); err != nil {
		return ctrl.Result{}, err
	}
	if verdict.reason == arkv1alpha1.ToolReasonActivatorUnavailable {
		return ctrl.Result{RequeueAfter: inlineActivatorRetry}, nil
	}
	if verdict.reason == arkv1alpha1.ToolReasonProvisioningFailed {
		return ctrl.Result{}, fmt.Errorf("%s", verdict.message)
	}

	// Disabling the feature does not stop reconciliation, because the runner a
	// previous call scaled up would then have nothing authorised to scale it
	// down. The endpoint is already cleared above; this ends the pods.
	if !inlinetools.Enabled() {
		retry, err := r.drainInlineRunner(ctx, tool)
		return ctrl.Result{RequeueAfter: retry}, err
	}
	return ctrl.Result{}, nil
}

// setInlineStatus writes the verdict. The address is only ever stored together
// with Available=True for the generation just evaluated, so a reader that
// checks the condition can never act on an address from an older spec.
func (r *ToolReconciler) setInlineStatus(ctx context.Context, tool *arkv1alpha1.Tool, verdict inlineVerdict) error {
	status, state, address := metav1.ConditionFalse, arkv1alpha1.ToolStatePending, ""
	if verdict.available {
		status, state, address = metav1.ConditionTrue, arkv1alpha1.ToolStateReady, verdict.address
	}

	// A settled inline tool is not rewritten, mirroring the Ready short-circuit
	// on the non-inline path. Children are still reconciled above, and any change
	// of verdict is still a transition worth recording.
	if c := meta.FindStatusCondition(tool.Status.Conditions, arkv1alpha1.ToolConditionAvailable); c != nil &&
		c.ObservedGeneration == tool.Generation && c.Status == status &&
		c.Reason == verdict.reason && c.Message == verdict.message &&
		tool.Status.ResolvedAddress == address {
		return nil
	}

	tool.Status.State = state
	tool.Status.ResolvedAddress = address
	tool.Status.Message = verdict.message
	meta.SetStatusCondition(&tool.Status.Conditions, metav1.Condition{
		Type:               arkv1alpha1.ToolConditionAvailable,
		Status:             status,
		Reason:             verdict.reason,
		Message:            verdict.message,
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
