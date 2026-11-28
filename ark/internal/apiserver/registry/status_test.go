/* Copyright 2025. McKinsey & Company */

package registry

import (
	"context"
	"testing"

	apierrors "k8s.io/apimachinery/pkg/api/errors"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestNewStatusStorage(t *testing.T) {
	t.Parallel()
	storage, _ := newTestStatusStorage()
	if storage == nil {
		t.Fatal("expected non-nil storage")
	}
}

func TestStatusStorage_New(t *testing.T) {
	t.Parallel()
	storage, _ := newTestStatusStorage()
	obj := storage.New()
	if _, ok := obj.(*arkv1alpha1.Agent); !ok {
		t.Errorf("expected *Agent, got %T", obj)
	}
}

func TestStatusStorage_NamespaceScoped(t *testing.T) {
	t.Parallel()
	storage, _ := newTestStatusStorage()
	if !storage.NamespaceScoped() {
		t.Error("expected NamespaceScoped() to return true")
	}
}

func TestStatusStorage_Get(t *testing.T) {
	t.Parallel()
	storage, backend := newTestStatusStorage()
	ctx := contextWithNamespace(testNS())

	agent := &arkv1alpha1.Agent{}
	agent.Name = testAgentName
	agent.Namespace = testNS()
	backend.objects["Agent/default/test-agent"] = agent

	result, err := storage.Get(ctx, testAgentName, &metav1.GetOptions{})
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	if result == nil {
		t.Error("expected non-nil result")
	}
}

func TestStatusStorage_Get_NotFound(t *testing.T) {
	t.Parallel()
	storage, _ := newTestStatusStorage()
	ctx := contextWithNamespace(testNS())

	_, err := storage.Get(ctx, "nonexistent", &metav1.GetOptions{})
	if err == nil {
		t.Error("expected error for nonexistent object")
	}
}

func TestStatusStorage_Update(t *testing.T) {
	t.Parallel()
	storage, backend := newTestStatusStorage()
	ctx := contextWithNamespace(testNS())

	agent := &arkv1alpha1.Agent{}
	agent.Name = testAgentName
	agent.Namespace = testNS()
	backend.objects["Agent/default/test-agent"] = agent

	updatedAgent := agent.DeepCopy()
	updatedAgent.Status.Conditions = append(updatedAgent.Status.Conditions, metav1.Condition{
		Type:   "Ready",
		Status: metav1.ConditionTrue,
	})

	updater := &simpleUpdatedObjectInfo{obj: updatedAgent}
	result, created, err := storage.Update(ctx, testAgentName, updater, nil, nil, false, &metav1.UpdateOptions{})
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

func TestStatusStorage_Update_StaleResourceVersionConflicts(t *testing.T) {
	t.Parallel()
	storage, backend := newTestStatusStorage()
	ctx := contextWithNamespace(testNS())

	agent := &arkv1alpha1.Agent{}
	agent.Name = testAgentName
	agent.Namespace = testNS()
	agent.ResourceVersion = "7"
	backend.objects["Agent/default/test-agent"] = agent

	stale := agent.DeepCopy()
	stale.ResourceVersion = "6"
	stale.Status.Conditions = []metav1.Condition{{Type: "Ready", Status: metav1.ConditionTrue}}

	_, _, err := storage.Update(ctx, testAgentName, &simpleUpdatedObjectInfo{obj: stale}, nil, nil, false, &metav1.UpdateOptions{})
	if !apierrors.IsConflict(err) {
		t.Fatalf("expected Conflict, got %v", err)
	}
	if len(agent.Status.Conditions) != 0 {
		t.Errorf("stored status changed: %v", agent.Status.Conditions)
	}
}

func TestStatusStorage_Update_MatchingResourceVersionSucceeds(t *testing.T) {
	t.Parallel()
	storage, backend := newTestStatusStorage()
	ctx := contextWithNamespace(testNS())

	agent := &arkv1alpha1.Agent{}
	agent.Name = testAgentName
	agent.Namespace = testNS()
	agent.ResourceVersion = "7"
	backend.objects["Agent/default/test-agent"] = agent

	current := agent.DeepCopy()
	current.Status.Conditions = []metav1.Condition{{Type: "Ready", Status: metav1.ConditionTrue}}

	if _, _, err := storage.Update(ctx, testAgentName, &simpleUpdatedObjectInfo{obj: current}, nil, nil, false, &metav1.UpdateOptions{}); err != nil {
		t.Fatalf("Update() error = %v", err)
	}
}

func TestStatusStorage_Update_NotFound(t *testing.T) {
	t.Parallel()
	storage, _ := newTestStatusStorage()
	ctx := contextWithNamespace(testNS())

	agent := &arkv1alpha1.Agent{}
	agent.Name = "nonexistent"

	updater := &simpleUpdatedObjectInfo{obj: agent}
	_, _, err := storage.Update(ctx, "nonexistent", updater, nil, nil, false, &metav1.UpdateOptions{})
	if err == nil {
		t.Error("expected error for nonexistent object")
	}
}

func TestStatusStorage_Destroy(t *testing.T) {
	t.Parallel()
	storage, _ := newTestStatusStorage()
	storage.Destroy()
}

func TestResourceConfigNamespace(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name     string
		config   ResourceConfig
		ctx      context.Context
		expected string
	}{
		{
			name:     "with namespace",
			config:   ResourceConfig{},
			ctx:      contextWithNamespace("test-ns"),
			expected: "test-ns",
		},
		{
			name:     "without request info",
			config:   ResourceConfig{},
			ctx:      context.Background(),
			expected: "default", //nolint:goconst
		},
		{
			name:     "cluster-scoped ignores request namespace",
			config:   ResourceConfig{ClusterScoped: true},
			ctx:      contextWithNamespace("test-ns"),
			expected: "",
		},
		{
			name:     "cluster-scoped without request info",
			config:   ResourceConfig{ClusterScoped: true},
			ctx:      context.Background(),
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.config.namespace(tt.ctx)
			if got != tt.expected {
				t.Errorf("namespace() = %q, want %q", got, tt.expected)
			}
		})
	}
}

