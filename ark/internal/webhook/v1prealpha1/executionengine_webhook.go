/* Copyright 2025. McKinsey & Company */

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

type ExecutionEngineValidator struct {
	Client   client.Client
	Resolver *common.ValueSourceResolverV1PreAlpha1
}

var _ webhook.CustomValidator = &ExecutionEngineValidator{}

func (v *ExecutionEngineValidator) ValidateCreate(ctx context.Context, obj runtime.Object) (admission.Warnings, error) {
	executionEngine, ok := obj.(*arkv1prealpha1.ExecutionEngine)
	if !ok {
		return nil, fmt.Errorf("expected an ExecutionEngine object but got %T", obj)
	}

	executionengineLog.Info("Validating ExecutionEngine", "name", executionEngine.GetName(), "namespace", executionEngine.GetNamespace())

	// Validate that the execution engine name is not reserved
	if executionEngine.GetName() == genai.ExecutionEngineA2A {
		return nil, fmt.Errorf("execution engine name '%s' is reserved for A2A servers", genai.ExecutionEngineA2A)
	}

	// Validate that the address can be resolved
	_, err := v.Resolver.ResolveValueSource(ctx, executionEngine.Spec.Address, executionEngine.GetNamespace())
	if err != nil {
		executionengineLog.Error(err, "Failed to resolve Address", "executionEngine", executionEngine.GetName())
		return nil, fmt.Errorf("failed to resolve Address: %w", err)
	}

	executionengineLog.Info("ExecutionEngine validation complete", "name", executionEngine.GetName())

	return nil, nil
}

func (v *ExecutionEngineValidator) ValidateUpdate(ctx context.Context, oldObj, newObj runtime.Object) (admission.Warnings, error) {
	return v.ValidateCreate(ctx, newObj)
}

func (v *ExecutionEngineValidator) ValidateDelete(ctx context.Context, obj runtime.Object) (admission.Warnings, error) {
	return nil, nil
}
