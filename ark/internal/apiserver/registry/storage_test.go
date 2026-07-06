/* Copyright 2025. McKinsey & Company */

package registry

import (
	"context"
	"errors"
	"strconv"
	"testing"
	"time"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metainternalversion "k8s.io/apimachinery/pkg/apis/meta/internalversion"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/storage"
)

func TestNewGenericStorage(t *testing.T) {
	t.Parallel()
	gs, _ := newTestStorage()
	if gs == nil {
		t.Fatal("expected non-nil storage")
	}
}

func TestGenericStorage_New(t *testing.T) {
	t.Parallel()
	gs, _ := newTestStorage()
	obj := gs.New()
	if _, ok := obj.(*arkv1alpha1.Agent); !ok {
		t.Errorf("expected *Agent, got %T", obj)
	}
}

func TestGenericStorage_NewList(t *testing.T) {
	t.Parallel()
	gs, _ := newTestStorage()
	obj := gs.NewList()
	if _, ok := obj.(*arkv1alpha1.AgentList); !ok {
		t.Errorf("expected *AgentList, got %T", obj)
	}
}

func TestGenericStorage_NamespaceScoped(t *testing.T) {
	t.Parallel()
	gs, _ := newTestStorage()
	if !gs.NamespaceScoped() {
		t.Error("expected NamespaceScoped() to return true")
	}
}

func TestGenericStorage_GetSingularName(t *testing.T) {
	t.Parallel()
	gs, _ := newTestStorage()
	if got := gs.GetSingularName(); got != "agent" {
		t.Errorf("GetSingularName() = %q, want %q", got, "agent")
	}
}

