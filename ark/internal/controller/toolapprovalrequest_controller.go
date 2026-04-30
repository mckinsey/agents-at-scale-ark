/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"fmt"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	eventingconfig "mckinsey.com/ark/internal/eventing/config"
)

const (
	ApprovalPhasePending  = "pending"
	ApprovalPhaseApproved = "approved"
	ApprovalPhaseRejected = "rejected"
	ApprovalPhaseExpired  = "expired"

	ConditionTypeDecisionMade = "DecisionMade"
)

type ToolApprovalRequestReconciler struct {
	client.Client
	Scheme   *runtime.Scheme
	Eventing *eventingconfig.Provider
}

// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=toolapprovalrequests,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=toolapprovalrequests/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=toolapprovalrequests/finalizers,verbs=update
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=queries,verbs=get;list;watch;update;patch

func (r *ToolApprovalRequestReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	tar := &arkv1alpha1.ToolApprovalRequest{}
	if err := r.Get(ctx, req.NamespacedName, tar); err != nil {
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}

	if tar.Status.Phase == "" {
		return r.initializeStatus(ctx, tar)
	}

	if isTerminalPhase(tar.Status.Phase) {
		return ctrl.Result{}, nil
	}

	if tar.Status.Decision != nil {
		return r.handleDecision(ctx, tar)
	}

	return r.checkTimeout(ctx, tar)
}

func (r *ToolApprovalRequestReconciler) initializeStatus(ctx context.Context, tar *arkv1alpha1.ToolApprovalRequest) (ctrl.Result, error) {
	now := metav1.Now()
	tar.Status.Phase = ApprovalPhasePending
	tar.Status.RequestedAt = &now
	tar.Status.ObservedGeneration = tar.Generation

	meta.SetStatusCondition(&tar.Status.Conditions, metav1.Condition{
		Type:               ConditionTypeDecisionMade,
		Status:             metav1.ConditionFalse,
		Reason:             "AwaitingDecision",
		Message:            "Waiting for human approval decision",
		ObservedGeneration: tar.Generation,
	})

	if err := r.Status().Update(ctx, tar); err != nil {
		return ctrl.Result{}, fmt.Errorf("failed to initialize status: %w", err)
	}

	r.emitEvent(ctx, tar, corev1.EventTypeNormal, "ApprovalRequested", fmt.Sprintf("Tool approval requested for %d tool call(s)", len(tar.Spec.ToolCalls)))

	if tar.Spec.Timeout != nil {
		return ctrl.Result{RequeueAfter: tar.Spec.Timeout.Duration}, nil
	}
	return ctrl.Result{RequeueAfter: time.Hour}, nil
}

func (r *ToolApprovalRequestReconciler) handleDecision(ctx context.Context, tar *arkv1alpha1.ToolApprovalRequest) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	if tar.Status.ObservedGeneration != tar.Generation {
		log.Info("Rejecting decision due to generation mismatch",
			"observedGeneration", tar.Status.ObservedGeneration,
			"currentGeneration", tar.Generation)
		return ctrl.Result{}, nil
	}

	decision := tar.Status.Decision
	var newPhase string
	var conditionReason string
	var conditionMessage string

	switch decision.Action {
	case "approved":
		newPhase = ApprovalPhaseApproved
		conditionReason = "Approved"
		conditionMessage = fmt.Sprintf("Tool calls approved by %s", decision.DecidedBy)
	case "rejected":
		newPhase = ApprovalPhaseRejected
		conditionReason = "Rejected"
		conditionMessage = fmt.Sprintf("Tool calls rejected by %s", decision.DecidedBy)
		if decision.Reason != "" {
			conditionMessage = fmt.Sprintf("%s: %s", conditionMessage, decision.Reason)
		}
	default:
		return ctrl.Result{}, fmt.Errorf("unknown decision action: %s", decision.Action)
	}

	tar.Status.Phase = newPhase

	if tar.Status.RequestedAt != nil {
		duration := decision.DecidedAt.Sub(tar.Status.RequestedAt.Time)
		tar.Status.ApprovalDuration = &metav1.Duration{Duration: duration}
	}

	meta.SetStatusCondition(&tar.Status.Conditions, metav1.Condition{
		Type:               ConditionTypeDecisionMade,
		Status:             metav1.ConditionTrue,
		Reason:             conditionReason,
		Message:            conditionMessage,
		ObservedGeneration: tar.Generation,
	})

	if err := r.Status().Update(ctx, tar); err != nil {
		return ctrl.Result{}, fmt.Errorf("failed to update status after decision: %w", err)
	}

	eventType := corev1.EventTypeNormal
	if newPhase == ApprovalPhaseRejected {
		eventType = corev1.EventTypeWarning
	}
	r.emitEvent(ctx, tar, eventType, conditionReason, conditionMessage)

	if err := r.resumeQuery(ctx, tar); err != nil {
		log.Error(err, "Failed to resume query after approval decision")
	}

	return ctrl.Result{}, nil
}

