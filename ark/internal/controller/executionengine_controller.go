/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"fmt"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/handler"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

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
	case statusReady:
		return ctrl.Result{}, nil
	case statusRunning, statusError:
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
		return ctrl.Result{RequeueAfter: addressResolutionRetryInterval}, nil
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
		Watches(&corev1.Secret{}, handler.EnqueueRequestsFromMapFunc(r.mapSecretToExecutionEngines)).
		Watches(&corev1.ConfigMap{}, handler.EnqueueRequestsFromMapFunc(r.mapConfigMapToExecutionEngines)).
		Complete(r)
}

// mapSecretToExecutionEngines enqueues ExecutionEngines whose address references the Secret.
func (r *ExecutionEngineReconciler) mapSecretToExecutionEngines(ctx context.Context, obj client.Object) []reconcile.Request {
	return r.mapDependencyToExecutionEngines(ctx, obj, func(vf *arkv1prealpha1.ValueFromSource) bool {
		return vf.SecretKeyRef != nil && vf.SecretKeyRef.Name == obj.GetName()
	})
}

// mapConfigMapToExecutionEngines enqueues ExecutionEngines whose address references the ConfigMap.
func (r *ExecutionEngineReconciler) mapConfigMapToExecutionEngines(ctx context.Context, obj client.Object) []reconcile.Request {
	return r.mapDependencyToExecutionEngines(ctx, obj, func(vf *arkv1prealpha1.ValueFromSource) bool {
		return vf.ConfigMapKeyRef != nil && vf.ConfigMapKeyRef.Name == obj.GetName()
	})
}

// mapDependencyToExecutionEngines lists ExecutionEngines in the changed
// object's namespace (typically a small set) and returns those whose address
// matches. On a list error it returns nil rather than failing: the requeue
// poll is the recovery backstop, so a missed watch event is not fatal.
func (r *ExecutionEngineReconciler) mapDependencyToExecutionEngines(ctx context.Context, obj client.Object, matches func(*arkv1prealpha1.ValueFromSource) bool) []reconcile.Request {
	var engines arkv1prealpha1.ExecutionEngineList
	if err := r.List(ctx, &engines, client.InNamespace(obj.GetNamespace())); err != nil {
		logf.FromContext(ctx).Error(err, "failed to list ExecutionEngines for dependency mapping", "namespace", obj.GetNamespace())
		return nil
	}

	var requests []reconcile.Request
	for i := range engines.Items {
		vf := engines.Items[i].Spec.Address.ValueFrom
		if vf != nil && matches(vf) {
			requests = append(requests, reconcile.Request{
				NamespacedName: types.NamespacedName{
					Name:      engines.Items[i].Name,
					Namespace: engines.Items[i].Namespace,
				},
			})
		}
	}
	return requests
}
