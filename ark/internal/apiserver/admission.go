package apiserver

import (
	"context"
	"fmt"
	"strconv"

	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apiserver/pkg/registry/rest"
	"k8s.io/klog/v2"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/apiserver/registry"
	"mckinsey.com/ark/internal/queryworker"
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

type QueryAdmissionStorage struct {
	*AdmissionStorage
	riverClient *queryworker.RiverClient
}

func NewQueryAdmissionStorage(inner *AdmissionStorage, riverClient *queryworker.RiverClient) *QueryAdmissionStorage {
	return &QueryAdmissionStorage{AdmissionStorage: inner, riverClient: riverClient}
}

func (s *QueryAdmissionStorage) Create(ctx context.Context, obj runtime.Object, validateFunc rest.ValidateObjectFunc, options *metav1.CreateOptions) (runtime.Object, error) {
	result, err := s.AdmissionStorage.Create(ctx, obj, validateFunc, options)
	if err != nil {
		return nil, err
	}

	accessor, accessErr := meta.Accessor(result)
	if accessErr != nil {
		return result, nil
	}

	klog.Infof("Creating query %s/%s", accessor.GetNamespace(), accessor.GetName())

	timeoutSeconds := queryworker.TimeoutSecondsFromObject(result)

	insertRes, insertErr := s.riverClient.Insert(ctx, queryworker.QueryJobArgs{
		Namespace:      accessor.GetNamespace(),
		Name:           accessor.GetName(),
		TimeoutSeconds: timeoutSeconds,
	}, nil)
	if insertErr != nil {
		return nil, fmt.Errorf("failed to insert River job for query %s/%s: %w", accessor.GetNamespace(), accessor.GetName(), insertErr)
	}
	klog.V(4).Infof("inserted River job for query %s/%s (jobId=%d)", accessor.GetNamespace(), accessor.GetName(), insertRes.Job.ID)

	if query, ok := result.(*arkv1alpha1.Query); ok {
		query.Status.JobId = strconv.FormatInt(insertRes.Job.ID, 10)
		updated, _, updateErr := s.GenericStorage.Update(ctx, accessor.GetName(), rest.DefaultUpdatedObjectInfo(query), nil, nil, false, &metav1.UpdateOptions{})
		if updateErr != nil {
			klog.Warningf("failed to persist jobId for query %s/%s: %v", accessor.GetNamespace(), accessor.GetName(), updateErr)
			return result, nil
		}
		return updated, nil
	}

	return result, nil
}
