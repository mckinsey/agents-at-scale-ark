/* Copyright 2025. McKinsey & Company */

package registry

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	metainternalversion "k8s.io/apimachinery/pkg/apis/meta/internalversion"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
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
	return NewGenericStorage(backend, &mockConverter{}, config), backend
}

func TestNewGenericStorage(t *testing.T) {
	gs, _ := newTestStorage()
	if gs == nil {
		t.Fatal("expected non-nil storage")
	}
}

func TestGenericStorage_New(t *testing.T) {
	gs, _ := newTestStorage()
	obj := gs.New()
	if _, ok := obj.(*arkv1alpha1.Agent); !ok {
		t.Errorf("expected *Agent, got %T", obj)
	}
}

func TestGenericStorage_NewList(t *testing.T) {
	gs, _ := newTestStorage()
	obj := gs.NewList()
	if _, ok := obj.(*arkv1alpha1.AgentList); !ok {
		t.Errorf("expected *AgentList, got %T", obj)
	}
}

func TestGenericStorage_NamespaceScoped(t *testing.T) {
	gs, _ := newTestStorage()
	if !gs.NamespaceScoped() {
		t.Error("expected NamespaceScoped() to return true")
	}
}

func TestGenericStorage_GetSingularName(t *testing.T) {
	gs, _ := newTestStorage()
	if got := gs.GetSingularName(); got != "agent" {
		t.Errorf("GetSingularName() = %q, want %q", got, "agent")
	}
}

func TestGenericStorage_Create(t *testing.T) {
	gs, _ := newTestStorage()
	ctx := contextWithNamespace(testNS())

	agent := &arkv1alpha1.Agent{}
	agent.Name = testAgentName

	result, err := gs.Create(ctx, agent, nil, &metav1.CreateOptions{})
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	if result == nil {
		t.Error("expected non-nil result")
	}
}

func TestGenericStorage_Create_WithValidation(t *testing.T) {
	gs, _ := newTestStorage()
	ctx := contextWithNamespace(testNS())

	agent := &arkv1alpha1.Agent{}
	agent.Name = testAgentName

	validationErr := errors.New("validation failed")
	validator := func(ctx context.Context, obj runtime.Object) error {
		return validationErr
	}

	_, err := gs.Create(ctx, agent, validator, &metav1.CreateOptions{})
	if err != validationErr {
		t.Errorf("expected validation error, got %v", err)
	}
}

func TestGenericStorage_Get(t *testing.T) {
	gs, backend := newTestStorage()
	ctx := contextWithNamespace(testNS())

	agent := &arkv1alpha1.Agent{}
	agent.Name = testAgentName
	agent.Namespace = testNS()
	backend.objects["Agent/default/test-agent"] = agent

	result, err := gs.Get(ctx, testAgentName, &metav1.GetOptions{})
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}

	got, ok := result.(*arkv1alpha1.Agent)
	if !ok {
		t.Fatalf("expected *Agent, got %T", result)
	}
	if got.Name != testAgentName {
		t.Errorf("expected name '%s', got '%s'", testAgentName, got.Name)
	}
}

func TestGenericStorage_Get_NotFound(t *testing.T) {
	gs, _ := newTestStorage()
	ctx := contextWithNamespace(testNS())

	_, err := gs.Get(ctx, "nonexistent", &metav1.GetOptions{})
	if err == nil {
		t.Error("expected error for nonexistent object")
	}
}

func TestGenericStorage_List(t *testing.T) {
	gs, backend := newTestStorage()
	ctx := contextWithNamespace(testNS())

	for i := 0; i < 3; i++ {
		agent := &arkv1alpha1.Agent{}
		agent.Name = "agent-" + string(rune('a'+i))
		agent.Namespace = testNS()
		backend.objects["Agent/default/"+agent.Name] = agent
	}

	result, err := gs.List(ctx, &metainternalversion.ListOptions{})
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}

	list, ok := result.(*arkv1alpha1.AgentList)
	if !ok {
		t.Fatalf("expected *AgentList, got %T", result)
	}

	if len(list.Items) != 3 {
		t.Errorf("expected 3 items, got %d", len(list.Items))
	}
}

func TestGenericStorage_List_WithLabelSelector(t *testing.T) {
	gs, _ := newTestStorage()
	ctx := contextWithNamespace(testNS())

	selector, _ := labels.Parse("app=test")
	_, err := gs.List(ctx, &metainternalversion.ListOptions{
		LabelSelector: selector,
	})
	if err != nil {
		t.Fatalf("List() with selector error = %v", err)
	}
}

func TestGenericStorage_Update(t *testing.T) {
	gs, backend := newTestStorage()
	ctx := contextWithNamespace(testNS())

	agent := &arkv1alpha1.Agent{}
	agent.Name = testAgentName
	agent.Namespace = testNS()
	backend.objects["Agent/default/test-agent"] = agent

	updater := &simpleUpdatedObjectInfo{obj: agent}
	result, created, err := gs.Update(ctx, testAgentName, updater, nil, nil, false, &metav1.UpdateOptions{})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if created {
		t.Error("expected created to be false")
	}
	if result == nil {
		t.Error("expected non-nil result")
	}
}

func TestGenericStorage_Update_NotFound(t *testing.T) {
	gs, _ := newTestStorage()
	ctx := contextWithNamespace(testNS())

	agent := &arkv1alpha1.Agent{}
	agent.Name = "nonexistent"

	updater := &simpleUpdatedObjectInfo{obj: agent}
	_, _, err := gs.Update(ctx, "nonexistent", updater, nil, nil, false, &metav1.UpdateOptions{})
	if err == nil {
		t.Error("expected error for nonexistent object")
	}
}

