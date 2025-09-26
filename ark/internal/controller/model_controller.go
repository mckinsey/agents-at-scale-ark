/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/tools/record"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/genai"
)

const (
	// Condition types
	ModelAvailable = "ModelAvailable"
)

type ModelReconciler struct {
	client.Client
	Scheme   *runtime.Scheme
	Recorder record.EventRecorder
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
		r.setCondition(&model, ModelAvailable, metav1.ConditionUnknown, "Initializing", "Model availability is being determined")
		if err := r.updateStatus(ctx, &model); err != nil {
			return ctrl.Result{}, err
		}
		// Return early to avoid double reconciliation, let the status update trigger next reconcile
		return ctrl.Result{}, nil
	}

	// Probe the model to test whether it is available.
	result := r.probeModel(ctx, model)

	if !result.Available {
		// Log the failure with a detailed error message. This is still 'info'
		// as probe failures are expected - the model events and conditions
		// will make the error clear to the user.
		log.Info("model probe failed",
			"model", model.Name,
			"status", result.Message,
			"details", result.DetailedError)

		// Update the condition and events with the (stable) error message.
		r.setCondition(&model, ModelAvailable, metav1.ConditionFalse, "ModelProbeFailed", result.Message)
		r.Recorder.Event(&model, corev1.EventTypeWarning, "ModelProbeFailed", result.Message)

		// Update the status and re-attempt after the poll interval.
		if err := r.updateStatus(ctx, &model); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{RequeueAfter: model.Spec.PollInterval.Duration}, nil
	}

	// Success case - model is available
	r.setCondition(&model, ModelAvailable, metav1.ConditionTrue, "Available", result.Message)
	r.Recorder.Event(&model, corev1.EventTypeNormal, "ModelProbeSucceeded", result.Message)

	if err := r.updateStatus(ctx, &model); err != nil {
		return ctrl.Result{}, err
	}

	// Continue polling at regular interval
	return ctrl.Result{RequeueAfter: model.Spec.PollInterval.Duration}, nil
}

func (r *ModelReconciler) probeModel(ctx context.Context, model arkv1alpha1.Model) genai.ProbeResult {
	resolvedModel, err := genai.LoadModel(ctx, r.Client, &arkv1alpha1.AgentModelRef{
		Name:      model.Name,
		Namespace: model.Namespace,
	}, model.Namespace)
	if err != nil {
		return genai.ProbeResult{
			Available:     false,
			Message:       "Failed to load model configuration",
			DetailedError: err,
		}
	}

	return genai.ProbeModel(ctx, resolvedModel)
}

// setCondition sets a condition on the Model
func (r *ModelReconciler) setCondition(model *arkv1alpha1.Model, conditionType string, status metav1.ConditionStatus, reason, message string) {
	meta.SetStatusCondition(&model.Status.Conditions, metav1.Condition{
		Type:               conditionType,
		Status:             status,
		Reason:             reason,
		Message:            message,
		ObservedGeneration: model.Generation,
	})
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
