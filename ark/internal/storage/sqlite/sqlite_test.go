/* Copyright 2025. McKinsey & Company */

package sqlite

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/watch"

	"mckinsey.com/ark/internal/storage"
)

type testObject struct {
	APIVersion string `json:"apiVersion"`
	Kind       string `json:"kind"`
	Metadata   struct {
		Name        string            `json:"name"`
		Namespace   string            `json:"namespace"`
		UID         string            `json:"uid"`
		Labels      map[string]string `json:"labels,omitempty"`
		Annotations map[string]string `json:"annotations,omitempty"`
	} `json:"metadata"`
	Spec   map[string]interface{} `json:"spec,omitempty"`
	Status map[string]interface{} `json:"status,omitempty"`
}

func (t *testObject) GetObjectKind() schema.ObjectKind { return schema.EmptyObjectKind }
func (t *testObject) DeepCopyObject() runtime.Object {
	data, _ := json.Marshal(t)
	c := &testObject{}
	_ = json.Unmarshal(data, c)
	return c
}

type mockConverter struct{}

func (m *mockConverter) NewObject(kind string) runtime.Object {
	return &testObject{APIVersion: "ark.mckinsey.com/v1alpha1", Kind: kind}
}

func (m *mockConverter) NewListObject(kind string) runtime.Object {
	return &testObject{APIVersion: "ark.mckinsey.com/v1alpha1", Kind: kind + "List"}
}

func (m *mockConverter) Encode(obj runtime.Object) ([]byte, error) {
	return json.Marshal(obj)
}

func (m *mockConverter) Decode(kind string, data []byte) (runtime.Object, error) {
	obj := &testObject{}
	if err := json.Unmarshal(data, obj); err != nil {
		return nil, err
	}
	return obj, nil
}

func (m *mockConverter) APIVersion(kind string) string {
	return "ark.mckinsey.com/v1alpha1"
}

func newTestBackend(t *testing.T) *SQLiteBackend {
	t.Helper()
	backend, err := New(":memory:", &mockConverter{})
	if err != nil {
		t.Fatalf("failed to create backend: %v", err)
	}
	t.Cleanup(func() { _ = backend.Close() })
	return backend
}

func createTestObject(name, namespace, uid string) *testObject {
	return &testObject{
		APIVersion: "ark.mckinsey.com/v1alpha1",
		Kind:       "Agent",
		Metadata: struct {
			Name        string            `json:"name"`
			Namespace   string            `json:"namespace"`
			UID         string            `json:"uid"`
			Labels      map[string]string `json:"labels,omitempty"`
			Annotations map[string]string `json:"annotations,omitempty"`
		}{
			Name:      name,
			Namespace: namespace,
			UID:       uid,
			Labels:    map[string]string{"app": "test"},
		},
		Spec: map[string]interface{}{"model": "gpt-4"},
	}
}

func TestNew(t *testing.T) {
	backend, err := New(":memory:", &mockConverter{})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	defer func() { _ = backend.Close() }()

	if backend.db == nil {
		t.Error("expected db to be initialized")
	}
	if backend.sem == nil {
		t.Error("expected semaphore to be initialized")
	}
}

func TestNew_InvalidPath(t *testing.T) {
	_, err := New("/nonexistent/path/that/should/fail/db.sqlite", &mockConverter{})
	if err == nil {
		t.Error("expected error for invalid path")
	}
}

func TestCreate(t *testing.T) {
	backend := newTestBackend(t)
	ctx := context.Background()

	obj := createTestObject("agent1", "default", "uid-123")
	err := backend.Create(ctx, "Agent", "default", "agent1", obj)
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	got, err := backend.Get(ctx, "Agent", "default", "agent1")
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	if got == nil {
		t.Error("expected object, got nil")
	}
}

func TestCreate_Duplicate(t *testing.T) {
	backend := newTestBackend(t)
	ctx := context.Background()

	obj := createTestObject("agent1", "default", "uid-123")
	_ = backend.Create(ctx, "Agent", "default", "agent1", obj)

	err := backend.Create(ctx, "Agent", "default", "agent1", obj)
	if err == nil {
		t.Error("expected error for duplicate create")
	}
}

func TestGet(t *testing.T) {
	backend := newTestBackend(t)
	ctx := context.Background()

	obj := createTestObject("agent1", "default", "uid-123")
	_ = backend.Create(ctx, "Agent", "default", "agent1", obj)

	got, err := backend.Get(ctx, "Agent", "default", "agent1")
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}

	testObj, ok := got.(*testObject)
	if !ok {
		t.Fatalf("expected *testObject, got %T", got)
	}

	if testObj.Metadata.Name != "agent1" {
		t.Errorf("expected name 'agent1', got '%s'", testObj.Metadata.Name)
	}
	if testObj.Metadata.Namespace != "default" {
		t.Errorf("expected namespace 'default', got '%s'", testObj.Metadata.Namespace)
	}
}