func TestCopyStatusOnly(t *testing.T) {
	t.Parallel()
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

func TestStatusStorage_Update_DryRunDoesNotPersist(t *testing.T) {
	t.Parallel()
	storage, backend := newTestStatusStorage()
	ctx := contextWithNamespace(testNS())

	agent := &arkv1alpha1.Agent{}
	agent.Name = testAgentName
	agent.Namespace = testNS()
	backend.objects["Agent/default/test-agent"] = agent

	updatedAgent := agent.DeepCopy()
	updatedAgent.Status.Conditions = append(updatedAgent.Status.Conditions, metav1.Condition{
		Type:   "Ready",
		Status: metav1.ConditionTrue,
	})

	updater := &simpleUpdatedObjectInfo{obj: updatedAgent}
	result, _, err := storage.Update(ctx, testAgentName, updater, nil, nil, false, &metav1.UpdateOptions{DryRun: []string{metav1.DryRunAll}})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if backend.updateStatusCalls != 0 {
		t.Errorf("expected UpdateStatus not to be called on dry-run, got %d calls", backend.updateStatusCalls)
	}
}

func TestCopyStatusOnly_ClearsFieldsTheUpdateOmits(t *testing.T) {
	t.Parallel()
	src := &arkv1alpha1.MCPServer{}
	src.Status.ToolCount = 0
	src.Status.Conditions = []metav1.Condition{{Type: "Available", Status: metav1.ConditionFalse, Reason: "ClientCreationFailed"}}

	dst := &arkv1alpha1.MCPServer{}
	dst.Name = "server"
	dst.Labels = map[string]string{"app": "test"}
	dst.Spec.Transport = "http"
	dst.Status.ToolCount = 2
	dst.Status.Conditions = []metav1.Condition{{Type: "Available", Status: metav1.ConditionTrue, Reason: "ToolsDiscovered"}}

	if err := copyStatusOnly(dst, src); err != nil {
		t.Fatalf("copyStatusOnly() error = %v", err)
	}

	if dst.Status.ToolCount != 0 {
		t.Errorf("toolCount = %d, want 0", dst.Status.ToolCount)
	}
	if len(dst.Status.Conditions) != 1 || dst.Status.Conditions[0].Reason != "ClientCreationFailed" {
		t.Errorf("conditions = %v, want the update's conditions", dst.Status.Conditions)
	}
	if dst.Name != "server" || dst.Labels["app"] != "test" || dst.Spec.Transport != "http" {
		t.Errorf("metadata or spec changed: %+v", dst.ObjectMeta)
	}
}

func TestCopyStatusOnly_KeepsStatusWhenTheUpdateHasNone(t *testing.T) {
	t.Parallel()
	dst := &arkv1alpha1.MCPServer{}
	dst.Status.ToolCount = 2

	if err := copyStatusOnly(dst, &metav1.Status{}); err != nil {
		t.Fatalf("copyStatusOnly() error = %v", err)
	}
	if dst.Status.ToolCount != 2 {
		t.Errorf("toolCount = %d, want 2", dst.Status.ToolCount)
	}
}
