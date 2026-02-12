/* Copyright 2025. McKinsey & Company */

package registry

import (
	"context"
	"fmt"
	"time"

	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	genericrequest "k8s.io/apiserver/pkg/endpoints/request"
	"k8s.io/apiserver/pkg/registry/rest"

	"mckinsey.com/ark/internal/apiserver/metrics"
	"mckinsey.com/ark/internal/storage"
)

type StatusStorage struct {
	backend   storage.Backend
	converter storage.TypeConverter
	config    ResourceConfig
}

var (
	_ rest.Storage = &StatusStorage{}
	_ rest.Getter  = &StatusStorage{}
	_ rest.Updater = &StatusStorage{}
	_ rest.Scoper  = &StatusStorage{}
)

func NewStatusStorage(backend storage.Backend, converter storage.TypeConverter, config ResourceConfig) *StatusStorage {
	return &StatusStorage{
		backend:   backend,
		converter: converter,
		config:    config,
	}
}

func (s *StatusStorage) New() runtime.Object {
	return s.config.NewFunc()
}

func (s *StatusStorage) Destroy() {}

func (s *StatusStorage) NamespaceScoped() bool {
	return true
}

func (s *StatusStorage) Get(ctx context.Context, name string, options *metav1.GetOptions) (runtime.Object, error) {
	namespace := getNamespaceFromContext(ctx)
	return s.backend.Get(storageContext(ctx), s.config.Kind, namespace, name)
}

func (s *StatusStorage) Update(ctx context.Context, name string, objInfo rest.UpdatedObjectInfo, createValidation rest.ValidateObjectFunc, updateValidation rest.ValidateObjectUpdateFunc, forceAllowCreate bool, options *metav1.UpdateOptions) (runtime.Object, bool, error) {
	start := time.Now()
	namespace := getNamespaceFromContext(ctx)

	existing, err := s.backend.Get(storageContext(ctx), s.config.Kind, namespace, name)
	if err != nil {
		metrics.RecordStorageOperation("update_status", s.config.Kind, "not_found")
		return nil, false, fmt.Errorf("object not found: %w", err)
	}

	updated, err := objInfo.UpdatedObject(ctx, existing)
	if err != nil {
		metrics.RecordStorageOperation("update_status", s.config.Kind, "error")
		return nil, false, fmt.Errorf("failed to get updated object: %w", err)
	}

	if err := copyStatusOnly(existing, updated); err != nil {
		metrics.RecordStorageOperation("update_status", s.config.Kind, "error")
		return nil, false, err
	}

	accessor, err := meta.Accessor(existing)
	if err != nil {
		metrics.RecordStorageOperation("update_status", s.config.Kind, "error")
		return nil, false, fmt.Errorf("failed to access object metadata: %w", err)
	}

	if err := s.backend.UpdateStatus(storageContext(ctx), s.config.Kind, namespace, name, existing); err != nil {
		return nil, false, handleUpdateError(err, s.config, "update_status", name, start)
	}

	metrics.RecordStorageOperation("update_status", s.config.Kind, "success")
	metrics.RecordStorageLatency("update_status", s.config.Kind, start)
	result, err := s.backend.Get(storageContext(ctx), s.config.Kind, namespace, accessor.GetName())
	return result, false, err
}

func getNamespaceFromContext(ctx context.Context) string {
	if reqInfo, ok := genericrequest.RequestInfoFrom(ctx); ok {
		return reqInfo.Namespace
	}
	return defaultNamespace
}

func copyStatusOnly(dst, src runtime.Object) error {
	srcValue, err := runtime.DefaultUnstructuredConverter.ToUnstructured(src)
	if err != nil {
		return fmt.Errorf("failed to convert source to unstructured: %w", err)
	}

	dstValue, err := runtime.DefaultUnstructuredConverter.ToUnstructured(dst)
	if err != nil {
		return fmt.Errorf("failed to convert destination to unstructured: %w", err)
	}

	if status, ok := srcValue["status"]; ok {
		dstValue["status"] = status
	}

	return runtime.DefaultUnstructuredConverter.FromUnstructured(dstValue, dst)
}