func TestGet_NotFound(t *testing.T) {
	backend := newTestBackend(t)
	ctx := context.Background()

	_, err := backend.Get(ctx, "Agent", "default", "nonexistent")
	if err == nil {
		t.Error("expected error for nonexistent object")
	}
	if err.Error() != "not found" {
		t.Errorf("expected 'not found' error, got '%v'", err)
	}
}

func TestList(t *testing.T) {
	backend := newTestBackend(t)
	ctx := context.Background()

	for i := 0; i < 5; i++ {
		obj := createTestObject("agent-"+string(rune('a'+i)), "default", "uid-"+string(rune('a'+i)))
		_ = backend.Create(ctx, "Agent", "default", obj.Metadata.Name, obj)
	}

	objects, continueToken, err := backend.List(ctx, "Agent", "default", storage.ListOptions{})
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}

	if len(objects) != 5 {
		t.Errorf("expected 5 objects, got %d", len(objects))
	}
	if continueToken != "" {
		t.Errorf("expected empty continue token, got '%s'", continueToken)
	}
}

func TestList_WithLimit(t *testing.T) {
	backend := newTestBackend(t)
	ctx := context.Background()

	for i := 0; i < 10; i++ {
		obj := createTestObject("agent-"+string(rune('a'+i)), "default", "uid-"+string(rune('a'+i)))
		_ = backend.Create(ctx, "Agent", "default", obj.Metadata.Name, obj)
	}

	objects, continueToken, err := backend.List(ctx, "Agent", "default", storage.ListOptions{Limit: 5})
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}

	if len(objects) != 5 {
		t.Errorf("expected 5 objects, got %d", len(objects))
	}
	if continueToken == "" {
		t.Error("expected non-empty continue token")
	}
}

func TestList_Pagination(t *testing.T) {
	backend := newTestBackend(t)
	ctx := context.Background()

	for i := 0; i < 10; i++ {
		obj := createTestObject("agent-"+string(rune('a'+i)), "default", "uid-"+string(rune('a'+i)))
		_ = backend.Create(ctx, "Agent", "default", obj.Metadata.Name, obj)
	}

	page1, token1, _ := backend.List(ctx, "Agent", "default", storage.ListOptions{Limit: 5})
	if len(page1) != 5 {
		t.Errorf("page 1: expected 5 objects, got %d", len(page1))
	}

	page2, token2, _ := backend.List(ctx, "Agent", "default", storage.ListOptions{Limit: 5, Continue: token1})
	if len(page2) != 5 {
		t.Errorf("page 2: expected 5 objects, got %d", len(page2))
	}
	if token2 != "" {
		t.Errorf("expected empty continue token for last page, got '%s'", token2)
	}
}

func TestList_AllNamespaces(t *testing.T) {
	backend := newTestBackend(t)
	ctx := context.Background()

	_ = backend.Create(ctx, "Agent", "ns1", "agent1", createTestObject("agent1", "ns1", "uid-1"))
	_ = backend.Create(ctx, "Agent", "ns2", "agent2", createTestObject("agent2", "ns2", "uid-2"))
	_ = backend.Create(ctx, "Agent", "ns3", "agent3", createTestObject("agent3", "ns3", "uid-3"))

	objects, _, err := backend.List(ctx, "Agent", "", storage.ListOptions{})
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}

	if len(objects) != 3 {
		t.Errorf("expected 3 objects across namespaces, got %d", len(objects))
	}
}

func TestUpdate(t *testing.T) {
	backend := newTestBackend(t)
	ctx := context.Background()

	obj := createTestObject("agent1", "default", "uid-123")
	_ = backend.Create(ctx, "Agent", "default", "agent1", obj)

	obj.Spec["model"] = "gpt-4-turbo"
	err := backend.Update(ctx, "Agent", "default", "agent1", obj)
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}

	got, _ := backend.Get(ctx, "Agent", "default", "agent1")
	testObj := got.(*testObject)
	if testObj.Spec["model"] != "gpt-4-turbo" {
		t.Errorf("expected updated spec, got '%v'", testObj.Spec["model"])
	}
}

func TestUpdate_NotFound(t *testing.T) {
	backend := newTestBackend(t)
	ctx := context.Background()

	obj := createTestObject("nonexistent", "default", "uid-123")
	err := backend.Update(ctx, "Agent", "default", "nonexistent", obj)
	if err == nil {
		t.Error("expected error for nonexistent object")
	}
	if err.Error() != "not found" {
		t.Errorf("expected 'not found' error, got '%v'", err)
	}
}

func TestDelete(t *testing.T) {
	backend := newTestBackend(t)
	ctx := context.Background()

	obj := createTestObject("agent1", "default", "uid-123")
	_ = backend.Create(ctx, "Agent", "default", "agent1", obj)

	err := backend.Delete(ctx, "Agent", "default", "agent1")
	if err != nil {
		t.Fatalf("Delete() error = %v", err)
	}

	_, err = backend.Get(ctx, "Agent", "default", "agent1")
	if err == nil {
		t.Error("expected error after delete")
	}
}