func TestGenericStorage_Update_ForceCreate(t *testing.T) {
	gs, _ := newTestStorage()
	ctx := contextWithNamespace(testNS())

	agent := &arkv1alpha1.Agent{}
	agent.Name = "new-agent"
	agent.Namespace = testNS()

	updater := &simpleUpdatedObjectInfo{obj: agent}
	result, created, err := gs.Update(ctx, "new-agent", updater, nil, nil, true, &metav1.UpdateOptions{})
	if err != nil {
		t.Fatalf("Update() with forceAllowCreate error = %v", err)
	}
	if !created {
		t.Error("expected created to be true")
	}
	if result == nil {
		t.Error("expected non-nil result")
	}
}

func TestGenericStorage_Delete(t *testing.T) {
	gs, backend := newTestStorage()
	ctx := contextWithNamespace(testNS())

	agent := &arkv1alpha1.Agent{}
	agent.Name = testAgentName
	agent.Namespace = testNS()
	backend.objects["Agent/default/test-agent"] = agent

	result, deleted, err := gs.Delete(ctx, testAgentName, nil, &metav1.DeleteOptions{})
	if err != nil {
		t.Fatalf("Delete() error = %v", err)
	}
	if !deleted {
		t.Error("expected deleted to be true")
	}
	if result == nil {
		t.Error("expected non-nil result")
	}
}

func TestGenericStorage_Delete_NotFound(t *testing.T) {
	gs, _ := newTestStorage()
	ctx := contextWithNamespace(testNS())

	_, _, err := gs.Delete(ctx, "nonexistent", nil, &metav1.DeleteOptions{})
	if err == nil {
		t.Error("expected error for nonexistent object")
	}
}

func TestGenericStorage_Delete_WithValidation(t *testing.T) {
	gs, backend := newTestStorage()
	ctx := contextWithNamespace(testNS())

	agent := &arkv1alpha1.Agent{}
	agent.Name = testAgentName
	agent.Namespace = testNS()
	backend.objects["Agent/default/test-agent"] = agent

	validationErr := errors.New("cannot delete")
	validator := func(ctx context.Context, obj runtime.Object) error {
		return validationErr
	}

	_, _, err := gs.Delete(ctx, testAgentName, validator, &metav1.DeleteOptions{})
	if err != validationErr {
		t.Errorf("expected validation error, got %v", err)
	}
}

func TestGenericStorage_Watch(t *testing.T) {
	gs, _ := newTestStorage()
	ctx := contextWithNamespace(testNS())

	watcher, err := gs.Watch(ctx, &metainternalversion.ListOptions{})
	if err != nil {
		t.Fatalf("Watch() error = %v", err)
	}
	if watcher == nil {
		t.Error("expected non-nil watcher")
	}
	watcher.Stop()
}

func TestGenericStorage_ConvertToTable_Single(t *testing.T) {
	gs, _ := newTestStorage()
	ctx := context.Background()

	agent := &arkv1alpha1.Agent{}
	agent.Name = testAgentName
	agent.CreationTimestamp = metav1.Now()

	table, err := gs.ConvertToTable(ctx, agent, nil)
	if err != nil {
		t.Fatalf("ConvertToTable() error = %v", err)
	}

	if len(table.ColumnDefinitions) != 2 {
		t.Errorf("expected 2 columns, got %d", len(table.ColumnDefinitions))
	}
	if len(table.Rows) != 1 {
		t.Errorf("expected 1 row, got %d", len(table.Rows))
	}
}

func TestGenericStorage_ConvertToTable_List(t *testing.T) {
	gs, _ := newTestStorage()
	ctx := context.Background()

	list := &arkv1alpha1.AgentList{
		Items: []arkv1alpha1.Agent{
			{ObjectMeta: metav1.ObjectMeta{Name: "agent-1", CreationTimestamp: metav1.Now()}},
			{ObjectMeta: metav1.ObjectMeta{Name: "agent-2", CreationTimestamp: metav1.Now()}},
		},
	}

	table, err := gs.ConvertToTable(ctx, list, nil)
	if err != nil {
		t.Fatalf("ConvertToTable() error = %v", err)
	}

	if len(table.Rows) != 2 {
		t.Errorf("expected 2 rows, got %d", len(table.Rows))
	}
}

func TestGenericStorage_Destroy(t *testing.T) {
	gs, _ := newTestStorage()
	gs.Destroy()
}

func TestGetNamespace(t *testing.T) {
	tests := []struct {
		name     string
		ctx      context.Context
		expected string
	}{
		{
			name:     "with namespace",
			ctx:      contextWithNamespace("test-ns"),
			expected: "test-ns",
		},
		{
			name:     "without request info",
			ctx:      context.Background(),
			expected: "default", //nolint:goconst
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := getNamespace(tt.ctx)
			if got != tt.expected {
				t.Errorf("getNamespace() = %q, want %q", got, tt.expected)
			}
		})
	}
}

func TestSetListItems(t *testing.T) {
	list := &arkv1alpha1.AgentList{}
	objects := []runtime.Object{
		&arkv1alpha1.Agent{ObjectMeta: metav1.ObjectMeta{Name: "a1", ResourceVersion: "1"}},
		&arkv1alpha1.Agent{ObjectMeta: metav1.ObjectMeta{Name: "a2", ResourceVersion: "2"}},
	}

	err := setListItems(list, objects, "next-token")
	if err != nil {
		t.Fatalf("setListItems() error = %v", err)
	}

	if len(list.Items) != 2 {
		t.Errorf("expected 2 items, got %d", len(list.Items))
	}
	if list.Continue != "next-token" {
		t.Errorf("expected continue 'next-token', got '%s'", list.Continue)
	}
}
