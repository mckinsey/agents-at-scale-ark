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
	"mckinsey.com/ark/internal/telemetry"
)

const (
	// Condition types
	ModelAvailable = "ModelAvailable"
)

type ModelReconciler struct {
	client.Client
	Scheme    *runtime.Scheme
	Recorder  record.EventRecorder
	Telemetry telemetry.Provider
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
	ctx, span := r.Telemetry.ModelRecorder().StartModelProbe(ctx, model.Name, model.Namespace)
	defer span.End()

	resolvedModel, err := genai.LoadModel(ctx, r.Client, &arkv1alpha1.AgentModelRef{
		Name:      model.Name,
		Namespace: model.Namespace,
	}, model.Namespace, nil, r.Telemetry.ModelRecorder())
	if err != nil {
		r.Telemetry.ModelRecorder().RecordError(span, err)
		return genai.ProbeResult{
			Available:     false,
			Message:       "Failed to load model configuration",
			DetailedError: err,
		}
	}

	result := genai.ProbeModel(ctx, resolvedModel)
	if !result.Available {
		r.Telemetry.ModelRecorder().RecordError(span, result.DetailedError)
	} else {
		r.Telemetry.ModelRecorder().RecordSuccess(span)
	}

	return result
}

// reconcileCondition updates a condition on the Model, emits an event if changed, and updates status
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

	// Emit event based on condition status
	eventType := corev1.EventTypeNormal
	if status == metav1.ConditionFalse {
		eventType = corev1.EventTypeWarning
	}
	r.Recorder.Event(model, eventType, reason, message)

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
