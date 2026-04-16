/* Copyright 2025. McKinsey & Company */

package registry

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metainternalversion "k8s.io/apimachinery/pkg/apis/meta/internalversion"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/watch"
	genericrequest "k8s.io/apiserver/pkg/endpoints/request"
	"k8s.io/apiserver/pkg/registry/rest"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/apiserver/metrics"
	"mckinsey.com/ark/internal/storage"
)

const (
	columnTypeDate   = "date"
	defaultNamespace = "default"
)

func storageContext(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
}

type ResourceConfig struct {
	Kind         string
	Resource     string
	SingularName string
	NewFunc      func() runtime.Object
	NewListFunc  func() runtime.Object
}

type GenericStorage struct {
	backend        storage.Backend
	converter      storage.TypeConverter
	config         ResourceConfig
	printerColumns *PrinterColumnRegistry
}

var (
	_ rest.Storage              = &GenericStorage{}
	_ rest.Getter               = &GenericStorage{}
	_ rest.Lister               = &GenericStorage{}
	_ rest.CreaterUpdater       = &GenericStorage{}
	_ rest.GracefulDeleter      = &GenericStorage{}
	_ rest.Watcher              = &GenericStorage{}
	_ rest.Scoper               = &GenericStorage{}
	_ rest.SingularNameProvider = &GenericStorage{}
)

func NewGenericStorage(backend storage.Backend, converter storage.TypeConverter, config ResourceConfig, printerColumns *PrinterColumnRegistry) *GenericStorage {
	return &GenericStorage{
		backend:        backend,
		converter:      converter,
		config:         config,
		printerColumns: printerColumns,
	}
}

func (s *GenericStorage) New() runtime.Object {
	return s.config.NewFunc()
}

func (s *GenericStorage) Destroy() {}

func (s *GenericStorage) NewList() runtime.Object {
	return s.config.NewListFunc()
}

func (s *GenericStorage) NamespaceScoped() bool {
	return true
}

func (s *GenericStorage) GetSingularName() string {
	return s.config.SingularName
}

func (s *GenericStorage) Get(ctx context.Context, name string, options *metav1.GetOptions) (runtime.Object, error) {
	start := time.Now()
	namespace := getNamespace(ctx)
	sctx, cancel := storageContext(ctx)
	defer cancel()
	obj, err := s.backend.Get(sctx, s.config.Kind, namespace, name)
	if err != nil {
		metrics.RecordStorageOperation("get", s.config.Kind, "error")
		metrics.RecordStorageLatency("get", s.config.Kind, start)
		return nil, apierrors.NewNotFound(schema.GroupResource{Group: arkv1alpha1.GroupVersion.Group, Resource: s.config.Resource}, name)
	}
	metrics.RecordStorageOperation("get", s.config.Kind, "success")
	metrics.RecordStorageLatency("get", s.config.Kind, start)
	return obj, nil
}

func (s *GenericStorage) List(ctx context.Context, options *metainternalversion.ListOptions) (runtime.Object, error) {
	start := time.Now()
	namespace := getNamespace(ctx)
	opts := storage.ListOptions{}
	if options != nil {
		if options.LabelSelector != nil {
			opts.LabelSelector = options.LabelSelector.String()
		}
		if options.FieldSelector != nil {
			opts.FieldSelector = options.FieldSelector.String()
		}
		opts.Limit = options.Limit
		opts.Continue = options.Continue
	}

	sctx, cancel := storageContext(ctx)
	defer cancel()
	objects, continueToken, err := s.backend.List(sctx, s.config.Kind, namespace, opts)
	if err != nil {
		metrics.RecordStorageOperation("list", s.config.Kind, "error")
		metrics.RecordStorageLatency("list", s.config.Kind, start)
		return nil, apierrors.NewInternalError(fmt.Errorf("failed to list %s: %w", s.config.Resource, err))
	}

	list := s.config.NewListFunc()
	if err := setListItems(list, objects, continueToken); err != nil {
		metrics.RecordStorageOperation("list", s.config.Kind, "error")
		metrics.RecordStorageLatency("list", s.config.Kind, start)
		return nil, err
	}

	metrics.RecordStorageOperation("list", s.config.Kind, "success")
	metrics.RecordStorageLatency("list", s.config.Kind, start)
	return list, nil
}

