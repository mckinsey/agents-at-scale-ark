/* Copyright 2025. McKinsey & Company */

package registry

import (
	"context"
	"errors"
	"fmt"
	"strconv"
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
	"k8s.io/apiserver/pkg/storage/names"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/apiserver/metrics"
	"mckinsey.com/ark/internal/storage"
)

const (
	columnTypeDate          = "date"
	defaultNamespace        = "default"
	maxGenerateNameAttempts = 100
	// Delete stamps deletionTimestamp using the resourceVersion from the read that preceded it,
	// and admission now runs inside that window — policy matching plus CEL, where the callback
	// used to be a no-op. Delete gets no server-side conflict retry the way patch does, so a
	// resource under active reconciliation would surface a 409 it never used to.
	maxDeleteConflictAttempts = 5
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
		if errors.Is(err, storage.ErrInvalidRequest) {
			return nil, apierrors.NewBadRequest(err.Error())
		}
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

// PrepareForCreate populates server-owned metadata (namespace, uid, creationTimestamp) so
// that both Ark's referential validation and the generic admission chain see a formed
// object. Idempotent. Name generation is excluded: it belongs in Create's retry loop.
func PrepareForCreate(ctx context.Context, obj runtime.Object) error {
	accessor, err := meta.Accessor(obj)
	if err != nil {
		return fmt.Errorf("failed to access object metadata: %w", err)
	}
	if accessor.GetNamespace() == "" {
		accessor.SetNamespace(getNamespace(ctx))
	}
	if accessor.GetUID() == "" {
		accessor.SetUID(types.UID(uuid.New().String()))
	}
	if ts := accessor.GetCreationTimestamp(); ts.IsZero() {
		accessor.SetCreationTimestamp(metav1.Now())
	}
	return nil
}

func (s *GenericStorage) Create(ctx context.Context, obj runtime.Object, createValidation rest.ValidateObjectFunc, options *metav1.CreateOptions) (runtime.Object, error) {
	start := time.Now()

	// Mirrors upstream registry.Store.Create, which runs rest.BeforeCreate before
	// createValidation so admission sees a fully formed object.
	if err := PrepareForCreate(ctx, obj); err != nil {
		metrics.RecordStorageOperation("create", s.config.Kind, "error")
		return nil, err
	}
	accessor, err := meta.Accessor(obj)
	if err != nil {
		metrics.RecordStorageOperation("create", s.config.Kind, "error")
		return nil, fmt.Errorf("failed to access object metadata: %w", err)
	}

	// `obj` is passed live, not copied: AdmissionStorage may run Ark's defaulting inside this
	// callback and relies on mutating what gets persisted. See the matching note in Update.
	admit := func() error {
		if createValidation == nil {
			return nil
		}
		if err := createValidation(ctx, obj); err != nil {
			metrics.RecordStorageOperation("create", s.config.Kind, "validation_error")
			return err
		}
		return nil
	}

	// Handle generateName: if name is empty but generateName is set, generate a unique name
	// Retry on name collisions up to maxGenerateNameAttempts
	if accessor.GetName() == "" && accessor.GetGenerateName() != "" {
		return s.createWithGeneratedName(ctx, obj, accessor, admit, start)
	}

	if err := admit(); err != nil {
		metrics.RecordStorageLatency("create", s.config.Kind, start)
		return nil, err
	}

	sctx, cancel := storageContext(ctx)
	defer cancel()
	if err := s.backend.Create(sctx, s.config.Kind, accessor.GetNamespace(), accessor.GetName(), obj); err != nil {
		metrics.RecordStorageLatency("create", s.config.Kind, start)
		gr := schema.GroupResource{Group: arkv1alpha1.GroupVersion.Group, Resource: s.config.Resource}
		if errors.Is(err, storage.ErrAlreadyExists) {
			metrics.RecordStorageOperation("create", s.config.Kind, "already_exists")
			return nil, apierrors.NewAlreadyExists(gr, accessor.GetName())
		}
		metrics.RecordStorageOperation("create", s.config.Kind, "error")
		return nil, fmt.Errorf("failed to create %s: %w", s.config.SingularName, err)
	}

	metrics.RecordStorageOperation("create", s.config.Kind, "success")
	metrics.RecordStorageLatency("create", s.config.Kind, start)
	return s.Get(ctx, accessor.GetName(), &metav1.GetOptions{})
}

// createWithGeneratedName resolves a generateName request. Each attempt picks a fresh name and
// re-runs admission for it, since policy may key on the name; only a collision is retried.
func (s *GenericStorage) createWithGeneratedName(ctx context.Context, obj runtime.Object, accessor metav1.Object, admit func() error, start time.Time) (runtime.Object, error) {
	for attempt := 0; attempt < maxGenerateNameAttempts; attempt++ {
		accessor.SetName(names.SimpleNameGenerator.GenerateName(accessor.GetGenerateName()))

		if err := admit(); err != nil {
			metrics.RecordStorageLatency("create", s.config.Kind, start)
			return nil, err
		}

		sctx, cancel := storageContext(ctx)
		err := s.backend.Create(sctx, s.config.Kind, accessor.GetNamespace(), accessor.GetName(), obj)
		cancel()

		switch {
		case err == nil:
			metrics.RecordStorageOperation("create", s.config.Kind, "success")
			metrics.RecordStorageLatency("create", s.config.Kind, start)
			return s.Get(ctx, accessor.GetName(), &metav1.GetOptions{})
		case !errors.Is(err, storage.ErrAlreadyExists):
			metrics.RecordStorageLatency("create", s.config.Kind, start)
			metrics.RecordStorageOperation("create", s.config.Kind, "error")
			return nil, fmt.Errorf("failed to create %s: %w", s.config.SingularName, err)
		}
	}

	metrics.RecordStorageOperation("create", s.config.Kind, "generate_name_exhausted")
	metrics.RecordStorageLatency("create", s.config.Kind, start)
	gr := schema.GroupResource{Group: arkv1alpha1.GroupVersion.Group, Resource: s.config.Resource}
	return nil, apierrors.NewServerTimeout(gr, "create", 1)
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

	// Preserve resourceVersion from existing object if patch didn't include it.
	// kubectl strategic merge patches may send resourceVersion: null, but PostgreSQL
	// backend requires a non-zero resourceVersion for optimistic concurrency control.
	existingAccessor, _ := meta.Accessor(existing)
	updatedAccessor, _ := meta.Accessor(updated)
	if updatedAccessor.GetResourceVersion() == "" && existingAccessor.GetResourceVersion() != "" {
		updatedAccessor.SetResourceVersion(existingAccessor.GetResourceVersion())
	}

	// Carry over server-owned identity the client cannot change; a PUT body omitting these
	// would blank them, and hand admission below an object with empty uid/creationTimestamp.
	// Mirrors upstream rest.BeforeUpdate.
	if updatedAccessor.GetUID() == "" {
		updatedAccessor.SetUID(existingAccessor.GetUID())
	}
	if ts := updatedAccessor.GetCreationTimestamp(); ts.IsZero() {
		updatedAccessor.SetCreationTimestamp(existingAccessor.GetCreationTimestamp())
	}
	if updatedAccessor.GetNamespace() == "" {
		updatedAccessor.SetNamespace(existingAccessor.GetNamespace())
	}

	// `updated` is passed live, not copied: AdmissionStorage runs Ark's defaulting inside this
	// callback, so copying would silently drop those defaults. Upstream can copy because its
	// defaulting lives in a separate Strategy.PrepareForUpdate step; decoupling is a follow-up.
	if updateValidation != nil {
		if err := updateValidation(ctx, updated, existing); err != nil {
			metrics.RecordStorageOperation("update", s.config.Kind, "validation_error")
			return nil, false, err
		}
	}

	if err := s.backend.Update(sctx, s.config.Kind, namespace, name, updated); err != nil {
		return nil, false, handleUpdateError(err, s.config, "update", name, start)
	}

	// Finish a graceful deletion: once a terminating object (deletionTimestamp set)
	// has no finalizers left, perform the actual removal now.
	if updatedAccessor.GetDeletionTimestamp() != nil && len(updatedAccessor.GetFinalizers()) == 0 {
		if err := s.backend.Delete(sctx, s.config.Kind, namespace, name); err != nil {
			return nil, false, handleUpdateError(err, s.config, "delete", name, start)
		}
		metrics.RecordStorageOperation("update", s.config.Kind, "finalized_delete")
		metrics.RecordStorageLatency("update", s.config.Kind, start)
		return updated, false, nil
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

	accessor, err := meta.Accessor(existing)
	if err != nil {
		return nil, false, fmt.Errorf("failed to access object metadata: %w", err)
	}

	if options != nil && options.Preconditions != nil {
		gr := schema.GroupResource{Group: arkv1alpha1.GroupVersion.Group, Resource: s.config.Resource}
		pc := options.Preconditions
		if pc.UID != nil && *pc.UID != accessor.GetUID() {
			metrics.RecordStorageOperation("delete", s.config.Kind, "conflict")
			return nil, false, apierrors.NewConflict(gr, name,
				fmt.Errorf("the UID in the precondition (%v) does not match the UID in record (%v)", *pc.UID, accessor.GetUID()))
		}
		if pc.ResourceVersion != nil && *pc.ResourceVersion != accessor.GetResourceVersion() {
			metrics.RecordStorageOperation("delete", s.config.Kind, "conflict")
			return nil, false, apierrors.NewConflict(gr, name,
				fmt.Errorf("the ResourceVersion in the precondition (%v) does not match the ResourceVersion in record (%v)", *pc.ResourceVersion, accessor.GetResourceVersion()))
		}
	}

	// Graceful deletion: an object with finalizers is not removed yet. Mark it by
	// setting deletionTimestamp so controllers can run their finalizers; the actual
	// removal happens in Update once the last finalizer is gone. This mirrors the
	// behavior of the upstream Kubernetes API server.
	if len(accessor.GetFinalizers()) > 0 {
		// A caller that supplied preconditions asked to be told about the conflict rather than
		// have it resolved, and those were checked against the first read only.
		attempts := maxDeleteConflictAttempts
		if options != nil && options.Preconditions != nil {
			attempts = 1
		}
		marked, err := s.markForDeletion(ctx, sctx, namespace, name, existing, deleteValidation, attempts, start)
		if err != nil {
			return nil, false, err
		}
		metrics.RecordStorageOperation("delete", s.config.Kind, "pending_finalizers")
		metrics.RecordStorageLatency("delete", s.config.Kind, start)
		return marked, false, nil
	}

	if err := s.backend.Delete(sctx, s.config.Kind, namespace, name); err != nil {
		return nil, false, handleUpdateError(err, s.config, "delete", name, start)
	}

	metrics.RecordStorageOperation("delete", s.config.Kind, "success")
	metrics.RecordStorageLatency("delete", s.config.Kind, start)
	return existing, true, nil
}

// markForDeletion stamps deletionTimestamp so finalizers can run, retrying on a lost race. On
// conflict it re-reads and re-runs admission before re-stamping, since the object changed and
// policy must evaluate the version actually being marked. ctx carries the request (admission),
// sctx the storage deadline.
func (s *GenericStorage) markForDeletion(ctx, sctx context.Context, namespace, name string, obj runtime.Object, deleteValidation rest.ValidateObjectFunc, attempts int, start time.Time) (runtime.Object, error) {
	for attempt := 0; ; attempt++ {
		accessor, err := meta.Accessor(obj)
		if err != nil {
			return nil, fmt.Errorf("failed to access object metadata: %w", err)
		}
		// Already marked, either by the caller's earlier read or by whoever won the race; the
		// first timestamp is the one that counts, so leave it alone.
		if accessor.GetDeletionTimestamp() != nil {
			return obj, nil
		}

		// Stamp a copy: a write that conflicts must not leave a deletionTimestamp behind on an
		// object that was never persisted, since the next attempt would read it as already marked.
		marked := obj.DeepCopyObject()
		markedAccessor, err := meta.Accessor(marked)
		if err != nil {
			return nil, fmt.Errorf("failed to access object metadata: %w", err)
		}
		now := metav1.NewTime(time.Now())
		markedAccessor.SetDeletionTimestamp(&now)

		err = s.backend.Update(sctx, s.config.Kind, namespace, name, marked)
		if err == nil {
			return marked, nil
		}
		if !errors.Is(err, storage.ErrConflict) || attempt >= attempts-1 {
			return nil, handleUpdateError(err, s.config, "delete", name, start)
		}

		if obj, err = s.refreshForDeletion(ctx, sctx, namespace, name, deleteValidation); err != nil {
			return nil, err
		}
	}
}

// refreshForDeletion re-reads an object after a delete conflict and re-runs admission on it.
func (s *GenericStorage) refreshForDeletion(ctx, sctx context.Context, namespace, name string, deleteValidation rest.ValidateObjectFunc) (runtime.Object, error) {
	obj, err := s.backend.Get(sctx, s.config.Kind, namespace, name)
	if err != nil {
		// Only a genuine miss means the winner of the race finished the delete outright.
		// Reporting NotFound for anything else — a timeout on the shared sctx budget, a
		// dropped connection — tells the client the object is gone when it is still there
		// with finalizers and no deletionTimestamp, since 404 reads as success for a delete.
		if !errors.Is(err, storage.ErrNotFound) {
			metrics.RecordStorageOperation("delete", s.config.Kind, "error")
			return nil, fmt.Errorf("failed to re-read %s during delete: %w", s.config.SingularName, err)
		}
		metrics.RecordStorageOperation("delete", s.config.Kind, "not_found")
		gr := schema.GroupResource{Group: arkv1alpha1.GroupVersion.Group, Resource: s.config.Resource}
		return nil, apierrors.NewNotFound(gr, name)
	}
	if deleteValidation != nil {
		if err := deleteValidation(ctx, obj); err != nil {
			metrics.RecordStorageOperation("delete", s.config.Kind, "validation_error")
			return nil, err
		}
	}
	return obj, nil
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

	watcher, err := s.backend.Watch(ctx, s.config.Kind, namespace, opts)
	if err != nil {
		if errors.Is(err, storage.ErrInvalidRequest) {
			return nil, apierrors.NewBadRequest(err.Error())
		}
		if errors.Is(err, storage.ErrResourceExpired) {
			return nil, apierrors.NewResourceExpired(err.Error())
		}
		return nil, err
	}
	return watcher, nil
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
		// Propagate list metadata so paginating clients (kubectl defaults to
		// Table output) can read metadata.continue and fetch subsequent pages.
		if listMeta, err := meta.ListAccessor(obj); err == nil {
			table.ResourceVersion = listMeta.GetResourceVersion()
			table.Continue = listMeta.GetContinue()
			table.RemainingItemCount = listMeta.GetRemainingItemCount()
		}
		return table, nil
	}

	if objMeta, err := meta.Accessor(obj); err == nil {
		table.ResourceVersion = objMeta.GetResourceVersion()
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
	// Compute the list's resourceVersion numerically. Lexicographic string max
	// mis-orders across digit-count boundaries (e.g. "9" > "10"), which yields
	// a lower-than-true list RV and breaks the list→watch handoff (the client
	// then resumes watch from a stale point).
	var maxRV uint64
	for _, obj := range objects {
		objMeta, err := meta.Accessor(obj)
		if err != nil {
			continue
		}
		n, err := strconv.ParseUint(objMeta.GetResourceVersion(), 10, 64)
		if err != nil {
			continue
		}
		if n > maxRV {
			maxRV = n
		}
	}
	if maxRV > 0 {
		accessor.SetResourceVersion(strconv.FormatUint(maxRV, 10))
	}
	if continueToken != "" {
		accessor.SetContinue(continueToken)
	}
	return nil
}
