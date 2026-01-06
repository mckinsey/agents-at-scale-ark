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
	"mckinsey.com/ark/internal/registry"
)

// ExecutionEngineReconciler reconciles an ExecutionEngine object
type ExecutionEngineReconciler struct {
	client.Client
	Scheme      *runtime.Scheme
	Eventing    eventing.Provider
	resolver    *common.ValueSourceResolverV1PreAlpha1
	imageClient *registry.ImageClient
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

	// Check if spec has changed from what's in status (e.g., image updated).
	// If so, re-process even if status is ready.
	if r.specChanged(&executionEngine) {
		log.Info("ExecutionEngine spec changed, re-processing", "executionEngine", executionEngine.Name)
		return r.processExecutionEngine(ctx, executionEngine)
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

// specChanged checks if the ExecutionEngine spec has changed from what's recorded in status.
// This detects when spec.source.image or spec.address changes after the engine was already ready.
func (r *ExecutionEngineReconciler) specChanged(ee *arkv1prealpha1.ExecutionEngine) bool {
	// Check if source.image differs from status.imageRef
	if ee.Spec.Source != nil && ee.Spec.Source.Image != "" {
		if ee.Status.ImageRef != ee.Spec.Source.Image {
			return true
		}
	}

	// For address-based engines, we could compare spec.address with status.lastResolvedAddress,
	// but address resolution may involve secrets/configmaps that can change independently.
	// For now, only handle the image case.

	return false
}

func (r *ExecutionEngineReconciler) getResolver() *common.ValueSourceResolverV1PreAlpha1 {
	if r.resolver == nil {
		r.resolver = common.NewValueSourceResolverV1PreAlpha1(r.Client)
	}
	return r.resolver
}

func (r *ExecutionEngineReconciler) getImageClient() *registry.ImageClient {
	if r.imageClient == nil {
		r.imageClient = registry.NewImageClient(r.Client)
	}
	return r.imageClient
}

func (r *ExecutionEngineReconciler) processExecutionEngine(ctx context.Context, executionEngine arkv1prealpha1.ExecutionEngine) (ctrl.Result, error) {
	log := logf.FromContext(ctx)
	log.Info("Processing execution engine", "executionEngine", executionEngine.Name)

	if executionEngine.Spec.Source != nil {
		return r.processTemplateBasedEngine(ctx, executionEngine)
	}

	if executionEngine.Spec.Address != nil {
		return r.processAddressBasedEngine(ctx, executionEngine)
	}

	if err := r.updateStatus(ctx, executionEngine, statusError, "Either address or source must be specified"); err != nil {
		return ctrl.Result{}, err
	}
	return ctrl.Result{}, nil
}

func (r *ExecutionEngineReconciler) processAddressBasedEngine(ctx context.Context, executionEngine arkv1prealpha1.ExecutionEngine) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	resolver := r.getResolver()
	resolvedAddress, err := resolver.ResolveValueSource(ctx, *executionEngine.Spec.Address, executionEngine.Namespace)
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

func (r *ExecutionEngineReconciler) processTemplateBasedEngine(ctx context.Context, executionEngine arkv1prealpha1.ExecutionEngine) (ctrl.Result, error) {
	log := logf.FromContext(ctx)
	source := executionEngine.Spec.Source

	if source.Image != "" {
		return r.processImageBasedEngine(ctx, executionEngine)
	}

	if source.Git != nil {
		if err := r.updateStatus(ctx, executionEngine, statusRunning, "Waiting for image build from git source"); err != nil {
			return ctrl.Result{}, err
		}
		log.Info("Template-based ExecutionEngine waiting for build", "executionEngine", executionEngine.Name, "git", source.Git.URL)
		return ctrl.Result{}, nil
	}

	if err := r.updateStatus(ctx, executionEngine, statusError, "Source must specify either image or git"); err != nil {
		return ctrl.Result{}, err
	}
	return ctrl.Result{}, nil
}

func (r *ExecutionEngineReconciler) processImageBasedEngine(ctx context.Context, executionEngine arkv1prealpha1.ExecutionEngine) (ctrl.Result, error) {
	log := logf.FromContext(ctx)
	source := executionEngine.Spec.Source

	executionEngine.Status.ImageRef = source.Image

	specUpdated, err := r.extractImageMetadata(ctx, &executionEngine)
	if err != nil {
		log.Error(err, "Failed to extract image metadata, continuing without it", "image", source.Image)
	}

	if specUpdated {
		if err := r.Update(ctx, &executionEngine); err != nil {
			log.Error(err, "Failed to update ExecutionEngine spec with image metadata")
			return ctrl.Result{}, err
		}
		log.Info("Updated ExecutionEngine spec with image metadata", "executionEngine", executionEngine.Name)
	}

	if err := r.updateStatus(ctx, executionEngine, statusReady, "Template image configured"); err != nil {
		return ctrl.Result{}, err
	}
	log.Info("Template-based ExecutionEngine ready", "executionEngine", executionEngine.Name, "image", source.Image)
	return ctrl.Result{}, nil
}

func (r *ExecutionEngineReconciler) extractImageMetadata(ctx context.Context, ee *arkv1prealpha1.ExecutionEngine) (bool, error) {
	log := logf.FromContext(ctx)
	source := ee.Spec.Source

	if source == nil || source.Image == "" {
		return false, nil
	}

	imageClient := r.getImageClient()
	metadata, err := imageClient.GetImageMetadata(ctx, source.Image, ee.Namespace, source.ImagePullSecrets)
	if err != nil {
		return false, fmt.Errorf("failed to get image metadata: %w", err)
	}

	updated := false

	if metadata.ConfigSchema != "" && ee.Spec.ConfigSchema == "" {
		ee.Spec.ConfigSchema = metadata.ConfigSchema
		updated = true
		log.Info("Extracted configSchema from image label", "executionEngine", ee.Name)
	}

	if metadata.Description != "" && ee.Spec.Description == "" {
		ee.Spec.Description = metadata.Description
		updated = true
		log.Info("Extracted description from image label", "executionEngine", ee.Name)
	}

	if metadata.IsAgentic != nil && !ee.Spec.IsAgentic {
		ee.Spec.IsAgentic = *metadata.IsAgentic
		updated = true
		log.Info("Extracted isAgentic from image label", "executionEngine", ee.Name, "isAgentic", *metadata.IsAgentic)
	}

	return updated, nil
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
