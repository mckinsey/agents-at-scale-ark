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
	"mckinsey.com/ark/internal/telemetry"
	telemetryconfig "mckinsey.com/ark/internal/telemetry/config"
)

const (
	InteractionPhasePending   = "pending"
	InteractionPhaseCompleted = "completed"
	InteractionPhaseRejected  = "rejected"
	InteractionPhaseExpired   = "expired"

	ConditionTypeResponseReceived = "ResponseReceived"

	DefaultInteractionTTL = 24 * time.Hour
)

type ToolInteractionReconciler struct {
	client.Client
	Scheme    *runtime.Scheme
	Eventing  *eventingconfig.Provider
	Telemetry *telemetryconfig.Provider
}

// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=toolinteractions,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=toolinteractions/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=toolinteractions/finalizers,verbs=update
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=queries,verbs=get;list;watch;update;patch

func (r *ToolInteractionReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	ti := &arkv1alpha1.ToolInteraction{}
	if err := r.Get(ctx, req.NamespacedName, ti); err != nil {
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}

	if ti.Status.Phase == "" {
		return r.initializeStatus(ctx, ti)
	}

	if isInteractionTerminalPhase(ti.Status.Phase) {
		return r.checkTTLCleanup(ctx, ti)
	}

	if ti.Status.Response != nil {
		return r.handleResponse(ctx, ti)
	}

	return r.checkTimeout(ctx, ti)
}

func (r *ToolInteractionReconciler) initializeStatus(ctx context.Context, ti *arkv1alpha1.ToolInteraction) (ctrl.Result, error) {
	now := metav1.Now()
	ti.Status.Phase = InteractionPhasePending
	ti.Status.RequestedAt = &now
	ti.Status.ObservedGeneration = ti.Generation

	meta.SetStatusCondition(&ti.Status.Conditions, metav1.Condition{
		Type:               ConditionTypeResponseReceived,
		Status:             metav1.ConditionFalse,
		Reason:             "AwaitingResponse",
		Message:            fmt.Sprintf("Waiting for %s interaction response", ti.Spec.Type),
		ObservedGeneration: ti.Generation,
	})

	if err := r.Status().Update(ctx, ti); err != nil {
		return ctrl.Result{}, fmt.Errorf("failed to initialize status: %w", err)
	}

	r.emitEvent(ctx, ti, corev1.EventTypeNormal, "InteractionRequested", fmt.Sprintf("Tool interaction (%s) requested for %d tool call(s)", ti.Spec.Type, len(ti.Spec.ToolCalls)))

	if ti.Spec.Timeout != nil {
		return ctrl.Result{RequeueAfter: ti.Spec.Timeout.Duration}, nil
	}
	return ctrl.Result{RequeueAfter: time.Hour}, nil
}

