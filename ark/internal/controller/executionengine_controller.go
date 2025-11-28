/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"fmt"

	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/common"
	"mckinsey.com/ark/internal/eventing"
)

// ExecutionEngineReconciler reconciles an ExecutionEngine object
type ExecutionEngineReconciler struct {
	client.Client
	Scheme   *runtime.Scheme
	Eventing eventing.Provider
	resolver *common.ValueSourceResolverV1PreAlpha1
}

// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=executionengines,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=executionengines/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=executionengines/finalizers,verbs=update
// +kubebuilder:rbac:groups="",resources=events,verbs=create;patch
// +kubebuilder:rbac:groups="",resources=secrets,verbs=get;list;watch
// +kubebuilder:rbac:groups="",resources=configmaps,verbs=get;list;watch
// +kubebuilder:rbac:groups="",resources=services,verbs=get;list;watch

func (r *ExecutionEngineReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	var executionEngine arkv1prealpha1.ExecutionEngine
	if err := r.Get(ctx, req.NamespacedName, &executionEngine); err != nil {
		if errors.IsNotFound(err) {
			log.Info("ExecutionEngine deleted", "executionEngine", req.Name)
			return ctrl.Result{}, nil
		}
		log.Error(err, "unable to fetch ExecutionEngine")
		return ctrl.Result{}, err
	}

	switch executionEngine.Status.Phase {
	case statusReady, statusError:
		return ctrl.Result{}, nil
	case statusRunning:
		return r.processExecutionEngine(ctx, executionEngine)
	default:
		if err := r.updateStatus(ctx, executionEngine, statusRunning, "Resolving execution engine address"); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}
}

func (r *ExecutionEngineReconciler) getResolver() *common.ValueSourceResolverV1PreAlpha1 {
	if r.resolver == nil {
		r.resolver = common.NewValueSourceResolverV1PreAlpha1(r.Client)
	}
	return r.resolver
}

func (r *ExecutionEngineReconciler) processExecutionEngine(ctx context.Context, executionEngine arkv1prealpha1.ExecutionEngine) (ctrl.Result, error) {
	log := logf.FromContext(ctx)
	log.Info("Processing execution engine", "executionEngine", executionEngine.Name)

	resolver := r.getResolver()
	resolvedAddress, err := resolver.ResolveValueSource(ctx, executionEngine.Spec.Address, executionEngine.Namespace)
	if err != nil {
		log.Error(err, "failed to resolve ExecutionEngine address", "executionEngine", executionEngine.Name)
		r.Eventing.ExecutionEngineRecorder().AddressResolutionFailed(ctx, &executionEngine, fmt.Sprintf("Failed to resolve address: %v", err))
		if err := r.updateStatus(ctx, executionEngine, statusError, fmt.Sprintf("Failed to resolve address: %v", err)); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	executionEngine.Status.LastResolvedAddress = resolvedAddress

	if err := r.updateStatus(ctx, executionEngine, statusReady, "ExecutionEngine address resolved successfully"); err != nil {
		return ctrl.Result{}, err
	}

	log.Info("ExecutionEngine processed successfully", "executionEngine", executionEngine.Name, "resolvedAddress", resolvedAddress)
	return ctrl.Result{}, nil
}

func (r *ExecutionEngineReconciler) updateStatus(ctx context.Context, executionEngine arkv1prealpha1.ExecutionEngine, status, message string) error {
	if ctx.Err() != nil {
		return nil
	}
	executionEngine.Status.Phase = status
	executionEngine.Status.Message = message
	err := r.Status().Update(ctx, &executionEngine)
	if err != nil {
		logf.FromContext(ctx).Error(err, "failed to update ExecutionEngine status", "status", status)
	}
	return err
}

func (r *ExecutionEngineReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&arkv1prealpha1.ExecutionEngine{}).
		Complete(r)
}
