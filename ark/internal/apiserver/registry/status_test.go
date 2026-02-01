/* Copyright 2025. McKinsey & Company */

package registry

import (
	"context"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

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

func TestNewStatusStorage(t *testing.T) {
	storage, _ := newTestStatusStorage()
	if storage == nil {
		t.Fatal("expected non-nil storage")
	}
}

func TestStatusStorage_New(t *testing.T) {
	storage, _ := newTestStatusStorage()
	obj := storage.New()
	if _, ok := obj.(*arkv1alpha1.Agent); !ok {
		t.Errorf("expected *Agent, got %T", obj)
	}
}

func TestStatusStorage_NamespaceScoped(t *testing.T) {
	storage, _ := newTestStatusStorage()
	if !storage.NamespaceScoped() {
		t.Error("expected NamespaceScoped() to return true")
	}
}

func TestStatusStorage_Get(t *testing.T) {
	storage, backend := newTestStatusStorage()
	ctx := contextWithNamespace("default")

	agent := &arkv1alpha1.Agent{}
	agent.Name = "test-agent"
	agent.Namespace = "default"
	backend.objects["Agent/default/test-agent"] = agent

	result, err := storage.Get(ctx, "test-agent", &metav1.GetOptions{})
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	if result == nil {
		t.Error("expected non-nil result")
	}
}

func TestStatusStorage_Get_NotFound(t *testing.T) {
	storage, _ := newTestStatusStorage()
	ctx := contextWithNamespace("default")

	_, err := storage.Get(ctx, "nonexistent", &metav1.GetOptions{})
	if err == nil {
		t.Error("expected error for nonexistent object")
	}
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

func TestStatusStorage_Update(t *testing.T) {
	storage, backend := newTestStatusStorage()
	ctx := contextWithNamespace("default")

	agent := &arkv1alpha1.Agent{}
	agent.Name = "test-agent"
	agent.Namespace = "default"
	backend.objects["Agent/default/test-agent"] = agent

	updatedAgent := agent.DeepCopy()
	updatedAgent.Status.Conditions = append(updatedAgent.Status.Conditions, metav1.Condition{
		Type:   "Ready",
		Status: metav1.ConditionTrue,
	})

	updater := &simpleUpdatedObjectInfo{obj: updatedAgent}
	result, created, err := storage.Update(ctx, "test-agent", updater, nil, nil, false, &metav1.UpdateOptions{})
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

func TestStatusStorage_Update_NotFound(t *testing.T) {
	storage, _ := newTestStatusStorage()
	ctx := contextWithNamespace("default")

	agent := &arkv1alpha1.Agent{}
	agent.Name = "nonexistent"

	updater := &simpleUpdatedObjectInfo{obj: agent}
	_, _, err := storage.Update(ctx, "nonexistent", updater, nil, nil, false, &metav1.UpdateOptions{})
	if err == nil {
		t.Error("expected error for nonexistent object")
	}
}

func TestStatusStorage_Destroy(t *testing.T) {
	storage, _ := newTestStatusStorage()
	storage.Destroy()
}

func TestGetNamespaceFromContext(t *testing.T) {
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
			expected: "default",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := getNamespaceFromContext(tt.ctx)
			if got != tt.expected {
				t.Errorf("getNamespaceFromContext() = %q, want %q", got, tt.expected)
			}
		})
	}
}

func TestCopyStatusOnly(t *testing.T) {
	src := &arkv1alpha1.Agent{}
	src.Name = "src-agent"
	src.Spec.ModelRef = &arkv1alpha1.AgentModelRef{Name: "new-model"}
	src.Status.Conditions = []metav1.Condition{{Type: "Ready", Status: metav1.ConditionTrue}}

	dst := &arkv1alpha1.Agent{}
	dst.Name = "dst-agent"
	dst.Spec.ModelRef = &arkv1alpha1.AgentModelRef{Name: "old-model"}
	dst.Status.Conditions = []metav1.Condition{{Type: "Ready", Status: metav1.ConditionFalse}}

	err := copyStatusOnly(dst, src)
	if err != nil {
		t.Fatalf("copyStatusOnly() error = %v", err)
	}

	if len(dst.Status.Conditions) != 1 || dst.Status.Conditions[0].Status != metav1.ConditionTrue {
		t.Errorf("expected status to be copied, got conditions: %v", dst.Status.Conditions)
	}
	if dst.Spec.ModelRef.Name != "old-model" {
		t.Errorf("spec should not change, got modelRef.name '%s'", dst.Spec.ModelRef.Name)
	}
	if dst.Name != "dst-agent" {
		t.Errorf("name should not change, got '%s'", dst.Name)
	}
}