func TestGenericStorage_Create(t *testing.T) {
	t.Parallel()
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
	t.Parallel()
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

func TestGenericStorage_Create_AlreadyExists(t *testing.T) {
	t.Parallel()
	gs, backend := newTestStorage()
	backend.err = storage.ErrAlreadyExists
	ctx := contextWithNamespace(testNS())

	agent := &arkv1alpha1.Agent{}
	agent.Name = testAgentName

	_, err := gs.Create(ctx, agent, nil, &metav1.CreateOptions{})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !apierrors.IsAlreadyExists(err) {
		t.Errorf("expected apierrors.IsAlreadyExists, got %T: %v", err, err)
	}
}

func TestGenericStorage_Create_GenerateName(t *testing.T) {
	t.Parallel()
	gs, _ := newTestStorage()
	ctx := contextWithNamespace(testNS())

	agent := &arkv1alpha1.Agent{}
	agent.GenerateName = "test-agent-"

	result, err := gs.Create(ctx, agent, nil, &metav1.CreateOptions{})
	if err != nil {
		t.Fatalf("Create() with generateName error = %v", err)
	}
	if result == nil {
		t.Fatal("expected non-nil result")
	}

	createdAgent, ok := result.(*arkv1alpha1.Agent)
	if !ok {
		t.Fatalf("expected *Agent, got %T", result)
	}

	if createdAgent.Name == "" {
		t.Error("expected name to be generated, got empty string")
	}

	if len(createdAgent.Name) != len("test-agent-")+5 {
		t.Errorf("expected generated name length %d, got %d", len("test-agent-")+5, len(createdAgent.Name))
	}

	if createdAgent.Name[:len("test-agent-")] != "test-agent-" {
		t.Errorf("expected name to start with 'test-agent-', got %s", createdAgent.Name)
	}
}

func TestGenericStorage_Create_GenerateNameIgnoredWhenNameSet(t *testing.T) {
	t.Parallel()
	gs, _ := newTestStorage()
	ctx := contextWithNamespace(testNS())

	agent := &arkv1alpha1.Agent{}
	agent.Name = testAgentName
	agent.GenerateName = "ignored-"

	result, err := gs.Create(ctx, agent, nil, &metav1.CreateOptions{})
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	createdAgent, ok := result.(*arkv1alpha1.Agent)
	if !ok {
		t.Fatalf("expected *Agent, got %T", result)
	}

	if createdAgent.Name != testAgentName {
		t.Errorf("expected name to remain '%s', got '%s'", testAgentName, createdAgent.Name)
	}
}

func TestGenericStorage_Create_GenerateNameUnique(t *testing.T) {
	t.Parallel()
	gs, _ := newTestStorage()
	ctx := contextWithNamespace(testNS())

	names := make(map[string]bool)
	for i := 0; i < 10; i++ {
		agent := &arkv1alpha1.Agent{}
		agent.GenerateName = "test-"

		result, err := gs.Create(ctx, agent, nil, &metav1.CreateOptions{})
		if err != nil {
			t.Fatalf("Create() iteration %d error = %v", i, err)
		}

		createdAgent, ok := result.(*arkv1alpha1.Agent)
		if !ok {
			t.Fatalf("expected *Agent, got %T", result)
		}

		if names[createdAgent.Name] {
			t.Errorf("duplicate name generated: %s", createdAgent.Name)
		}
		names[createdAgent.Name] = true
	}

	if len(names) != 10 {
		t.Errorf("expected 10 unique names, got %d", len(names))
	}
}

func TestGenericStorage_Get(t *testing.T) {
	t.Parallel()
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
	t.Parallel()
	gs, _ := newTestStorage()
	ctx := contextWithNamespace(testNS())

	_, err := gs.Get(ctx, "nonexistent", &metav1.GetOptions{})
	if err == nil {
		t.Error("expected error for nonexistent object")
	}
}

func TestGenericStorage_List(t *testing.T) {
	t.Parallel()
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
	t.Parallel()
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
	t.Parallel()
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
	t.Parallel()
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
	t.Parallel()
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

func TestGenericStorage_Update_ResourceVersionHandling(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name                       string
		existingResourceVersion    string
		updatedResourceVersion     string
		expectedResourceVersion    string
		expectedResourceVersionMsg string
	}{
		{
			name:                       "preserves resourceVersion when empty",
			existingResourceVersion:    "123",
			updatedResourceVersion:     "",
			expectedResourceVersion:    "123",
			expectedResourceVersionMsg: "expected resourceVersion to be preserved as '123', got '%s'",
		},
		{
			name:                       "does not overwrite explicit resourceVersion",
			existingResourceVersion:    "123",
			updatedResourceVersion:     "456",
			expectedResourceVersion:    "456",
			expectedResourceVersionMsg: "expected resourceVersion to be '456' from patch, got '%s'",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gs, backend := newTestStorage()
			ctx := contextWithNamespace(testNS())

			agent := &arkv1alpha1.Agent{}
			agent.Name = testAgentName
			agent.Namespace = testNS()
			agent.ResourceVersion = tt.existingResourceVersion
			backend.objects["Agent/default/test-agent"] = agent

			updatedAgent := &arkv1alpha1.Agent{}
			updatedAgent.Name = testAgentName
			updatedAgent.Namespace = testNS()
			updatedAgent.ResourceVersion = tt.updatedResourceVersion

			updater := &simpleUpdatedObjectInfo{obj: updatedAgent}
			_, created, err := gs.Update(ctx, testAgentName, updater, nil, nil, false, &metav1.UpdateOptions{})
			if err != nil {
				t.Fatalf("Update() error = %v", err)
			}
			if created {
				t.Error("expected created to be false")
			}

			storedObj := backend.objects["Agent/default/test-agent"]
			storedAgent, ok := storedObj.(*arkv1alpha1.Agent)
			if !ok {
				t.Fatalf("expected *Agent, got %T", storedObj)
			}

			if storedAgent.ResourceVersion != tt.expectedResourceVersion {
				t.Errorf(tt.expectedResourceVersionMsg, storedAgent.ResourceVersion)
			}
		})
	}
}