func (r *ToolInteractionReconciler) handleResponse(ctx context.Context, ti *arkv1alpha1.ToolInteraction) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	if r.Telemetry != nil {
		var span telemetry.Span
		ctx, span = r.Telemetry.Tracer().Start(ctx, fmt.Sprintf("interaction.%s.response", ti.Name),
			telemetry.WithAttributes(
				telemetry.String("interaction.name", ti.Name),
				telemetry.String("interaction.namespace", ti.Namespace),
				telemetry.String("interaction.type", string(ti.Spec.Type)),
				telemetry.String("interaction.query", ti.Spec.QueryRef.Name),
				telemetry.String("interaction.responded_by", ti.Status.Response.RespondedBy),
			),
		)
		defer span.End()
	}

	if isInteractionTerminalPhase(ti.Status.Phase) {
		log.Info("Skipping response handling - interaction already in terminal phase",
			"ti", ti.Name,
			"phase", ti.Status.Phase)
		return ctrl.Result{}, nil
	}

	if ti.Status.ObservedGeneration != ti.Generation {
		log.Info("Rejecting response due to generation mismatch",
			"observedGeneration", ti.Status.ObservedGeneration,
			"currentGeneration", ti.Generation)
		return ctrl.Result{}, nil
	}

	response := ti.Status.Response
	var newPhase string
	var conditionReason string
	var conditionMessage string

	switch ti.Spec.Type {
	case arkv1alpha1.InteractionTypeApproval:
		if response.Approval != nil {
			switch response.Approval.Action {
			case "approved":
				newPhase = InteractionPhaseCompleted
				conditionReason = "Approved"
				conditionMessage = fmt.Sprintf("Tool calls approved by %s", response.RespondedBy)
			case "rejected":
				newPhase = InteractionPhaseRejected
				conditionReason = "Rejected"
				conditionMessage = fmt.Sprintf("Tool calls rejected by %s", response.RespondedBy)
				if response.Approval.Reason != "" {
					conditionMessage = fmt.Sprintf("%s: %s", conditionMessage, response.Approval.Reason)
				}
			default:
				return ctrl.Result{}, fmt.Errorf("unknown approval action: %s", response.Approval.Action)
			}
		}
	case arkv1alpha1.InteractionTypeInput:
		if response.Input != nil {
			newPhase = InteractionPhaseCompleted
			conditionReason = "InputProvided"
			conditionMessage = fmt.Sprintf("Input provided by %s", response.RespondedBy)
		}
	case arkv1alpha1.InteractionTypeSelection:
		if response.Selection != nil {
			newPhase = InteractionPhaseCompleted
			conditionReason = "SelectionMade"
			conditionMessage = fmt.Sprintf("Selection made by %s: %v", response.RespondedBy, response.Selection.Selected)
		}
	case arkv1alpha1.InteractionTypeConfirmation:
		if response.Confirmation != nil {
			if response.Confirmation.Confirmed {
				newPhase = InteractionPhaseCompleted
				conditionReason = "Confirmed"
				conditionMessage = fmt.Sprintf("Confirmed by %s", response.RespondedBy)
			} else {
				newPhase = InteractionPhaseRejected
				conditionReason = "NotConfirmed"
				conditionMessage = fmt.Sprintf("Not confirmed by %s", response.RespondedBy)
			}
		}
	default:
		return ctrl.Result{}, fmt.Errorf("unknown interaction type: %s", ti.Spec.Type)
	}

	if newPhase == "" {
		return ctrl.Result{}, fmt.Errorf("response does not match interaction type %s", ti.Spec.Type)
	}

	ti.Status.Phase = newPhase

	if ti.Status.RequestedAt != nil {
		duration := response.RespondedAt.Sub(ti.Status.RequestedAt.Time)
		ti.Status.ResponseDuration = &metav1.Duration{Duration: duration}
	}

	meta.SetStatusCondition(&ti.Status.Conditions, metav1.Condition{
		Type:               ConditionTypeResponseReceived,
		Status:             metav1.ConditionTrue,
		Reason:             conditionReason,
		Message:            conditionMessage,
		ObservedGeneration: ti.Generation,
	})

	if err := r.Status().Update(ctx, ti); err != nil {
		return ctrl.Result{}, fmt.Errorf("failed to update status after response: %w", err)
	}

	eventType := corev1.EventTypeNormal
	if newPhase == InteractionPhaseRejected {
		eventType = corev1.EventTypeWarning
	}
	r.emitEvent(ctx, ti, eventType, conditionReason, conditionMessage)

	if err := r.resumeQuery(ctx, ti); err != nil {
		log.Error(err, "Failed to resume query after interaction response")
	}

	return ctrl.Result{}, nil
}

func (r *ToolInteractionReconciler) checkTimeout(ctx context.Context, ti *arkv1alpha1.ToolInteraction) (ctrl.Result, error) {
	if ti.Spec.Timeout == nil || ti.Status.RequestedAt == nil {
		return ctrl.Result{RequeueAfter: time.Hour}, nil
	}

	expiryTime := ti.Status.RequestedAt.Add(ti.Spec.Timeout.Duration)
	now := time.Now()

	if now.Before(expiryTime) {
		return ctrl.Result{RequeueAfter: expiryTime.Sub(now)}, nil
	}

	return r.handleTimeout(ctx, ti)
}

