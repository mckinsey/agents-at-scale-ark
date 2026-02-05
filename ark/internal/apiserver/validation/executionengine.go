package validation

import (
	"context"
	"fmt"

	"k8s.io/apimachinery/pkg/runtime"

	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/genai"
)

type ExecutionEngineValidator struct {
	*StorageValidator
}

func NewExecutionEngineValidator(sv *StorageValidator) *ExecutionEngineValidator {
	return &ExecutionEngineValidator{StorageValidator: sv}
}

func (v *ExecutionEngineValidator) ValidateCreate(ctx context.Context, obj runtime.Object) error {
	engine, ok := obj.(*arkv1prealpha1.ExecutionEngine)
	if !ok {
		return fmt.Errorf("expected ExecutionEngine, got %T", obj)
	}
	return v.validateExecutionEngine(engine)
}

func (v *ExecutionEngineValidator) ValidateUpdate(ctx context.Context, oldObj, newObj runtime.Object) error {
	engine, ok := newObj.(*arkv1prealpha1.ExecutionEngine)
	if !ok {
		return fmt.Errorf("expected ExecutionEngine, got %T", newObj)
	}
	return v.validateExecutionEngine(engine)
}

func (v *ExecutionEngineValidator) ValidateDelete(ctx context.Context, obj runtime.Object) error {
	return nil
}

func (v *ExecutionEngineValidator) validateExecutionEngine(engine *arkv1prealpha1.ExecutionEngine) error {
	if engine.GetName() == genai.ExecutionEngineA2A {
		return fmt.Errorf("execution engine name '%s' is reserved for A2A servers", genai.ExecutionEngineA2A)
	}

	if err := v.validateAddress(engine.Spec.Address); err != nil {
		return err
	}

	return nil
}

func (v *ExecutionEngineValidator) validateAddress(address arkv1prealpha1.ValueSource) error {
	if address.Value == "" && address.ValueFrom == nil {
		return fmt.Errorf("address must specify either value or valueFrom")
	}

	if address.Value != "" && address.ValueFrom != nil {
		return fmt.Errorf("address cannot specify both value and valueFrom")
	}

	return nil
}
