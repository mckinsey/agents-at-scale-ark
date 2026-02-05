package validation

import (
	"context"
	"fmt"

	"k8s.io/apimachinery/pkg/runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
	"mckinsey.com/ark/internal/genai"
)

type ModelDefaulter struct{}

func (d *ModelDefaulter) Default(ctx context.Context, obj runtime.Object) error {
	model, ok := obj.(*arkv1alpha1.Model)
	if !ok {
		return fmt.Errorf("expected a Model object but got %T", obj)
	}

	if model.Spec.Provider == "" && genai.IsDeprecatedProviderInType(model.Spec.Type) {
		originalType := model.Spec.Type
		model.Spec.Provider = model.Spec.Type
		model.Spec.Type = genai.ModelTypeCompletions

		if model.Annotations == nil {
			model.Annotations = make(map[string]string)
		}
		model.Annotations[annotations.MigrationWarningPrefix+"provider"] = fmt.Sprintf(
			"spec.type is deprecated for provider values - migrated '%s' to spec.provider",
			originalType,
		)
	}

	return nil
}
