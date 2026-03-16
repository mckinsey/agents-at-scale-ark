package apiserver

import (
	"context"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apiserver/pkg/registry/rest"

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

func (s *AdmissionStorage) Create(ctx context.Context, obj runtime.Object, _ rest.ValidateObjectFunc, options *metav1.CreateOptions) (runtime.Object, error) {
	validation.ApplyDefaults(obj)
	if _, err := s.validator.Validate(ctx, obj); err != nil {
		return nil, err
	}
	return s.GenericStorage.Create(ctx, obj, nil, options)
}

func (s *AdmissionStorage) Update(ctx context.Context, name string, objInfo rest.UpdatedObjectInfo, _ rest.ValidateObjectFunc, _ rest.ValidateObjectUpdateFunc, forceAllowCreate bool, options *metav1.UpdateOptions) (runtime.Object, bool, error) {
	admissionCreate := func(ctx context.Context, obj runtime.Object) error {
		validation.ApplyDefaults(obj)
		_, err := s.validator.Validate(ctx, obj)
		return err
	}
	admissionUpdate := func(ctx context.Context, obj, _ runtime.Object) error {
		validation.ApplyDefaults(obj)
		_, err := s.validator.Validate(ctx, obj)
		return err
	}
	return s.GenericStorage.Update(ctx, name, objInfo, admissionCreate, admissionUpdate, forceAllowCreate, options)
}
