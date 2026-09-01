package apiserver

import (
	"context"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apiserver/pkg/registry/rest"
	"k8s.io/apiserver/pkg/warning"

	"mckinsey.com/ark/internal/apiserver/registry"
	"mckinsey.com/ark/internal/validation"
)

type AdmissionStorage struct {
	*registry.GenericStorage
	validator *validation.Validator
}

func NewAdmissionStorage(inner *registry.GenericStorage, validator *validation.Validator) *AdmissionStorage {
	return &AdmissionStorage{GenericStorage: inner, validator: validator}
}

// Create order matters: PrepareForCreate, then Ark defaulting/validation, then the generic
// admission callback inside GenericStorage.Create. Ark validators resolve valueFrom refs
// against obj.GetNamespace(), so the object must be formed before they run.
func (s *AdmissionStorage) Create(ctx context.Context, obj runtime.Object, createValidation rest.ValidateObjectFunc, options *metav1.CreateOptions) (runtime.Object, error) {
	if err := registry.PrepareForCreate(ctx, obj); err != nil {
		return nil, err
	}
	validation.ApplyDefaults(ctx, obj, nil)
	warnings, err := s.validator.Validate(ctx, obj)
	if err != nil {
		return nil, err
	}
	for _, w := range warnings {
		warning.AddWarning(ctx, "", w)
	}
	// Dropping createValidation silently disables all admission-chain policy.
	return s.GenericStorage.Create(ctx, obj, createValidation, options)
}

func (s *AdmissionStorage) Update(ctx context.Context, name string, objInfo rest.UpdatedObjectInfo, createValidation rest.ValidateObjectFunc, updateValidation rest.ValidateObjectUpdateFunc, forceAllowCreate bool, options *metav1.UpdateOptions) (runtime.Object, bool, error) {
	// Each closure runs Ark's defaulting/validation, then chains to the generic
	// validating-admission callback.
	admissionCreate := func(ctx context.Context, obj runtime.Object) error {
		validation.ApplyDefaults(ctx, obj, nil)
		warnings, err := s.validator.Validate(ctx, obj)
		for _, w := range warnings {
			warning.AddWarning(ctx, "", w)
		}
		if err != nil {
			return err
		}
		if createValidation != nil {
			return createValidation(ctx, obj)
		}
		return nil
	}
	admissionUpdate := func(ctx context.Context, obj, old runtime.Object) error {
		validation.ApplyDefaults(ctx, obj, nil)
		ctx = validation.ServiceAccountAuthzContextForUpdate(ctx, old, obj)
		warnings, err := s.validator.Validate(ctx, obj)
		for _, w := range warnings {
			warning.AddWarning(ctx, "", w)
		}
		if err != nil {
			return err
		}
		if updateValidation != nil {
			return updateValidation(ctx, obj, old)
		}
		return nil
	}
	return s.GenericStorage.Update(ctx, name, objInfo, admissionCreate, admissionUpdate, forceAllowCreate, options)
}
