/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"

	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/eventing"
	eventnoop "mckinsey.com/ark/internal/eventing/noop"
	"mckinsey.com/ark/internal/genai"
	"mckinsey.com/ark/internal/telemetry"
	telenoop "mckinsey.com/ark/internal/telemetry/noop"
)

const (
	// Condition types
	ModelAvailable = "ModelAvailable"
)

type ModelReconciler struct {
	client.Client
	Scheme    *runtime.Scheme
	Telemetry telemetry.Provider
	Eventing  eventing.Provider
}

// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=models,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=models/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=models/finalizers,verbs=update
// +kubebuilder:rbac:groups="",resources=events,verbs=create;patch
// +kubebuilder:rbac:groups="",resources=secrets,verbs=get;list;watch
// +kubebuilder:rbac:groups="",resources=configmaps,verbs=get;list;watch

func (r *ModelReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	var model arkv1alpha1.Model
	if err := r.Get(ctx, req.NamespacedName, &model); err != nil {
		if client.IgnoreNotFound(err) != nil {
			log.Error(err, "unable to fetch model", "model", req.NamespacedName)
		}
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}

	// Initialize conditions if empty
	if len(model.Status.Conditions) == 0 {
		if _, err := r.reconcileCondition(ctx, &model, ModelAvailable, metav1.ConditionUnknown, "Initializing", "Model availability is being determined"); err != nil {
			return ctrl.Result{}, err
		}
	}

	// Probe the model to test whether it is available.
	result := r.probeModel(ctx, model)

	if !result.Available {
		changed, err := r.reconcileCondition(ctx, &model, ModelAvailable, metav1.ConditionFalse, "ModelProbeFailed", result.Message)
		if err != nil {
			return ctrl.Result{}, err
		}
		// Log the failure only when condition changes
		if changed {
			r.Eventing.ModelRecorder().ModelUnavailable(ctx, &model, result.Message)
			log.Info("model probe failed",
				"model", model.Name,
				"status", result.Message,
				"details", result.DetailedError)
		}
		return ctrl.Result{RequeueAfter: model.Spec.PollInterval.Duration}, nil
	}

	// Success case - model is available
	if _, err := r.reconcileCondition(ctx, &model, ModelAvailable, metav1.ConditionTrue, "Available", result.Message); err != nil {
		return ctrl.Result{}, err
	}

	// Continue polling at regular interval
	return ctrl.Result{RequeueAfter: model.Spec.PollInterval.Duration}, nil
}

func (r *ModelReconciler) probeModel(ctx context.Context, model arkv1alpha1.Model) genai.ProbeResult {
	noopTelemetryRecorder := telenoop.NewModelRecorder()
	noopEventingRecorder := eventnoop.NewModelRecorder()
	resolvedModel, err := genai.LoadModel(ctx, r.Client, &arkv1alpha1.AgentModelRef{
		Name:      model.Name,
		Namespace: model.Namespace,
	}, model.Namespace, nil, noopTelemetryRecorder, noopEventingRecorder)
	if err != nil {
		return genai.ProbeResult{
			Available:     false,
			Message:       err.Error(),
			DetailedError: err,
		}
	}

	result := genai.ProbeModel(ctx, resolvedModel)
	return result
}

// reconcileCondition updates a condition on the Model and updates status
// Returns true if the condition changed, false otherwise
func (r *ModelReconciler) reconcileCondition(ctx context.Context, model *arkv1alpha1.Model, conditionType string, status metav1.ConditionStatus, reason, message string) (bool, error) {
	changed := meta.SetStatusCondition(&model.Status.Conditions, metav1.Condition{
		Type:               conditionType,
		Status:             status,
		Reason:             reason,
		Message:            message,
		ObservedGeneration: model.Generation,
	})

	if !changed {
		return false, nil
	}

	// Update status
	return true, r.updateStatus(ctx, model)
}

// updateStatus updates the Model status
func (r *ModelReconciler) updateStatus(ctx context.Context, model *arkv1alpha1.Model) error {
	if ctx.Err() != nil {
		return nil
	}

	err := r.Status().Update(ctx, model)
	if err != nil {
		logf.FromContext(ctx).Error(err, "failed to update model status")
	}
	return err
}

func (r *ModelReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&arkv1alpha1.Model{}).
		Named("model").
		Complete(r)
}