func TestGenericStorage_Delete(t *testing.T) {
	t.Parallel()
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
	t.Parallel()
	gs, _ := newTestStorage()
	ctx := contextWithNamespace(testNS())

	_, _, err := gs.Delete(ctx, "nonexistent", nil, &metav1.DeleteOptions{})
	if err == nil {
		t.Error("expected error for nonexistent object")
	}
}

func TestGenericStorage_Delete_WithValidation(t *testing.T) {
	t.Parallel()
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

func TestGenericStorage_Delete_WithFinalizers_SetsDeletionTimestamp(t *testing.T) {
	t.Parallel()
	gs, backend := newTestStorage()
	ctx := contextWithNamespace(testNS())

	agent := &arkv1alpha1.Agent{}
	agent.Name = testAgentName
	agent.Namespace = testNS()
	agent.Finalizers = []string{"ark.mckinsey.com/finalizer"}
	backend.objects["Agent/default/test-agent"] = agent

	result, deleted, err := gs.Delete(ctx, testAgentName, nil, &metav1.DeleteOptions{})
	if err != nil {
		t.Fatalf("Delete() error = %v", err)
	}
	if deleted {
		t.Error("expected deleted to be false while finalizers are present")
	}

	resultAgent, ok := result.(*arkv1alpha1.Agent)
	if !ok {
		t.Fatalf("expected *Agent, got %T", result)
	}
	if resultAgent.DeletionTimestamp == nil {
		t.Error("expected deletionTimestamp to be set on returned object")
	}

	stored, ok := backend.objects["Agent/default/test-agent"]
	if !ok {
		t.Fatal("expected object to remain in backend while finalizers are present")
	}
	storedAgent := stored.(*arkv1alpha1.Agent)
	if storedAgent.DeletionTimestamp == nil {
		t.Error("expected deletionTimestamp to be persisted in backend")
	}
}

func TestGenericStorage_Delete_WithFinalizers_DeletionTimestampNotReset(t *testing.T) {
	t.Parallel()
	gs, backend := newTestStorage()
	ctx := contextWithNamespace(testNS())

	original := metav1.NewTime(time.Now().Add(-time.Hour))
	agent := &arkv1alpha1.Agent{}
	agent.Name = testAgentName
	agent.Namespace = testNS()
	agent.Finalizers = []string{"ark.mckinsey.com/finalizer"}
	agent.DeletionTimestamp = &original
	backend.objects["Agent/default/test-agent"] = agent

	result, deleted, err := gs.Delete(ctx, testAgentName, nil, &metav1.DeleteOptions{})
	if err != nil {
		t.Fatalf("Delete() error = %v", err)
	}
	if deleted {
		t.Error("expected deleted to be false while finalizers are present")
	}

	resultAgent := result.(*arkv1alpha1.Agent)
	if !resultAgent.DeletionTimestamp.Equal(&original) {
		t.Errorf("expected existing deletionTimestamp to be preserved, got %v", resultAgent.DeletionTimestamp)
	}
}

func TestGenericStorage_Update_RemovingLastFinalizer_TriggersDelete(t *testing.T) {
	t.Parallel()
	gs, backend := newTestStorage()
	ctx := contextWithNamespace(testNS())

	now := metav1.NewTime(time.Now())
	agent := &arkv1alpha1.Agent{}
	agent.Name = testAgentName
	agent.Namespace = testNS()
	agent.Finalizers = []string{"ark.mckinsey.com/finalizer"}
	agent.DeletionTimestamp = &now
	backend.objects["Agent/default/test-agent"] = agent

	updated := &arkv1alpha1.Agent{}
	updated.Name = testAgentName
	updated.Namespace = testNS()
	updated.DeletionTimestamp = &now
	updated.Finalizers = nil

	updater := &simpleUpdatedObjectInfo{obj: updated}
	_, created, err := gs.Update(ctx, testAgentName, updater, nil, nil, false, &metav1.UpdateOptions{})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if created {
		t.Error("expected created to be false")
	}
	if _, ok := backend.objects["Agent/default/test-agent"]; ok {
		t.Error("expected object to be deleted after last finalizer removed")
	}
}

func TestGenericStorage_Update_FinalizersRemaining_DoesNotDelete(t *testing.T) {
	t.Parallel()
	gs, backend := newTestStorage()
	ctx := contextWithNamespace(testNS())

	now := metav1.NewTime(time.Now())
	agent := &arkv1alpha1.Agent{}
	agent.Name = testAgentName
	agent.Namespace = testNS()
	agent.Finalizers = []string{"a", "b"}
	agent.DeletionTimestamp = &now
	backend.objects["Agent/default/test-agent"] = agent

	updated := &arkv1alpha1.Agent{}
	updated.Name = testAgentName
	updated.Namespace = testNS()
	updated.DeletionTimestamp = &now
	updated.Finalizers = []string{"b"}

	updater := &simpleUpdatedObjectInfo{obj: updated}
	_, _, err := gs.Update(ctx, testAgentName, updater, nil, nil, false, &metav1.UpdateOptions{})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if _, ok := backend.objects["Agent/default/test-agent"]; !ok {
		t.Error("expected object to remain while a finalizer is still present")
	}
}

func TestGenericStorage_Watch(t *testing.T) {
	t.Parallel()
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
	t.Parallel()
	gs, _ := newTestStorage()
	ctx := context.Background()

	agent := &arkv1alpha1.Agent{}
	agent.Name = testAgentName
	agent.CreationTimestamp = metav1.Now()

	table, err := gs.ConvertToTable(ctx, agent, nil)
	if err != nil {
		t.Fatalf("ConvertToTable() error = %v", err)
	}

	if len(table.ColumnDefinitions) < 1 {
		t.Errorf("expected at least 1 column, got %d", len(table.ColumnDefinitions))
	}
	if table.ColumnDefinitions[0].Name != "Name" {
		t.Errorf("expected first column to be 'Name', got %q", table.ColumnDefinitions[0].Name)
	}
	if len(table.Rows) != 1 {
		t.Errorf("expected 1 row, got %d", len(table.Rows))
	}
}

func TestGenericStorage_ConvertToTable_List(t *testing.T) {
	t.Parallel()
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
	t.Parallel()
	gs, _ := newTestStorage()
	gs.Destroy()
}

func TestGetNamespace(t *testing.T) {
	t.Parallel()
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
	t.Parallel()
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

func TestSetListItems_ResourceVersionIsNumericMax(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name     string
		rvs      []string
		expected string
	}{
		{
			name:     "digit-count boundary 9 vs 10",
			rvs:      []string{"9", "10"},
			expected: "10",
		},
		{
			name:     "digit-count boundary 9 vs 100",
			rvs:      []string{"9", "100"},
			expected: "100",
		},
		{
			name:     "mixed order",
			rvs:      []string{"3", "20", "100", "5"},
			expected: "100",
		},
		{
			name:     "empty and invalid rvs are skipped",
			rvs:      []string{"", "not-a-number", "42"},
			expected: "42",
		},
		{
			name:     "no valid rvs leaves list rv unset",
			rvs:      []string{"", "abc"},
			expected: "",
		},
		{
			name:     "empty list leaves rv unset",
			rvs:      nil,
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			list := &arkv1alpha1.AgentList{}
			objects := make([]runtime.Object, 0, len(tt.rvs))
			for i, rv := range tt.rvs {
				objects = append(objects, &arkv1alpha1.Agent{
					ObjectMeta: metav1.ObjectMeta{Name: "a" + strconv.Itoa(i), ResourceVersion: rv},
				})
			}

			if err := setListItems(list, objects, ""); err != nil {
				t.Fatalf("setListItems() error = %v", err)
			}

			if got := list.ResourceVersion; got != tt.expected {
				t.Errorf("list resourceVersion = %q, want %q", got, tt.expected)
			}
		})
	}
}
