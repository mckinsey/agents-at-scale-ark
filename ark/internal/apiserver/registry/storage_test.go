/* Copyright 2025. McKinsey & Company */

package registry

import (
	"context"
	"errors"
	"strconv"
	"testing"
	"time"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metainternalversion "k8s.io/apimachinery/pkg/apis/meta/internalversion"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/fields"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"

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

func TestGenericStorage_List_FieldSelectorReturnsBadRequest(t *testing.T) {
	t.Parallel()
	gs, _ := newTestStorage()
	ctx := contextWithNamespace(testNS())

	fs, err := fields.ParseSelector("status.phase=Running")
	if err != nil {
		t.Fatalf("ParseSelector() error = %v", err)
	}
	_, err = gs.List(ctx, &metainternalversion.ListOptions{FieldSelector: fs})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !apierrors.IsBadRequest(err) {
		t.Errorf("expected BadRequest, got %T: %v", err, err)
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

// conflictingUpdateBackend rejects the first n Updates with a conflict, standing in for a
// controller that reconciled the object between our read and our deletionTimestamp write.
type conflictingUpdateBackend struct {
	*mockBackend
	failures int
	updates  int
}

func (b *conflictingUpdateBackend) Update(ctx context.Context, kind, namespace, name string, obj runtime.Object) error {
	b.updates++
	if b.updates <= b.failures {
		return storage.ErrConflict
	}
	return b.mockBackend.Update(ctx, kind, namespace, name, obj)
}

func newConflictingStorage(failures int) (*GenericStorage, *conflictingUpdateBackend) {
	backend := &conflictingUpdateBackend{mockBackend: newMockBackend(), failures: failures}
	config := ResourceConfig{
		Kind:         "Agent",
		Resource:     "agents",
		SingularName: "agent",
		NewFunc:      func() runtime.Object { return &arkv1alpha1.Agent{} },
		NewListFunc:  func() runtime.Object { return &arkv1alpha1.AgentList{} },
	}
	agent := &arkv1alpha1.Agent{}
	agent.Name = testAgentName
	agent.Namespace = testNS()
	agent.Finalizers = []string{"ark.mckinsey.com/finalizer"}
	backend.objects["Agent/default/test-agent"] = agent
	return NewGenericStorage(backend, &mockConverter{}, config, nil), backend
}

// Admission now runs between the read and the deletionTimestamp write, so the window a
// concurrent reconcile can land in is much wider than when the callback was a no-op. Delete has
// no server-side conflict retry, so without this an actively reconciled resource surfaces a 409
// the caller never used to see.
func TestGenericStorage_Delete_RetriesDeletionTimestampOnConflict(t *testing.T) {
	t.Parallel()
	gs, backend := newConflictingStorage(1)
	ctx := contextWithNamespace(testNS())

	admissions := 0
	validate := func(context.Context, runtime.Object) error {
		admissions++
		return nil
	}

	result, deleted, err := gs.Delete(ctx, testAgentName, validate, &metav1.DeleteOptions{})
	if err != nil {
		t.Fatalf("Delete() should have retried past the conflict, got %v", err)
	}
	if deleted {
		t.Error("expected deleted to be false while finalizers are present")
	}
	if backend.updates != 2 {
		t.Errorf("backend updates = %d, want 2 (one conflict, one success)", backend.updates)
	}
	// The object changed under us, so policy must evaluate the version actually being marked.
	if admissions != 2 {
		t.Errorf("admission ran %d times, want 2 (re-run against the refreshed object)", admissions)
	}
	if resultAgent, ok := result.(*arkv1alpha1.Agent); !ok || resultAgent.DeletionTimestamp == nil {
		t.Error("expected deletionTimestamp to be set on the returned object")
	}
	stored := backend.objects["Agent/default/test-agent"].(*arkv1alpha1.Agent)
	if stored.DeletionTimestamp == nil {
		t.Error("expected deletionTimestamp to be persisted after the retry")
	}
}

func TestGenericStorage_Delete_GivesUpAfterRepeatedConflicts(t *testing.T) {
	t.Parallel()
	gs, backend := newConflictingStorage(maxDeleteConflictAttempts + 1)
	ctx := contextWithNamespace(testNS())

	_, _, err := gs.Delete(ctx, testAgentName, nil, &metav1.DeleteOptions{})
	if !apierrors.IsConflict(err) {
		t.Fatalf("expected a Conflict once retries are exhausted, got %v", err)
	}
	if backend.updates != maxDeleteConflictAttempts {
		t.Errorf("backend updates = %d, want %d", backend.updates, maxDeleteConflictAttempts)
	}
}

// A caller that supplied preconditions asked to be told about the conflict rather than have it
// resolved, so that path must not retry.
func TestGenericStorage_Delete_PreconditionsSuppressConflictRetry(t *testing.T) {
	t.Parallel()
	gs, backend := newConflictingStorage(maxDeleteConflictAttempts + 1)
	ctx := contextWithNamespace(testNS())

	stored := backend.objects["Agent/default/test-agent"].(*arkv1alpha1.Agent)
	uid := stored.UID
	_, _, err := gs.Delete(ctx, testAgentName, nil, &metav1.DeleteOptions{
		Preconditions: &metav1.Preconditions{UID: &uid},
	})
	if !apierrors.IsConflict(err) {
		t.Fatalf("expected a Conflict, got %v", err)
	}
	if backend.updates != 1 {
		t.Errorf("backend updates = %d, want 1 (no retry when preconditions are set)", backend.updates)
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

func TestGenericStorage_Delete_PreconditionUIDMismatch(t *testing.T) {
	t.Parallel()
	gs, backend := newTestStorage()
	ctx := contextWithNamespace(testNS())

	agent := &arkv1alpha1.Agent{}
	agent.Name = testAgentName
	agent.Namespace = testNS()
	agent.UID = types.UID("actual-uid")
	backend.objects["Agent/default/test-agent"] = agent

	staleUID := types.UID("stale-uid")
	_, _, err := gs.Delete(ctx, testAgentName, nil, &metav1.DeleteOptions{
		Preconditions: &metav1.Preconditions{UID: &staleUID},
	})
	if !apierrors.IsConflict(err) {
		t.Errorf("expected conflict error, got %T: %v", err, err)
	}
	if _, ok := backend.objects["Agent/default/test-agent"]; !ok {
		t.Error("expected object to remain when UID precondition fails")
	}
}

func TestGenericStorage_Delete_PreconditionResourceVersionMismatch(t *testing.T) {
	t.Parallel()
	gs, backend := newTestStorage()
	ctx := contextWithNamespace(testNS())

	agent := &arkv1alpha1.Agent{}
	agent.Name = testAgentName
	agent.Namespace = testNS()
	agent.ResourceVersion = "5"
	backend.objects["Agent/default/test-agent"] = agent

	staleRV := "3"
	_, _, err := gs.Delete(ctx, testAgentName, nil, &metav1.DeleteOptions{
		Preconditions: &metav1.Preconditions{ResourceVersion: &staleRV},
	})
	if !apierrors.IsConflict(err) {
		t.Errorf("expected conflict error, got %T: %v", err, err)
	}
	if _, ok := backend.objects["Agent/default/test-agent"]; !ok {
		t.Error("expected object to remain when resourceVersion precondition fails")
	}
}

func TestGenericStorage_Delete_PreconditionsMatch(t *testing.T) {
	t.Parallel()
	gs, backend := newTestStorage()
	ctx := contextWithNamespace(testNS())

	agent := &arkv1alpha1.Agent{}
	agent.Name = testAgentName
	agent.Namespace = testNS()
	agent.UID = types.UID("actual-uid")
	agent.ResourceVersion = "5"
	backend.objects["Agent/default/test-agent"] = agent

	uid := types.UID("actual-uid")
	rv := "5"
	_, deleted, err := gs.Delete(ctx, testAgentName, nil, &metav1.DeleteOptions{
		Preconditions: &metav1.Preconditions{UID: &uid, ResourceVersion: &rv},
	})
	if err != nil {
		t.Fatalf("Delete() error = %v", err)
	}
	if !deleted {
		t.Error("expected deleted to be true when preconditions match")
	}
	if _, ok := backend.objects["Agent/default/test-agent"]; ok {
		t.Error("expected object to be removed when preconditions match")
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

func TestGenericStorage_Watch_FieldSelectorReturnsBadRequest(t *testing.T) {
	t.Parallel()
	gs, _ := newTestStorage()
	ctx := contextWithNamespace(testNS())

	fs, err := fields.ParseSelector("status.phase=Running")
	if err != nil {
		t.Fatalf("ParseSelector() error = %v", err)
	}
	_, err = gs.Watch(ctx, &metainternalversion.ListOptions{FieldSelector: fs})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !apierrors.IsBadRequest(err) {
		t.Errorf("expected BadRequest, got %T: %v", err, err)
	}
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

func TestGenericStorage_ConvertToTable_ListWithoutContinueToken(t *testing.T) {
	t.Parallel()
	gs, _ := newTestStorage()
	ctx := context.Background()

	// A list without a continue token must yield an empty token (not a panic
	// or stale value), so single-page results are not mislabeled as truncated.
	list := &arkv1alpha1.AgentList{
		Items: []arkv1alpha1.Agent{
			{ObjectMeta: metav1.ObjectMeta{Name: "agent-1", CreationTimestamp: metav1.Now()}},
		},
	}

	table, err := gs.ConvertToTable(ctx, list, nil)
	if err != nil {
		t.Fatalf("ConvertToTable() error = %v", err)
	}

	if table.Continue != "" {
		t.Errorf("expected empty continue for un-paginated list, got %q", table.Continue)
	}
	if table.RemainingItemCount != nil {
		t.Errorf("expected nil remainingItemCount, got %v", *table.RemainingItemCount)
	}
}

func TestGenericStorage_ConvertToTable_PropagatesListMeta(t *testing.T) {
	t.Parallel()
	gs, _ := newTestStorage()
	ctx := context.Background()

	remaining := int64(42)
	list := &arkv1alpha1.AgentList{
		ListMeta: metav1.ListMeta{
			ResourceVersion:    "123",
			Continue:           "next-token",
			RemainingItemCount: &remaining,
		},
		Items: []arkv1alpha1.Agent{
			{ObjectMeta: metav1.ObjectMeta{Name: "agent-1", CreationTimestamp: metav1.Now()}},
		},
	}

	table, err := gs.ConvertToTable(ctx, list, nil)
	if err != nil {
		t.Fatalf("ConvertToTable() error = %v", err)
	}

	if table.Continue != "next-token" {
		t.Errorf("expected continue 'next-token', got %q", table.Continue)
	}
	if table.ResourceVersion != "123" {
		t.Errorf("expected resourceVersion '123', got %q", table.ResourceVersion)
	}
	if table.RemainingItemCount == nil || *table.RemainingItemCount != remaining {
		t.Errorf("expected remainingItemCount %d, got %v", remaining, table.RemainingItemCount)
	}
}

func TestGenericStorage_ConvertToTable_SinglePropagatesResourceVersion(t *testing.T) {
	t.Parallel()
	gs, _ := newTestStorage()
	ctx := context.Background()

	agent := &arkv1alpha1.Agent{}
	agent.Name = testAgentName
	agent.ResourceVersion = "777"
	agent.CreationTimestamp = metav1.Now()

	table, err := gs.ConvertToTable(ctx, agent, nil)
	if err != nil {
		t.Fatalf("ConvertToTable() error = %v", err)
	}

	if table.ResourceVersion != "777" {
		t.Errorf("expected resourceVersion '777', got %q", table.ResourceVersion)
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

// vanishingUpdateBackend conflicts on the first Update and removes the object at the same moment,
// standing in for a racing caller that won and completed the delete outright.
type vanishingUpdateBackend struct {
	*mockBackend
	updates int
}

func (b *vanishingUpdateBackend) Update(ctx context.Context, kind, namespace, name string, obj runtime.Object) error {
	b.updates++
	if b.updates == 1 {
		delete(b.objects, b.key(kind, namespace, name))
		return storage.ErrConflict
	}
	return b.mockBackend.Update(ctx, kind, namespace, name, obj)
}

// Losing the race to a caller that finished the delete is NotFound, not Conflict: the resource is
// gone, which is what the client asked for, and retrying has nothing left to mark.
func TestGenericStorage_Delete_RefreshAfterConflictReportsNotFound(t *testing.T) {
	t.Parallel()

	backend := &vanishingUpdateBackend{mockBackend: newMockBackend()}
	agent := &arkv1alpha1.Agent{}
	agent.Name = testAgentName
	agent.Namespace = testNS()
	agent.Finalizers = []string{"ark.mckinsey.com/finalizer"}
	backend.objects["Agent/default/test-agent"] = agent

	config := ResourceConfig{
		Kind: "Agent", Resource: "agents", SingularName: "agent",
		NewFunc:     func() runtime.Object { return &arkv1alpha1.Agent{} },
		NewListFunc: func() runtime.Object { return &arkv1alpha1.AgentList{} },
	}
	gs := NewGenericStorage(backend, &mockConverter{}, config, nil)

	_, _, err := gs.Delete(contextWithNamespace(testNS()), testAgentName, nil, &metav1.DeleteOptions{})
	if !apierrors.IsNotFound(err) {
		t.Fatalf("expected NotFound after the race winner completed the delete, got %v", err)
	}
	if backend.updates != 1 {
		t.Errorf("backend updates = %d, want 1 (no second attempt once the object is gone)", backend.updates)
	}
}

// Admission is re-run against the refreshed object, so a policy that rejects the version we ended
// up marking must block the delete rather than be overridden by the earlier pass.
func TestGenericStorage_Delete_RefreshRejectedByAdmission(t *testing.T) {
	t.Parallel()
	gs, backend := newConflictingStorage(1)
	ctx := contextWithNamespace(testNS())

	denied := errors.New("denied by policy on the refreshed object")
	admissions := 0
	validate := func(context.Context, runtime.Object) error {
		admissions++
		if admissions == 1 {
			return nil
		}
		return denied
	}

	_, _, err := gs.Delete(ctx, testAgentName, validate, &metav1.DeleteOptions{})
	if !errors.Is(err, denied) {
		t.Fatalf("expected the rejection on the refreshed object to surface, got %v", err)
	}
	if backend.updates != 1 {
		t.Errorf("backend updates = %d, want 1 (the retry must not write after admission refused)", backend.updates)
	}
	stored := backend.objects["Agent/default/test-agent"].(*arkv1alpha1.Agent)
	if stored.DeletionTimestamp != nil {
		t.Error("expected no deletionTimestamp persisted after admission refused the refreshed object")
	}
}

// collidingCreateBackend reports a name collision for the first n Creates. mockBackend's own
// "already exists" is an opaque error, and only storage.ErrAlreadyExists is retryable.
type collidingCreateBackend struct {
	*mockBackend
	collisions int
	creates    int
	fatalErr   error
}

func (b *collidingCreateBackend) Create(ctx context.Context, kind, namespace, name string, obj runtime.Object) error {
	b.creates++
	if b.fatalErr != nil {
		return b.fatalErr
	}
	if b.creates <= b.collisions {
		return storage.ErrAlreadyExists
	}
	return b.mockBackend.Create(ctx, kind, namespace, name, obj)
}

func newCollidingStorage(backend storage.Backend) *GenericStorage {
	config := ResourceConfig{
		Kind: "Agent", Resource: "agents", SingularName: "agent",
		NewFunc:     func() runtime.Object { return &arkv1alpha1.Agent{} },
		NewListFunc: func() runtime.Object { return &arkv1alpha1.AgentList{} },
	}
	return NewGenericStorage(backend, &mockConverter{}, config, nil)
}

func generateNameAgent() *arkv1alpha1.Agent {
	agent := &arkv1alpha1.Agent{}
	agent.GenerateName = "probe-"
	return agent
}

// Only a collision is retryable. Any other backend failure must surface, or a broken backend
// would be retried 100 times and then reported as a timeout.
func TestGenericStorage_Create_GenerateNameSurfacesNonCollisionError(t *testing.T) {
	t.Parallel()

	fatal := errors.New("connection refused")
	backend := &collidingCreateBackend{mockBackend: newMockBackend(), fatalErr: fatal}
	gs := newCollidingStorage(backend)

	_, err := gs.Create(contextWithNamespace(testNS()), generateNameAgent(), nil, &metav1.CreateOptions{})
	if !errors.Is(err, fatal) {
		t.Fatalf("expected the backend error to surface, got %v", err)
	}
	if backend.creates != 1 {
		t.Errorf("backend creates = %d, want 1 (a non-collision error must not be retried)", backend.creates)
	}
}

// Exhausting the attempts is a ServerTimeout, which tells the client to retry, rather than a
// generic error or a silently unnamed object.
func TestGenericStorage_Create_GenerateNameExhausted(t *testing.T) {
	t.Parallel()

	backend := &collidingCreateBackend{mockBackend: newMockBackend(), collisions: maxGenerateNameAttempts + 1}
	gs := newCollidingStorage(backend)

	_, err := gs.Create(contextWithNamespace(testNS()), generateNameAgent(), nil, &metav1.CreateOptions{})
	if !apierrors.IsServerTimeout(err) {
		t.Fatalf("expected a ServerTimeout once name generation is exhausted, got %v", err)
	}
	if backend.creates != maxGenerateNameAttempts {
		t.Errorf("backend creates = %d, want %d", backend.creates, maxGenerateNameAttempts)
	}
}

// Each attempt picks a fresh name and re-runs admission for it, because policy may key on the
// name; admission judging only the first candidate would let a later name through unchecked.
func TestGenericStorage_Create_GenerateNameReRunsAdmissionPerCandidate(t *testing.T) {
	t.Parallel()

	backend := &collidingCreateBackend{mockBackend: newMockBackend(), collisions: 2}
	gs := newCollidingStorage(backend)

	var seen []string
	validate := func(_ context.Context, obj runtime.Object) error {
		a, err := meta.Accessor(obj)
		if err != nil {
			return err
		}
		seen = append(seen, a.GetName())
		return nil
	}

	if _, err := gs.Create(contextWithNamespace(testNS()), generateNameAgent(), validate, &metav1.CreateOptions{}); err != nil {
		t.Fatalf("Create() should have retried past the collisions, got %v", err)
	}
	if len(seen) != 3 {
		t.Fatalf("admission ran %d times, want 3 (once per candidate name)", len(seen))
	}
	for i, name := range seen {
		if name == "" {
			t.Errorf("admission saw an empty name on attempt %d; a naming-convention policy could never reject", i+1)
		}
		if i > 0 && name == seen[i-1] {
			t.Errorf("attempt %d reused name %q; a collision must be retried with a fresh name", i+1, name)
		}
	}
}

// A rejection must stop name generation outright; retrying with a new name would let a caller
// brute-force past a policy keyed on the name.
func TestGenericStorage_Create_GenerateNameStopsWhenAdmissionRejects(t *testing.T) {
	t.Parallel()

	backend := &collidingCreateBackend{mockBackend: newMockBackend()}
	gs := newCollidingStorage(backend)

	denied := errors.New("denied by policy")
	admissions := 0
	validate := func(context.Context, runtime.Object) error {
		admissions++
		return denied
	}

	_, err := gs.Create(contextWithNamespace(testNS()), generateNameAgent(), validate, &metav1.CreateOptions{})
	if !errors.Is(err, denied) {
		t.Fatalf("expected the policy rejection to surface, got %v", err)
	}
	if admissions != 1 {
		t.Errorf("admission ran %d times, want 1 (a rejection must not be retried with a fresh name)", admissions)
	}
	if backend.creates != 0 {
		t.Errorf("backend creates = %d, want 0 (nothing may be persisted after a rejection)", backend.creates)
	}
}