func (s *GenericStorage) Create(ctx context.Context, obj runtime.Object, createValidation rest.ValidateObjectFunc, options *metav1.CreateOptions) (runtime.Object, error) {
	start := time.Now()
	if createValidation != nil {
		if err := createValidation(ctx, obj); err != nil {
			metrics.RecordStorageOperation("create", s.config.Kind, "validation_error")
			return nil, err
		}
	}

	namespace := getNamespace(ctx)
	accessor, err := meta.Accessor(obj)
	if err != nil {
		metrics.RecordStorageOperation("create", s.config.Kind, "error")
		return nil, fmt.Errorf("failed to access object metadata: %w", err)
	}

	if accessor.GetNamespace() == "" {
		accessor.SetNamespace(namespace)
	}
	if accessor.GetUID() == "" {
		accessor.SetUID(types.UID(uuid.New().String()))
	}
	ts := accessor.GetCreationTimestamp()
	if ts.IsZero() {
		accessor.SetCreationTimestamp(metav1.Now())
	}

	sctx, cancel := storageContext(ctx)
	defer cancel()
	if err := s.backend.Create(sctx, s.config.Kind, accessor.GetNamespace(), accessor.GetName(), obj); err != nil {
		metrics.RecordStorageOperation("create", s.config.Kind, "error")
		metrics.RecordStorageLatency("create", s.config.Kind, start)
		return nil, fmt.Errorf("failed to create %s: %w", s.config.SingularName, err)
	}

	metrics.RecordStorageOperation("create", s.config.Kind, "success")
	metrics.RecordStorageLatency("create", s.config.Kind, start)
	return s.Get(ctx, accessor.GetName(), &metav1.GetOptions{})
}

func (s *GenericStorage) Update(ctx context.Context, name string, objInfo rest.UpdatedObjectInfo, createValidation rest.ValidateObjectFunc, updateValidation rest.ValidateObjectUpdateFunc, forceAllowCreate bool, options *metav1.UpdateOptions) (runtime.Object, bool, error) {
	start := time.Now()
	namespace := getNamespace(ctx)

	sctx, cancel := storageContext(ctx)
	defer cancel()
	existing, err := s.backend.Get(sctx, s.config.Kind, namespace, name)
	if err != nil {
		if forceAllowCreate {
			obj, err := objInfo.UpdatedObject(ctx, nil)
			if err != nil {
				return nil, false, err
			}
			created, err := s.Create(ctx, obj, createValidation, &metav1.CreateOptions{})
			return created, true, err
		}
		metrics.RecordStorageOperation("update", s.config.Kind, "not_found")
		return nil, false, apierrors.NewNotFound(schema.GroupResource{Group: arkv1alpha1.GroupVersion.Group, Resource: s.config.Resource}, name)
	}

	updated, err := objInfo.UpdatedObject(ctx, existing)
	if err != nil {
		metrics.RecordStorageOperation("update", s.config.Kind, "error")
		return nil, false, fmt.Errorf("failed to get updated object: %w", err)
	}

	if updateValidation != nil {
		if err := updateValidation(ctx, updated, existing); err != nil {
			metrics.RecordStorageOperation("update", s.config.Kind, "validation_error")
			return nil, false, err
		}
	}

	if err := s.backend.Update(sctx, s.config.Kind, namespace, name, updated); err != nil {
		return nil, false, handleUpdateError(err, s.config, "update", name, start)
	}

	metrics.RecordStorageOperation("update", s.config.Kind, "success")
	metrics.RecordStorageLatency("update", s.config.Kind, start)
	result, err := s.Get(ctx, name, &metav1.GetOptions{})
	return result, false, err
}

func (s *GenericStorage) Delete(ctx context.Context, name string, deleteValidation rest.ValidateObjectFunc, options *metav1.DeleteOptions) (runtime.Object, bool, error) {
	start := time.Now()
	namespace := getNamespace(ctx)

	sctx, cancel := storageContext(ctx)
	defer cancel()
	existing, err := s.backend.Get(sctx, s.config.Kind, namespace, name)
	if err != nil {
		metrics.RecordStorageOperation("delete", s.config.Kind, "not_found")
		return nil, false, apierrors.NewNotFound(schema.GroupResource{Group: arkv1alpha1.GroupVersion.Group, Resource: s.config.Resource}, name)
	}

	if deleteValidation != nil {
		if err := deleteValidation(ctx, existing); err != nil {
			metrics.RecordStorageOperation("delete", s.config.Kind, "validation_error")
			return nil, false, err
		}
	}

	if err := s.backend.Delete(sctx, s.config.Kind, namespace, name); err != nil {
		return nil, false, handleUpdateError(err, s.config, "delete", name, start)
	}

	metrics.RecordStorageOperation("delete", s.config.Kind, "success")
	metrics.RecordStorageLatency("delete", s.config.Kind, start)
	return existing, true, nil
}

