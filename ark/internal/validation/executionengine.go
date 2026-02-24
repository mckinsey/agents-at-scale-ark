package validation

import (
	"context"
	"fmt"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/genai"
)

func (v *Validator) ValidateExecutionEngine(ctx context.Context, ee *arkv1prealpha1.ExecutionEngine) ([]string, error) {
	if ee.GetName() == genai.ExecutionEngineA2A {
		return nil, fmt.Errorf("execution engine name '%s' is reserved for A2A servers", genai.ExecutionEngineA2A)
	}

	converted := convertV1PreAlpha1ValueSource(ee.Spec.Address)
	if _, err := v.ResolveValueSource(ctx, converted, ee.GetNamespace()); err != nil {
		return nil, fmt.Errorf("failed to resolve Address: %w", err)
	}

	return nil, nil
}

func convertV1PreAlpha1ValueSource(vs arkv1prealpha1.ValueSource) arkv1alpha1.ValueSource {
	out := arkv1alpha1.ValueSource{Value: vs.Value}
	if vs.ValueFrom == nil {
		return out
	}
	out.ValueFrom = &arkv1alpha1.ValueFromSource{
		SecretKeyRef:    vs.ValueFrom.SecretKeyRef,
		ConfigMapKeyRef: vs.ValueFrom.ConfigMapKeyRef,
	}
	if vs.ValueFrom.ServiceRef != nil {
		out.ValueFrom.ServiceRef = &arkv1alpha1.ServiceReference{
			Name:      vs.ValueFrom.ServiceRef.Name,
			Namespace: vs.ValueFrom.ServiceRef.Namespace,
			Port:      vs.ValueFrom.ServiceRef.Port,
			Path:      vs.ValueFrom.ServiceRef.Path,
		}
	}
	return out
}
