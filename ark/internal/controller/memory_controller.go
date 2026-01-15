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

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
)

// MemoryReconciler reconciles a Memory object
type MemoryReconciler struct {
	client.Client
	Scheme   *runtime.Scheme
	resolver *common.ValueSourceResolver
}

// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=memories,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=memories/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=memories/finalizers,verbs=update
// +kubebuilder:rbac:groups="",resources=events,verbs=create;patch
// +kubebuilder:rbac:groups="",resources=secrets,verbs=get;list;watch
// +kubebuilder:rbac:groups="",resources=configmaps,verbs=get;list;watch
// +kubebuilder:rbac:groups="",resources=services,verbs=get;list;watch

func (r *MemoryReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	var memory arkv1alpha1.Memory
	if err := r.Get(ctx, req.NamespacedName, &memory); err != nil {
		if errors.IsNotFound(err) {
			log.Info("Memory deleted", "memory", req.Name)
			return ctrl.Result{}, nil
		}
		log.Error(err, "unable to fetch Memory")
		return ctrl.Result{}, err
	}

	// State machine approach following MCPServer pattern
	switch memory.Status.Phase {
	case statusReady, statusError:
		// Terminal states - no further processing needed
		return ctrl.Result{}, nil
	case statusRunning:
		// Continue processing
		return r.processMemory(ctx, memory)
	default:
		// Initialize to running state
		if err := r.updateStatus(ctx, memory, statusRunning, "Resolving memory address"); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}
}

func (r *MemoryReconciler) getResolver() *common.ValueSourceResolver {
	if r.resolver == nil {
		r.resolver = common.NewValueSourceResolver(r.Client)
	}
	return r.resolver
}

func (r *MemoryReconciler) processMemory(ctx context.Context, memory arkv1alpha1.Memory) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	resolver := r.getResolver()
	resolvedAddress, err := resolver.ResolveValueSource(ctx, memory.Spec.Address, memory.Namespace)
	if err != nil {
		log.Error(err, "failed to resolve Memory address", "memory", memory.Name)
		if err := r.updateStatus(ctx, memory, statusError, fmt.Sprintf("Failed to resolve address: %v", err)); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	// Update last resolved address in status
	memory.Status.LastResolvedAddress = &resolvedAddress

	// Validate the resolved address (basic validation)
	if err := r.validateMemoryAddress(resolvedAddress); err != nil {
		log.Error(err, "invalid memory address", "memory", memory.Name, "address", resolvedAddress)
		if err := r.updateStatus(ctx, memory, statusError, fmt.Sprintf("Invalid address: %v", err)); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	// Mark as ready
	if err := r.updateStatus(ctx, memory, statusReady, "Memory address resolved and validated"); err != nil {
		return ctrl.Result{}, err
	}

	return ctrl.Result{}, nil
}

// updateStatus updates the Memory status following the same pattern as MCPServer controller
func (r *MemoryReconciler) updateStatus(ctx context.Context, memory arkv1alpha1.Memory, status, message string) error {
	if ctx.Err() != nil {
		return nil
	}
	memory.Status.Phase = status
	memory.Status.Message = message
	err := r.Status().Update(ctx, &memory)
	if err != nil {
		logf.FromContext(ctx).Error(err, "failed to update Memory status", "status", status)
	}
	return err
}

func (r *MemoryReconciler) validateMemoryAddress(address string) error {
	if address == "" {
		return fmt.Errorf("address cannot be empty")
	}
	// Add more validation as needed (URL format, reachability, etc.)
	return nil
}

// SetupWithManager sets up the controller with the Manager.
func (r *MemoryReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&arkv1alpha1.Memory{}).
		Named("memory").
		Complete(r)
}
