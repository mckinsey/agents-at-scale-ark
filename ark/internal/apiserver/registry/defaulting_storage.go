package registry

import (
	"context"

	metainternalversion "k8s.io/apimachinery/pkg/apis/meta/internalversion"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/apiserver/pkg/registry/rest"

	"mckinsey.com/ark/internal/apiserver/validation"
)

var (
	_ rest.Storage              = &DefaultingStorage{}
	_ rest.Getter               = &DefaultingStorage{}
	_ rest.Lister               = &DefaultingStorage{}
	_ rest.GracefulDeleter      = &DefaultingStorage{}
	_ rest.Watcher              = &DefaultingStorage{}
	_ rest.Scoper               = &DefaultingStorage{}
	_ rest.SingularNameProvider = &DefaultingStorage{}
)

type DefaultingStorage struct {
	rest.Storage
	defaulter validation.Defaulter
}

func NewDefaultingStorage(storage rest.Storage, defaulter validation.Defaulter) *DefaultingStorage {
	return &DefaultingStorage{
		Storage:   storage,
		defaulter: defaulter,
	}
}

func (s *DefaultingStorage) Create(ctx context.Context, obj runtime.Object, createValidation rest.ValidateObjectFunc, options *metav1.CreateOptions) (runtime.Object, error) {
	if s.defaulter != nil {
		if err := s.defaulter.Default(ctx, obj); err != nil {
			return nil, err
		}
	}

	if creater, ok := s.Storage.(rest.Creater); ok { //nolint:misspell // k8s interface name
		return creater.Create(ctx, obj, createValidation, options) //nolint:misspell
	}
	return nil, nil
}

func (s *DefaultingStorage) Update(ctx context.Context, name string, objInfo rest.UpdatedObjectInfo, createValidation rest.ValidateObjectFunc, updateValidation rest.ValidateObjectUpdateFunc, forceAllowCreate bool, options *metav1.UpdateOptions) (runtime.Object, bool, error) {
	wrappedObjInfo := &defaultingUpdatedObjectInfo{
		UpdatedObjectInfo: objInfo,
		defaulter:         s.defaulter,
	}

	if updater, ok := s.Storage.(rest.Updater); ok {
		return updater.Update(ctx, name, wrappedObjInfo, createValidation, updateValidation, forceAllowCreate, options)
	}
	return nil, false, nil
}

type defaultingUpdatedObjectInfo struct {
	rest.UpdatedObjectInfo
	defaulter validation.Defaulter
}

func (i *defaultingUpdatedObjectInfo) UpdatedObject(ctx context.Context, oldObj runtime.Object) (runtime.Object, error) {
	obj, err := i.UpdatedObjectInfo.UpdatedObject(ctx, oldObj)
	if err != nil {
		return nil, err
	}

	if i.defaulter != nil {
		if err := i.defaulter.Default(ctx, obj); err != nil {
			return nil, err
		}
	}

	return obj, nil
}

func (s *DefaultingStorage) NamespaceScoped() bool {
	if scoper, ok := s.Storage.(rest.Scoper); ok {
		return scoper.NamespaceScoped()
	}
	return true
}

func (s *DefaultingStorage) GetSingularName() string {
	if provider, ok := s.Storage.(rest.SingularNameProvider); ok {
		return provider.GetSingularName()
	}
	return ""
}

func (s *DefaultingStorage) New() runtime.Object {
	return s.Storage.New()
}

func (s *DefaultingStorage) Destroy() {
	s.Storage.Destroy()
}

func (s *DefaultingStorage) NewList() runtime.Object {
	if lister, ok := s.Storage.(rest.Lister); ok {
		return lister.NewList()
	}
	return nil
}

func (s *DefaultingStorage) Get(ctx context.Context, name string, options *metav1.GetOptions) (runtime.Object, error) {
	if getter, ok := s.Storage.(rest.Getter); ok {
		return getter.Get(ctx, name, options)
	}
	return nil, nil
}

func (s *DefaultingStorage) List(ctx context.Context, options *metainternalversion.ListOptions) (runtime.Object, error) {
	if lister, ok := s.Storage.(rest.Lister); ok {
		return lister.List(ctx, options)
	}
	return nil, nil
}

func (s *DefaultingStorage) Delete(ctx context.Context, name string, deleteValidation rest.ValidateObjectFunc, options *metav1.DeleteOptions) (runtime.Object, bool, error) {
	if deleter, ok := s.Storage.(rest.GracefulDeleter); ok {
		return deleter.Delete(ctx, name, deleteValidation, options)
	}
	return nil, false, nil
}

func (s *DefaultingStorage) Watch(ctx context.Context, options *metainternalversion.ListOptions) (watch.Interface, error) {
	if watcher, ok := s.Storage.(rest.Watcher); ok {
		return watcher.Watch(ctx, options)
	}
	return nil, nil
}

func (s *DefaultingStorage) ConvertToTable(ctx context.Context, obj, tableOptions runtime.Object) (*metav1.Table, error) {
	if lister, ok := s.Storage.(rest.Lister); ok {
		return lister.ConvertToTable(ctx, obj, tableOptions)
	}
	return nil, nil
}