func (r *ToolInteractionReconciler) handleTimeout(ctx context.Context, ti *arkv1alpha1.ToolInteraction) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	if r.Telemetry != nil {
		var span telemetry.Span
		ctx, span = r.Telemetry.Tracer().Start(ctx, fmt.Sprintf("interaction.%s.timeout", ti.Name),
			telemetry.WithAttributes(
				telemetry.String("interaction.name", ti.Name),
				telemetry.String("interaction.namespace", ti.Namespace),
				telemetry.String("interaction.type", string(ti.Spec.Type)),
				telemetry.String("interaction.query", ti.Spec.QueryRef.Name),
				telemetry.String("interaction.on_timeout", ti.Spec.OnTimeout),
			),
		)
		defer span.End()
	}

	onTimeout := ti.Spec.OnTimeout
	if onTimeout == "" {
		onTimeout = "reject"
	}

	now := metav1.Now()
	ti.Status.Phase = InteractionPhaseExpired
	ti.Status.Response = &arkv1alpha1.InteractionResponse{
		RespondedBy: "system/timeout",
		RespondedAt: now,
	}

	if ti.Spec.Type == arkv1alpha1.InteractionTypeApproval {
		ti.Status.Response.Approval = &arkv1alpha1.ApprovalResponse{
			Action: "rejected",
			Reason: fmt.Sprintf("Interaction request timed out after %s", ti.Spec.Timeout.Duration),
		}
	}

	if ti.Status.RequestedAt != nil {
		duration := now.Sub(ti.Status.RequestedAt.Time)
		ti.Status.ResponseDuration = &metav1.Duration{Duration: duration}
	}

	meta.SetStatusCondition(&ti.Status.Conditions, metav1.Condition{
		Type:               ConditionTypeResponseReceived,
		Status:             metav1.ConditionTrue,
		Reason:             "Expired",
		Message:            fmt.Sprintf("Interaction request expired, action: %s", onTimeout),
		ObservedGeneration: ti.Generation,
	})

	if err := r.Status().Update(ctx, ti); err != nil {
		return ctrl.Result{}, fmt.Errorf("failed to update status after timeout: %w", err)
	}

	r.emitEvent(ctx, ti, corev1.EventTypeWarning, "InteractionExpired", fmt.Sprintf("Interaction request expired after %s, action: %s", ti.Spec.Timeout.Duration, onTimeout))

	if onTimeout == "proceed" {
		ti.Status.Phase = InteractionPhaseCompleted
		if ti.Spec.Type == arkv1alpha1.InteractionTypeApproval && ti.Status.Response.Approval != nil {
			ti.Status.Response.Approval.Action = "approved"
		}
		if err := r.Status().Update(ctx, ti); err != nil {
			return ctrl.Result{}, fmt.Errorf("failed to update status for proceed-on-timeout: %w", err)
		}
	}

	if err := r.resumeQuery(ctx, ti); err != nil {
		log.Error(err, "Failed to resume query after timeout")
	}

	return ctrl.Result{}, nil
}

