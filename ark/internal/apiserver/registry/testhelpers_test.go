/* Copyright 2025. McKinsey & Company */

package registry

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/watch"
	genericrequest "k8s.io/apiserver/pkg/endpoints/request"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/storage"
)

const testAgentName = "test-agent"

func testNS() string { return "default" } //nolint:goconst

type mockBackend struct {
	objects map[string]runtime.Object
	err     error
}

func newMockBackend() *mockBackend {
	return &mockBackend{objects: make(map[string]runtime.Object)}
}

func (m *mockBackend) key(kind, namespace, name string) string {
	return kind + "/" + namespace + "/" + name
}

func (m *mockBackend) Create(ctx context.Context, kind, namespace, name string, obj runtime.Object) error {
	if m.err != nil {
		return m.err
	}
	key := m.key(kind, namespace, name)
	if _, exists := m.objects[key]; exists {
		return errors.New("already exists")
	}
	m.objects[key] = obj
	return nil
}

func (m *mockBackend) Get(ctx context.Context, kind, namespace, name string) (runtime.Object, error) {
	if m.err != nil {
		return nil, m.err
	}
	key := m.key(kind, namespace, name)
	obj, ok := m.objects[key]
	if !ok {
		return nil, errors.New("not found")
	}
	return obj, nil
}

func (m *mockBackend) List(ctx context.Context, kind, namespace string, opts storage.ListOptions) ([]runtime.Object, string, error) {
	if m.err != nil {
		return nil, "", m.err
	}
	var result []runtime.Object
	prefix := kind + "/"
	if namespace != "" {
		prefix = kind + "/" + namespace + "/"
	}
	for key, obj := range m.objects {
		if len(key) >= len(prefix) && key[:len(prefix)] == prefix {
			result = append(result, obj)
		}
	}
	return result, "", nil
}

func (m *mockBackend) Update(ctx context.Context, kind, namespace, name string, obj runtime.Object) error {
	if m.err != nil {
		return m.err
	}
	key := m.key(kind, namespace, name)
	if _, exists := m.objects[key]; !exists {
		return errors.New("not found")
	}
	m.objects[key] = obj
	return nil
}

func (m *mockBackend) UpdateStatus(ctx context.Context, kind, namespace, name string, obj runtime.Object) error {
	return m.Update(ctx, kind, namespace, name, obj)
}

func (m *mockBackend) Delete(ctx context.Context, kind, namespace, name string) error {
	if m.err != nil {
		return m.err
	}
	key := m.key(kind, namespace, name)
	if _, exists := m.objects[key]; !exists {
		return errors.New("not found")
	}
	delete(m.objects, key)
	return nil
}

func (m *mockBackend) Watch(ctx context.Context, kind, namespace string, opts storage.WatchOptions) (watch.Interface, error) {
	return &mockWatcher{ch: make(chan watch.Event)}, nil
}

func (m *mockBackend) GetResourceVersion(ctx context.Context, kind, namespace, name string) (int64, error) {
	return 1, nil
}

func (m *mockBackend) Cleanup(ctx context.Context, retention time.Duration) (int64, error) {
	return 0, nil
}

func (m *mockBackend) Close() error {
	return nil
}

type mockWatcher struct {
	ch chan watch.Event
}

func (w *mockWatcher) Stop()                          { close(w.ch) }
func (w *mockWatcher) ResultChan() <-chan watch.Event { return w.ch }

type mockConverter struct{}

func (m *mockConverter) NewObject(kind string) runtime.Object {
	return &arkv1alpha1.Agent{}
}

func (m *mockConverter) NewListObject(kind string) runtime.Object {
	return &arkv1alpha1.AgentList{}
}

func (m *mockConverter) Encode(obj runtime.Object) ([]byte, error) {
	return json.Marshal(obj)
}

func (m *mockConverter) Decode(kind string, data []byte) (runtime.Object, error) {
	obj := &arkv1alpha1.Agent{}
	return obj, json.Unmarshal(data, obj)
}

func (m *mockConverter) APIVersion(kind string) string {
	return "ark.mckinsey.com/v1alpha1"
}

type simpleUpdatedObjectInfo struct {
	obj runtime.Object
}

func (s *simpleUpdatedObjectInfo) UpdatedObject(ctx context.Context, oldObj runtime.Object) (runtime.Object, error) {
	return s.obj, nil
}

func (s *simpleUpdatedObjectInfo) Preconditions() *metav1.Preconditions {
	return nil
}

func contextWithNamespace(ns string) context.Context {
	return genericrequest.WithRequestInfo(context.Background(), &genericrequest.RequestInfo{
		Namespace: ns,
	})
}

func newTestStorage() (*GenericStorage, *mockBackend) {
	backend := newMockBackend()
	config := ResourceConfig{
		Kind:         "Agent",
		Resource:     "agents",
		SingularName: "agent",
		NewFunc:      func() runtime.Object { return &arkv1alpha1.Agent{} },
		NewListFunc:  func() runtime.Object { return &arkv1alpha1.AgentList{} },
	}
	return NewGenericStorage(backend, &mockConverter{}, config, nil), backend
}

func newTestStatusStorage() (*StatusStorage, *mockBackend) {
	backend := newMockBackend()
	config := ResourceConfig{
		Kind:         "Agent",
		Resource:     "agents",
		SingularName: "agent",
		NewFunc:      func() runtime.Object { return &arkv1alpha1.Agent{} },
		NewListFunc:  func() runtime.Object { return &arkv1alpha1.AgentList{} },
	}
	return NewStatusStorage(backend, &mockConverter{}, config), backend
}