func TestDelete_NotFound(t *testing.T) {
	backend := newTestBackend(t)
	ctx := context.Background()

	err := backend.Delete(ctx, "Agent", "default", "nonexistent")
	if err == nil {
		t.Error("expected error for nonexistent object")
	}
}

func TestGetResourceVersion(t *testing.T) {
	backend := newTestBackend(t)
	ctx := context.Background()

	obj := createTestObject("agent1", "default", "uid-123")
	_ = backend.Create(ctx, "Agent", "default", "agent1", obj)

	rv, err := backend.GetResourceVersion(ctx, "Agent", "default", "agent1")
	if err != nil {
		t.Fatalf("GetResourceVersion() error = %v", err)
	}

	if rv <= 0 {
		t.Errorf("expected positive resource version, got %d", rv)
	}
}

func TestCleanup(t *testing.T) {
	backend := newTestBackend(t)
	ctx := context.Background()

	obj := createTestObject("agent1", "default", "uid-123")
	_ = backend.Create(ctx, "Agent", "default", "agent1", obj)
	_ = backend.Delete(ctx, "Agent", "default", "agent1")

	deleted, err := backend.Cleanup(ctx, 0)
	if err != nil {
		t.Fatalf("Cleanup() error = %v", err)
	}

	if deleted != 1 {
		t.Errorf("expected 1 deleted, got %d", deleted)
	}
}

func TestCleanup_RetentionPeriod(t *testing.T) {
	backend := newTestBackend(t)
	ctx := context.Background()

	obj := createTestObject("agent1", "default", "uid-123")
	_ = backend.Create(ctx, "Agent", "default", "agent1", obj)
	_ = backend.Delete(ctx, "Agent", "default", "agent1")

	deleted, err := backend.Cleanup(ctx, 24*time.Hour)
	if err != nil {
		t.Fatalf("Cleanup() error = %v", err)
	}

	if deleted != 0 {
		t.Errorf("expected 0 deleted (within retention), got %d", deleted)
	}
}

func TestWatch(t *testing.T) {
	backend := newTestBackend(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	watcher, err := backend.Watch(ctx, "Agent", "default", storage.WatchOptions{})
	if err != nil {
		t.Fatalf("Watch() error = %v", err)
	}
	defer watcher.Stop()

	eventCh := watcher.ResultChan()

	select {
	case event := <-eventCh:
		if event.Type != watch.Bookmark {
			t.Errorf("expected initial bookmark, got %v", event.Type)
		}
	case <-time.After(time.Second):
		t.Error("timeout waiting for initial bookmark")
	}
}

func TestWatch_ReceivesCreateEvent(t *testing.T) {
	backend := newTestBackend(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	watcher, err := backend.Watch(ctx, "Agent", "default", storage.WatchOptions{})
	if err != nil {
		t.Fatalf("Watch() error = %v", err)
	}
	defer watcher.Stop()

	eventCh := watcher.ResultChan()

	for i := 0; i < 3; i++ {
		select {
		case <-eventCh:
		case <-time.After(time.Second):
		}
	}

	obj := createTestObject("agent1", "default", "uid-123")
	go func() {
		time.Sleep(100 * time.Millisecond)
		_ = backend.Create(ctx, "Agent", "default", "agent1", obj)
	}()

	select {
	case event := <-eventCh:
		if event.Type != watch.Added {
			t.Errorf("expected Added event, got %v", event.Type)
		}
	case <-time.After(2 * time.Second):
		t.Error("timeout waiting for create event")
	}
}

func TestWatch_Stop(t *testing.T) {
	backend := newTestBackend(t)
	ctx := context.Background()

	watcher, _ := backend.Watch(ctx, "Agent", "default", storage.WatchOptions{})
	watcher.Stop()

	select {
	case _, ok := <-watcher.ResultChan():
		if ok {
			t.Log("received event after stop (draining)")
		}
	case <-time.After(100 * time.Millisecond):
	}
}

func TestConcurrentOperations(t *testing.T) {
	backend := newTestBackend(t)
	ctx := context.Background()

	done := make(chan struct{})
	for i := 0; i < 10; i++ {
		go func(n int) {
			defer func() { done <- struct{}{} }()
			name := "agent-" + string(rune('a'+n))
			obj := createTestObject(name, "default", "uid-"+string(rune('a'+n)))
			_ = backend.Create(ctx, "Agent", "default", name, obj)
			_, _, _ = backend.List(ctx, "Agent", "default", storage.ListOptions{})
			_, _ = backend.Get(ctx, "Agent", "default", name)
		}(i)
	}

	for i := 0; i < 10; i++ {
		<-done
	}
}

func TestContextCancellation(t *testing.T) {
	backend := newTestBackend(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, _, err := backend.List(ctx, "Agent", "default", storage.ListOptions{})
	if err == nil {
		t.Error("expected error for cancelled context")
	}
}