func (r *ToolApprovalRequestReconciler) checkTimeout(ctx context.Context, tar *arkv1alpha1.ToolApprovalRequest) (ctrl.Result, error) {
	if tar.Spec.Timeout == nil || tar.Status.RequestedAt == nil {
		return ctrl.Result{RequeueAfter: time.Hour}, nil
	}

	expiryTime := tar.Status.RequestedAt.Add(tar.Spec.Timeout.Duration)
	now := time.Now()

	if now.Before(expiryTime) {
		return ctrl.Result{RequeueAfter: expiryTime.Sub(now)}, nil
	}

	return r.handleTimeout(ctx, tar)
}

func (r *ToolApprovalRequestReconciler) handleTimeout(ctx context.Context, tar *arkv1alpha1.ToolApprovalRequest) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	onTimeout := tar.Spec.OnTimeout
	if onTimeout == "" {
		onTimeout = "reject"
	}

	now := metav1.Now()
	tar.Status.Phase = ApprovalPhaseExpired
	tar.Status.Decision = &arkv1alpha1.ApprovalDecision{
		Action:    "rejected",
		DecidedBy: "system/timeout",
		DecidedAt: now,
		Reason:    fmt.Sprintf("Approval request timed out after %s", tar.Spec.Timeout.Duration),
	}

	if tar.Status.RequestedAt != nil {
		duration := now.Sub(tar.Status.RequestedAt.Time)
		tar.Status.ApprovalDuration = &metav1.Duration{Duration: duration}
	}

	meta.SetStatusCondition(&tar.Status.Conditions, metav1.Condition{
		Type:               ConditionTypeDecisionMade,
		Status:             metav1.ConditionTrue,
		Reason:             "Expired",
		Message:            fmt.Sprintf("Approval request expired, action: %s", onTimeout),
		ObservedGeneration: tar.Generation,
	})

	if err := r.Status().Update(ctx, tar); err != nil {
		return ctrl.Result{}, fmt.Errorf("failed to update status after timeout: %w", err)
	}

	r.emitEvent(ctx, tar, corev1.EventTypeWarning, "ApprovalExpired", fmt.Sprintf("Approval request expired after %s, action: %s", tar.Spec.Timeout.Duration, onTimeout))

	if onTimeout == "proceed" {
		tar.Status.Phase = ApprovalPhaseApproved
		tar.Status.Decision.Action = "approved"
		if err := r.Status().Update(ctx, tar); err != nil {
			return ctrl.Result{}, fmt.Errorf("failed to update status for proceed-on-timeout: %w", err)
		}
	}

	if err := r.resumeQuery(ctx, tar); err != nil {
		log.Error(err, "Failed to resume query after timeout")
	}

	return ctrl.Result{}, nil
}

func (r *ToolApprovalRequestReconciler) resumeQuery(ctx context.Context, tar *arkv1alpha1.ToolApprovalRequest) error {
	log := logf.FromContext(ctx)

	queryRef := tar.Spec.QueryRef
	query := &arkv1alpha1.Query{}
	if err := r.Get(ctx, types.NamespacedName{Name: queryRef.Name, Namespace: queryRef.Namespace}, query); err != nil {
		return fmt.Errorf("failed to get query %s/%s: %w", queryRef.Namespace, queryRef.Name, err)
	}

	if query.Status.Phase != "approval-required" {
		log.Info("Query is not in approval-required phase, skipping resume",
			"query", queryRef.Name,
			"phase", query.Status.Phase)
		return nil
	}

	if tar.Status.Phase == ApprovalPhaseApproved {
		query.Status.Phase = "running"
		query.Status.ApprovalRef = &arkv1alpha1.ToolApprovalRef{
			Name:      tar.Name,
			Namespace: tar.Namespace,
		}
	} else {
		query.Status.Phase = "error"
		query.Status.Error = fmt.Sprintf("Tool approval %s: %s",
			tar.Status.Decision.Action,
			tar.Status.Decision.Reason)
		query.Status.ApprovalRef = nil
	}

	if err := r.Status().Update(ctx, query); err != nil {
		return fmt.Errorf("failed to update query status: %w", err)
	}

	log.Info("Resumed query after approval decision",
		"query", queryRef.Name,
		"decision", tar.Status.Decision.Action)

	return nil
}

func isTerminalPhase(phase string) bool {
	return phase == ApprovalPhaseApproved ||
		phase == ApprovalPhaseRejected ||
		phase == ApprovalPhaseExpired
}

func (r *ToolApprovalRequestReconciler) emitEvent(ctx context.Context, tar *arkv1alpha1.ToolApprovalRequest, eventType, reason, message string) {
	if r.Eventing == nil {
		return
	}
	emitter := r.Eventing.EventEmitter()
	if emitter == nil {
		return
	}
	if eventType == corev1.EventTypeNormal {
		emitter.EmitNormal(ctx, tar, reason, message)
	} else {
		emitter.EmitWarning(ctx, tar, reason, message)
	}
}

func (r *ToolApprovalRequestReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&arkv1alpha1.ToolApprovalRequest{}).
		Named("toolapprovalrequest").
		Complete(r)
}