func (r *ToolInteractionReconciler) resumeQuery(ctx context.Context, ti *arkv1alpha1.ToolInteraction) error {
	log := logf.FromContext(ctx)

	queryRef := ti.Spec.QueryRef
	query := &arkv1alpha1.Query{}
	if err := r.Get(ctx, types.NamespacedName{Name: queryRef.Name, Namespace: queryRef.Namespace}, query); err != nil {
		return fmt.Errorf("failed to get query %s/%s: %w", queryRef.Namespace, queryRef.Name, err)
	}

	if query.Status.Phase != "interaction-required" {
		log.Info("Query is not in interaction-required phase, skipping resume",
			"query", queryRef.Name,
			"phase", query.Status.Phase)
		return nil
	}

	if ti.Status.Phase == InteractionPhaseCompleted {
		query.Status.Phase = "running"
		query.Status.InteractionRef = &arkv1alpha1.ToolInteractionRef{
			Name:      ti.Name,
			Namespace: ti.Namespace,
		}
	} else {
		query.Status.Phase = "error"
		errorMsg := buildInteractionErrorMessage(ti)
		query.Status.Error = errorMsg
		query.Status.InteractionRef = nil
	}

	if err := r.Status().Update(ctx, query); err != nil {
		return fmt.Errorf("failed to update query status: %w", err)
	}

	if query.Annotations == nil {
		query.Annotations = make(map[string]string)
	}
	query.Annotations["ark.mckinsey.com/resumed-at"] = time.Now().Format(time.RFC3339Nano)
	if err := r.Update(ctx, query); err != nil {
		log.Error(err, "Failed to update query annotation for reconcile trigger", "query", queryRef.Name)
	}

	log.Info("Resumed query after interaction response",
		"query", queryRef.Name,
		"phase", ti.Status.Phase)

	return nil
}

func isInteractionTerminalPhase(phase string) bool {
	return phase == InteractionPhaseCompleted ||
		phase == InteractionPhaseRejected ||
		phase == InteractionPhaseExpired
}

func buildInteractionErrorMessage(ti *arkv1alpha1.ToolInteraction) string {
	if ti.Status.Phase == InteractionPhaseExpired {
		timeout := "unknown"
		if ti.Spec.Timeout != nil {
			timeout = ti.Spec.Timeout.Duration.String()
		}
		return fmt.Sprintf("Tool interaction expired after %s without response", timeout)
	}

	if ti.Status.Response == nil {
		return "Tool interaction failed: no response received"
	}

	response := ti.Status.Response
	switch ti.Spec.Type {
	case arkv1alpha1.InteractionTypeApproval:
		if response.Approval != nil {
			if response.Approval.Reason != "" {
				return fmt.Sprintf("Tool execution rejected by %s: %s",
					response.RespondedBy, response.Approval.Reason)
			}
			return fmt.Sprintf("Tool execution rejected by %s", response.RespondedBy)
		}
	case arkv1alpha1.InteractionTypeConfirmation:
		if response.Confirmation != nil && !response.Confirmation.Confirmed {
			return fmt.Sprintf("Tool execution not confirmed by %s", response.RespondedBy)
		}
	}

	return fmt.Sprintf("Tool interaction %s failed", ti.Spec.Type)
}

func (r *ToolInteractionReconciler) checkTTLCleanup(ctx context.Context, ti *arkv1alpha1.ToolInteraction) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	if ti.Status.Response == nil || ti.Status.Response.RespondedAt.IsZero() {
		return ctrl.Result{RequeueAfter: DefaultInteractionTTL}, nil
	}

	completedAt := ti.Status.Response.RespondedAt.Time
	ttlExpiry := completedAt.Add(DefaultInteractionTTL)
	now := time.Now()

	if now.Before(ttlExpiry) {
		return ctrl.Result{RequeueAfter: ttlExpiry.Sub(now)}, nil
	}

	log.Info("Deleting completed ToolInteraction after TTL",
		"ti", ti.Name,
		"phase", ti.Status.Phase,
		"completedAt", completedAt,
		"ttl", DefaultInteractionTTL)

	if err := r.Delete(ctx, ti); err != nil {
		return ctrl.Result{}, fmt.Errorf("failed to delete ToolInteraction after TTL: %w", err)
	}

	return ctrl.Result{}, nil
}

func (r *ToolInteractionReconciler) emitEvent(ctx context.Context, ti *arkv1alpha1.ToolInteraction, eventType, reason, message string) {
	log := logf.FromContext(ctx)
	log.Info("ToolInteraction event", "type", eventType, "reason", reason, "message", message, "ti", ti.Name)
}

func (r *ToolInteractionReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&arkv1alpha1.ToolInteraction{}).
		Named("toolinteraction").
		Complete(r)
}
