package registry

import (
	"context"
	"fmt"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apiserver/pkg/registry/rest"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/apiserver/validation"
)

var (
	_ rest.Storage = &ValidatingStorage{}
	_ rest.Scoper  = &ValidatingStorage{}
)

type ValidatingStorage struct {
	*GenericStorage
	validator validation.Validator
}

func NewValidatingStorage(storage *GenericStorage, validator validation.Validator) *ValidatingStorage {
	return &ValidatingStorage{
		GenericStorage: storage,
		validator:      validator,
	}
}

func (s *ValidatingStorage) Create(ctx context.Context, obj runtime.Object, createValidation rest.ValidateObjectFunc, options *metav1.CreateOptions) (runtime.Object, error) {
	if s.validator != nil {
		if err := s.validator.ValidateCreate(ctx, obj); err != nil {
			return nil, apierrors.NewForbidden(
				schema.GroupResource{Group: arkv1alpha1.GroupVersion.Group, Resource: s.config.Resource},
				"",
				fmt.Errorf("admission webhook denied the request: %v", err),
			)
		}
	}
	return s.GenericStorage.Create(ctx, obj, createValidation, options)
}

func (s *ValidatingStorage) Update(ctx context.Context, name string, objInfo rest.UpdatedObjectInfo, createValidation rest.ValidateObjectFunc, updateValidation rest.ValidateObjectUpdateFunc, forceAllowCreate bool, options *metav1.UpdateOptions) (runtime.Object, bool, error) {
	namespace := getNamespace(ctx)

	existing, err := s.backend.Get(ctx, s.config.Kind, namespace, name)
	if err != nil && !forceAllowCreate {
		return nil, false, apierrors.NewNotFound(schema.GroupResource{Group: arkv1alpha1.GroupVersion.Group, Resource: s.config.Resource}, name)
	}

	updated, err := objInfo.UpdatedObject(ctx, existing)
	if err != nil {
		return nil, false, fmt.Errorf("failed to get updated object: %w", err)
	}

	if s.validator != nil {
		if existing == nil {
			if err := s.validator.ValidateCreate(ctx, updated); err != nil {
				return nil, false, apierrors.NewForbidden(
					schema.GroupResource{Group: arkv1alpha1.GroupVersion.Group, Resource: s.config.Resource},
					name,
					fmt.Errorf("admission webhook denied the request: %v", err),
				)
			}
		} else {
			if err := s.validator.ValidateUpdate(ctx, existing, updated); err != nil {
				return nil, false, apierrors.NewForbidden(
					schema.GroupResource{Group: arkv1alpha1.GroupVersion.Group, Resource: s.config.Resource},
					name,
					fmt.Errorf("admission webhook denied the request: %v", err),
				)
			}
		}
	}

	return s.GenericStorage.Update(ctx, name, objInfo, createValidation, updateValidation, forceAllowCreate, options)
}

func (s *ValidatingStorage) Delete(ctx context.Context, name string, deleteValidation rest.ValidateObjectFunc, options *metav1.DeleteOptions) (runtime.Object, bool, error) {
	if s.validator != nil {
		namespace := getNamespace(ctx)
		existing, err := s.backend.Get(ctx, s.config.Kind, namespace, name)
		if err == nil {
			if err := s.validator.ValidateDelete(ctx, existing); err != nil {
				return nil, false, apierrors.NewForbidden(
					schema.GroupResource{Group: arkv1alpha1.GroupVersion.Group, Resource: s.config.Resource},
					name,
					fmt.Errorf("admission webhook denied the request: %v", err),
				)
			}
		}
	}
	return s.GenericStorage.Delete(ctx, name, deleteValidation, options)
}

func (s *ValidatingStorage) NamespaceScoped() bool {
	return s.GenericStorage.NamespaceScoped()
}