func (s *GenericStorage) Watch(ctx context.Context, options *metainternalversion.ListOptions) (watch.Interface, error) {
	namespace := getNamespace(ctx)
	opts := storage.WatchOptions{}
	if options != nil {
		if options.LabelSelector != nil {
			opts.LabelSelector = options.LabelSelector.String()
		}
		if options.FieldSelector != nil {
			opts.FieldSelector = options.FieldSelector.String()
		}
		opts.ResourceVersion = options.ResourceVersion
	}

	return s.backend.Watch(ctx, s.config.Kind, namespace, opts)
}

func (s *GenericStorage) ConvertToTable(ctx context.Context, obj, tableOptions runtime.Object) (*metav1.Table, error) {
	columns := s.getColumnDefinitions()
	table := &metav1.Table{
		ColumnDefinitions: columns,
	}

	if items, err := meta.ExtractList(obj); err == nil {
		for _, item := range items {
			table.Rows = append(table.Rows, s.objectToTableRow(item))
		}
		return table, nil
	}

	table.Rows = append(table.Rows, s.objectToTableRow(obj))
	return table, nil
}

func (s *GenericStorage) getColumnDefinitions() []metav1.TableColumnDefinition {
	defs := []metav1.TableColumnDefinition{
		{Name: "Name", Type: "string", Format: "name"},
	}

	if s.printerColumns != nil {
		for _, col := range s.printerColumns.GetColumns(s.config.Kind) {
			format := ""
			if col.Type == columnTypeDate {
				format = columnTypeDate
			}
			defs = append(defs, metav1.TableColumnDefinition{
				Name:        col.Name,
				Type:        col.Type,
				Format:      format,
				Description: col.Description,
				Priority:    col.Priority,
			})
		}
	}

	return defs
}

func (s *GenericStorage) objectToTableRow(obj runtime.Object) metav1.TableRow {
	accessor, _ := meta.Accessor(obj)
	cells := []interface{}{accessor.GetName()}

	if s.printerColumns != nil {
		for _, col := range s.printerColumns.GetColumns(s.config.Kind) {
			cells = append(cells, s.printerColumns.EvaluateCell(col, obj))
		}
	}

	return metav1.TableRow{
		Object: runtime.RawExtension{Object: obj},
		Cells:  cells,
	}
}

func getNamespace(ctx context.Context) string {
	if reqInfo, ok := genericrequest.RequestInfoFrom(ctx); ok {
		return reqInfo.Namespace
	}
	return defaultNamespace
}

func handleUpdateError(err error, cfg ResourceConfig, operation, name string, start time.Time) error {
	metrics.RecordStorageLatency(operation, cfg.Kind, start)
	gr := schema.GroupResource{Group: arkv1alpha1.GroupVersion.Group, Resource: cfg.Resource}
	if errors.Is(err, storage.ErrConflict) {
		metrics.RecordStorageOperation(operation, cfg.Kind, "conflict")
		return apierrors.NewConflict(gr, name, err)
	}
	if errors.Is(err, storage.ErrNotFound) {
		metrics.RecordStorageOperation(operation, cfg.Kind, "not_found")
		return apierrors.NewNotFound(gr, name)
	}
	metrics.RecordStorageOperation(operation, cfg.Kind, "error")
	return fmt.Errorf("failed to %s %s: %w", operation, cfg.SingularName, err)
}

func setListItems(list runtime.Object, objects []runtime.Object, continueToken string) error {
	if err := meta.SetList(list, objects); err != nil {
		return fmt.Errorf("failed to set list items: %w", err)
	}
	accessor, err := meta.ListAccessor(list)
	if err != nil {
		return fmt.Errorf("failed to access list metadata: %w", err)
	}
	var maxRV string
	for _, obj := range objects {
		if objMeta, err := meta.Accessor(obj); err == nil {
			if rv := objMeta.GetResourceVersion(); rv > maxRV {
				maxRV = rv
			}
		}
	}
	accessor.SetResourceVersion(maxRV)
	if continueToken != "" {
		accessor.SetContinue(continueToken)
	}
	return nil
}
