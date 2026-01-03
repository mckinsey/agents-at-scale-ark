/* Copyright 2025. McKinsey & Company */

// executionengine_webhook.go provides admission validation for ExecutionEngine resources.
//
// Validation rules:
//   - Name cannot be "a2a" (reserved for A2A servers)
//   - Must specify either address OR source, not both, not neither
//   - If source is specified, must have either image OR git, not both, not neither
//   - Address must be resolvable (direct value, ConfigMap, Secret, or Service reference)

package v1prealpha1

import (
	"context"
	"fmt"

	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"sigs.k8s.io/controller-runtime/pkg/webhook"
	"sigs.k8s.io/controller-runtime/pkg/webhook/admission"

	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/common"
	"mckinsey.com/ark/internal/genai"
)

var executionengineLog = logf.Log.WithName("executionengine-resource")

// SetupExecutionEngineWebhookWithManager registers the ExecutionEngine validating webhook.
func SetupExecutionEngineWebhookWithManager(mgr ctrl.Manager) error {
	k8sClient := mgr.GetClient()
	return ctrl.NewWebhookManagedBy(mgr).
		For(&arkv1prealpha1.ExecutionEngine{}).
		WithValidator(&ExecutionEngineValidator{
			Client:   k8sClient,
			Resolver: common.NewValueSourceResolverV1PreAlpha1(k8sClient),
		}).
		Complete()
}

// +kubebuilder:webhook:path=/validate-ark-mckinsey-com-v1prealpha1-executionengine,mutating=false,failurePolicy=fail,sideEffects=None,groups=ark.mckinsey.com,resources=executionengines,verbs=create;update,versions=v1prealpha1,name=vexecutionengine-v1prealpha1.kb.io,admissionReviewVersions=v1

// ExecutionEngineValidator implements admission validation for ExecutionEngine resources.
type ExecutionEngineValidator struct {
	Client   client.Client
	Resolver *common.ValueSourceResolverV1PreAlpha1
}

var _ webhook.CustomValidator = &ExecutionEngineValidator{}

// ValidateCreate validates an ExecutionEngine on creation.
// Returns an error if validation fails, nil otherwise.
func (v *ExecutionEngineValidator) ValidateCreate(ctx context.Context, obj runtime.Object) (admission.Warnings, error) {
	executionEngine, ok := obj.(*arkv1prealpha1.ExecutionEngine)
	if !ok {
		return nil, fmt.Errorf("expected an ExecutionEngine object but got %T", obj)
	}

	executionengineLog.Info("Validating ExecutionEngine", "name", executionEngine.GetName(), "namespace", executionEngine.GetNamespace())

	// Check for reserved names
	if executionEngine.GetName() == genai.ExecutionEngineA2A {
		return nil, fmt.Errorf("execution engine name '%s' is reserved for A2A servers", genai.ExecutionEngineA2A)
	}

	// Validate mutual exclusivity: must have address XOR source
	hasAddress := executionEngine.Spec.Address != nil
	hasSource := executionEngine.Spec.Source != nil

	if hasAddress && hasSource {
		return nil, fmt.Errorf("cannot specify both address and source")
	}

	if !hasAddress && !hasSource {
		return nil, fmt.Errorf("must specify either address or source")
	}

	// For shared executor mode (address), validate the address is resolvable
	if hasAddress {
		_, err := v.Resolver.ResolveValueSource(ctx, *executionEngine.Spec.Address, executionEngine.GetNamespace())
		if err != nil {
			executionengineLog.Error(err, "Failed to resolve Address", "executionEngine", executionEngine.GetName())
			return nil, fmt.Errorf("failed to resolve Address: %w", err)
		}
	}

	// For template mode (source), validate source configuration
	if hasSource {
		source := executionEngine.Spec.Source
		if source.Image == "" && source.Git == nil {
			return nil, fmt.Errorf("source must specify either image or git")
		}
		if source.Image != "" && source.Git != nil {
			return nil, fmt.Errorf("source cannot specify both image and git")
		}
	}

	executionengineLog.Info("ExecutionEngine validation complete", "name", executionEngine.GetName())

	return nil, nil
}

// ValidateUpdate validates an ExecutionEngine on update.
// Delegates to ValidateCreate since the same rules apply.
func (v *ExecutionEngineValidator) ValidateUpdate(ctx context.Context, oldObj, newObj runtime.Object) (admission.Warnings, error) {
	return v.ValidateCreate(ctx, newObj)
}

// ValidateDelete validates an ExecutionEngine on deletion.
// Currently allows all deletions.
func (v *ExecutionEngineValidator) ValidateDelete(ctx context.Context, obj runtime.Object) (admission.Warnings, error) {
	return nil, nil
}
