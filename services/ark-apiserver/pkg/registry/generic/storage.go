package generic

import (
	"context"
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
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark-apiserver/pkg/metrics"
	arkstorage "mckinsey.com/ark-apiserver/pkg/storage"
)

const storageTimeout = 30 * time.Second

func storageContext(ctx context.Context) context.Context {
	return context.WithoutCancel(ctx)
}

type ResourceConfig struct {
	Kind         string
	Resource     string
	SingularName string
	NewFunc      func() runtime.Object
	NewListFunc  func() runtime.Object
}

type GenericStorage struct {
	backend   arkstorage.Backend
	converter arkstorage.TypeConverter
	config    ResourceConfig
}

var _ rest.Storage = &GenericStorage{}
var _ rest.Getter = &GenericStorage{}
var _ rest.Lister = &GenericStorage{}
var _ rest.CreaterUpdater = &GenericStorage{}
var _ rest.GracefulDeleter = &GenericStorage{}
var _ rest.Watcher = &GenericStorage{}
var _ rest.Scoper = &GenericStorage{}
var _ rest.SingularNameProvider = &GenericStorage{}

func NewGenericStorage(backend arkstorage.Backend, converter arkstorage.TypeConverter, config ResourceConfig) *GenericStorage {
	return &GenericStorage{
		backend:   backend,
		converter: converter,
		config:    config,
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
	obj, err := s.backend.Get(storageContext(ctx), s.config.Kind, namespace, name)
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
	opts := arkstorage.ListOptions{}
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

	objects, continueToken, err := s.backend.List(storageContext(ctx), s.config.Kind, namespace, opts)
	if err != nil {
		metrics.RecordStorageOperation("list", s.config.Kind, "error")
		metrics.RecordStorageLatency("list", s.config.Kind, start)
		return nil, fmt.Errorf("failed to list %s: %w", s.config.Resource, err)
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

	if err := s.backend.Create(storageContext(ctx), s.config.Kind, accessor.GetNamespace(), accessor.GetName(), obj); err != nil {
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

	existing, err := s.backend.Get(storageContext(ctx), s.config.Kind, namespace, name)
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

	if err := s.backend.Update(storageContext(ctx), s.config.Kind, namespace, name, updated); err != nil {
		metrics.RecordStorageOperation("update", s.config.Kind, "error")
		metrics.RecordStorageLatency("update", s.config.Kind, start)
		return nil, false, fmt.Errorf("failed to update %s: %w", s.config.SingularName, err)
	}

	metrics.RecordStorageOperation("update", s.config.Kind, "success")
	metrics.RecordStorageLatency("update", s.config.Kind, start)
	result, err := s.Get(ctx, name, &metav1.GetOptions{})
	return result, false, err
}

func (s *GenericStorage) Delete(ctx context.Context, name string, deleteValidation rest.ValidateObjectFunc, options *metav1.DeleteOptions) (runtime.Object, bool, error) {
	start := time.Now()
	namespace := getNamespace(ctx)

	existing, err := s.backend.Get(storageContext(ctx), s.config.Kind, namespace, name)
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

	if err := s.backend.Delete(storageContext(ctx), s.config.Kind, namespace, name); err != nil {
		metrics.RecordStorageOperation("delete", s.config.Kind, "error")
		metrics.RecordStorageLatency("delete", s.config.Kind, start)
		return nil, false, fmt.Errorf("failed to delete %s: %w", s.config.SingularName, err)
	}

	metrics.RecordStorageOperation("delete", s.config.Kind, "success")
	metrics.RecordStorageLatency("delete", s.config.Kind, start)
	return existing, true, nil
}

func (s *GenericStorage) Watch(ctx context.Context, options *metainternalversion.ListOptions) (watch.Interface, error) {
	namespace := getNamespace(ctx)
	opts := arkstorage.WatchOptions{}
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

func (s *GenericStorage) ConvertToTable(ctx context.Context, obj runtime.Object, tableOptions runtime.Object) (*metav1.Table, error) {
	table := &metav1.Table{
		ColumnDefinitions: []metav1.TableColumnDefinition{
			{Name: "Name", Type: "string", Format: "name"},
			{Name: "Age", Type: "string", Format: "date"},
		},
	}

	if items, err := meta.ExtractList(obj); err == nil {
		for _, item := range items {
			table.Rows = append(table.Rows, objectToTableRow(item))
		}
		return table, nil
	}

	table.Rows = append(table.Rows, objectToTableRow(obj))
	return table, nil
}

func objectToTableRow(obj runtime.Object) metav1.TableRow {
	accessor, _ := meta.Accessor(obj)
	return metav1.TableRow{
		Object: runtime.RawExtension{Object: obj},
		Cells: []interface{}{
			accessor.GetName(),
			accessor.GetCreationTimestamp().Time,
		},
	}
}

func getNamespace(ctx context.Context) string {
	if reqInfo, ok := genericrequest.RequestInfoFrom(ctx); ok {
		return reqInfo.Namespace
	}
	return "default"
}

func setListItems(list runtime.Object, objects []runtime.Object, resourceVersion string) error {
	switch l := list.(type) {
	case *arkv1alpha1.QueryList:
		for _, obj := range objects {
			if item, ok := obj.(*arkv1alpha1.Query); ok {
				l.Items = append(l.Items, *item)
			}
		}
		l.ResourceVersion = resourceVersion
	case *arkv1alpha1.AgentList:
		for _, obj := range objects {
			if item, ok := obj.(*arkv1alpha1.Agent); ok {
				l.Items = append(l.Items, *item)
			}
		}
		l.ResourceVersion = resourceVersion
	case *arkv1alpha1.ModelList:
		for _, obj := range objects {
			if item, ok := obj.(*arkv1alpha1.Model); ok {
				l.Items = append(l.Items, *item)
			}
		}
		l.ResourceVersion = resourceVersion
	case *arkv1alpha1.TeamList:
		for _, obj := range objects {
			if item, ok := obj.(*arkv1alpha1.Team); ok {
				l.Items = append(l.Items, *item)
			}
		}
		l.ResourceVersion = resourceVersion
	case *arkv1alpha1.ToolList:
		for _, obj := range objects {
			if item, ok := obj.(*arkv1alpha1.Tool); ok {
				l.Items = append(l.Items, *item)
			}
		}
		l.ResourceVersion = resourceVersion
	case *arkv1alpha1.MemoryList:
		for _, obj := range objects {
			if item, ok := obj.(*arkv1alpha1.Memory); ok {
				l.Items = append(l.Items, *item)
			}
		}
		l.ResourceVersion = resourceVersion
	case *arkv1alpha1.MCPServerList:
		for _, obj := range objects {
			if item, ok := obj.(*arkv1alpha1.MCPServer); ok {
				l.Items = append(l.Items, *item)
			}
		}
		l.ResourceVersion = resourceVersion
	case *arkv1alpha1.EvaluationList:
		for _, obj := range objects {
			if item, ok := obj.(*arkv1alpha1.Evaluation); ok {
				l.Items = append(l.Items, *item)
			}
		}
		l.ResourceVersion = resourceVersion
	case *arkv1alpha1.EvaluatorList:
		for _, obj := range objects {
			if item, ok := obj.(*arkv1alpha1.Evaluator); ok {
				l.Items = append(l.Items, *item)
			}
		}
		l.ResourceVersion = resourceVersion
	case *arkv1alpha1.A2ATaskList:
		for _, obj := range objects {
			if item, ok := obj.(*arkv1alpha1.A2ATask); ok {
				l.Items = append(l.Items, *item)
			}
		}
		l.ResourceVersion = resourceVersion
	case *arkv1prealpha1.A2AServerList:
		for _, obj := range objects {
			if item, ok := obj.(*arkv1prealpha1.A2AServer); ok {
				l.Items = append(l.Items, *item)
			}
		}
		l.ResourceVersion = resourceVersion
	case *arkv1prealpha1.ExecutionEngineList:
		for _, obj := range objects {
			if item, ok := obj.(*arkv1prealpha1.ExecutionEngine); ok {
				l.Items = append(l.Items, *item)
			}
		}
		l.ResourceVersion = resourceVersion
	default:
		return fmt.Errorf("unknown list type: %T", list)
	}
	return nil
}
