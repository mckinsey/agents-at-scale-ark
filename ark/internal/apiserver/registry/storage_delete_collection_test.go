/* Copyright 2025. McKinsey & Company */

package registry

import (
	"context"
	"errors"
	"sort"
	"testing"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metainternalversion "k8s.io/apimachinery/pkg/apis/meta/internalversion"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

const testServerLabel = "ark.mckinsey.com/mcp-server"

func putAgent(backend *mockBackend, namespace, name string, lbls map[string]string, finalizers ...string) {
	agent := &arkv1alpha1.Agent{}
	agent.Name = name
	agent.Namespace = namespace
	agent.Labels = lbls
	agent.Finalizers = finalizers
	backend.objects["Agent/"+namespace+"/"+name] = agent
}

func serverSelector(t *testing.T, server string) *metainternalversion.ListOptions {
	t.Helper()
	selector, err := labels.Parse(testServerLabel + "=" + server)
	if err != nil {
		t.Fatalf("labels.Parse() error = %v", err)
	}
	return &metainternalversion.ListOptions{LabelSelector: selector}
}

func storedKeys(backend *mockBackend) []string {
	keys := make([]string, 0, len(backend.objects))
	for key := range backend.objects {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func listedNames(t *testing.T, obj runtime.Object) []string {
	t.Helper()
	items, err := meta.ExtractList(obj)
	if err != nil {
		t.Fatalf("ExtractList() error = %v", err)
	}
	names := make([]string, 0, len(items))
	for _, item := range items {
		accessor, err := meta.Accessor(item)
		if err != nil {
			t.Fatalf("Accessor() error = %v", err)
		}
		names = append(names, accessor.GetName())
	}
	sort.Strings(names)
	return names
}

func assertStrings(t *testing.T, what string, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("%s = %v, want %v", what, got, want)
	}
	for i := range got {
		if got[i] != want[i] {
			t.Fatalf("%s = %v, want %v", what, got, want)
		}
	}
}

func TestGenericStorage_DeleteCollection_DeletesOnlyTheSelectionInTheNamespace(t *testing.T) {
	t.Parallel()
	gs, backend := newTestStorage()
	putAgent(backend, "default", "a-tool", map[string]string{testServerLabel: "a"})
	putAgent(backend, "default", "a-tool-2", map[string]string{testServerLabel: "a"})
	putAgent(backend, "default", "b-tool", map[string]string{testServerLabel: "b"})
	putAgent(backend, "default", "unlabelled", nil)
	putAgent(backend, "other", "a-tool", map[string]string{testServerLabel: "a"})

	result, err := gs.DeleteCollection(contextWithNamespace("default"), nil, &metav1.DeleteOptions{}, serverSelector(t, "a"))
	if err != nil {
		t.Fatalf("DeleteCollection() error = %v", err)
	}

	if _, ok := result.(*arkv1alpha1.AgentList); !ok {
		t.Fatalf("expected *AgentList, got %T", result)
	}
	assertStrings(t, "returned items", listedNames(t, result), []string{"a-tool", "a-tool-2"})
	assertStrings(t, "stored objects", storedKeys(backend), []string{
		"Agent/default/b-tool",
		"Agent/default/unlabelled",
		"Agent/other/a-tool",
	})
}

func TestGenericStorage_DeleteCollection_EmptySelectionSucceeds(t *testing.T) {
	t.Parallel()
	gs, backend := newTestStorage()
	putAgent(backend, "default", "b-tool", map[string]string{testServerLabel: "b"})

	result, err := gs.DeleteCollection(contextWithNamespace("default"), nil, nil, serverSelector(t, "none"))
	if err != nil {
		t.Fatalf("DeleteCollection() error = %v", err)
	}
	assertStrings(t, "returned items", listedNames(t, result), []string{})
	assertStrings(t, "stored objects", storedKeys(backend), []string{"Agent/default/b-tool"})
}

func TestGenericStorage_DeleteCollection_NilListOptionsDeletesTheNamespace(t *testing.T) {
	t.Parallel()
	gs, backend := newTestStorage()
	putAgent(backend, "default", "one", nil)
	putAgent(backend, "default", "two", nil)
	putAgent(backend, "other", "three", nil)

	if _, err := gs.DeleteCollection(contextWithNamespace("default"), nil, nil, nil); err != nil {
		t.Fatalf("DeleteCollection() error = %v", err)
	}
	assertStrings(t, "stored objects", storedKeys(backend), []string{"Agent/other/three"})
}

func TestGenericStorage_DeleteCollection_FollowsContinueTokens(t *testing.T) {
	t.Parallel()
	gs, backend := newTestStorage()
	backend.maxPage = 2
	for _, name := range []string{"t1", "t2", "t3", "t4", "t5"} {
		putAgent(backend, "default", name, map[string]string{testServerLabel: "a"})
	}
	putAgent(backend, "default", "keep", map[string]string{testServerLabel: "b"})

	result, err := gs.DeleteCollection(contextWithNamespace("default"), nil, nil, serverSelector(t, "a"))
	if err != nil {
		t.Fatalf("DeleteCollection() error = %v", err)
	}
	assertStrings(t, "returned items", listedNames(t, result), []string{"t1", "t2", "t3", "t4", "t5"})
	assertStrings(t, "stored objects", storedKeys(backend), []string{"Agent/default/keep"})
	listMeta, err := meta.ListAccessor(result)
	if err != nil {
		t.Fatalf("ListAccessor() error = %v", err)
	}
	if listMeta.GetContinue() != "" {
		t.Errorf("continue = %q, want empty after the last page", listMeta.GetContinue())
	}
}

func TestGenericStorage_DeleteCollection_CallerLimitStopsAfterOnePage(t *testing.T) {
	t.Parallel()
	gs, backend := newTestStorage()
	for _, name := range []string{"t1", "t2", "t3"} {
		putAgent(backend, "default", name, nil)
	}

	result, err := gs.DeleteCollection(contextWithNamespace("default"), nil, nil, &metainternalversion.ListOptions{Limit: 2})
	if err != nil {
		t.Fatalf("DeleteCollection() error = %v", err)
	}
	assertStrings(t, "returned items", listedNames(t, result), []string{"t1", "t2"})
	assertStrings(t, "stored objects", storedKeys(backend), []string{"Agent/default/t3"})
	listMeta, err := meta.ListAccessor(result)
	if err != nil {
		t.Fatalf("ListAccessor() error = %v", err)
	}
	if listMeta.GetContinue() == "" {
		t.Error("expected a continue token for the remaining items")
	}
}

func TestGenericStorage_DeleteCollection_DoesNotMutateCallerListOptions(t *testing.T) {
	t.Parallel()
	gs, backend := newTestStorage()
	backend.maxPage = 1
	putAgent(backend, "default", "t1", nil)
	putAgent(backend, "default", "t2", nil)

	opts := &metainternalversion.ListOptions{ResourceVersion: "0"}
	if _, err := gs.DeleteCollection(contextWithNamespace("default"), nil, nil, opts); err != nil {
		t.Fatalf("DeleteCollection() error = %v", err)
	}
	if opts.Limit != 0 || opts.Continue != "" || opts.ResourceVersion != "0" {
		t.Errorf("caller list options changed: %+v", opts)
	}
}

func TestGenericStorage_DeleteCollection_RunsAdmissionPerItem(t *testing.T) {
	t.Parallel()
	gs, backend := newTestStorage()
	putAgent(backend, "default", "allowed", map[string]string{testServerLabel: "a"})
	putAgent(backend, "default", "protected", map[string]string{testServerLabel: "a"})

	denied := apierrors.NewForbidden(arkv1alpha1.GroupVersion.WithResource("agents").GroupResource(), "protected", errors.New("policy"))
	var seen []string
	validator := func(_ context.Context, obj runtime.Object) error {
		accessor, _ := meta.Accessor(obj)
		seen = append(seen, accessor.GetName())
		if accessor.GetName() == "protected" {
			return denied
		}
		return nil
	}

	_, err := gs.DeleteCollection(contextWithNamespace("default"), validator, nil, serverSelector(t, "a"))
	if !apierrors.IsForbidden(err) {
		t.Fatalf("expected Forbidden, got %v", err)
	}
	assertStrings(t, "admitted items", seen, []string{"allowed", "protected"})
	assertStrings(t, "stored objects", storedKeys(backend), []string{"Agent/default/protected"})
}

func TestGenericStorage_DeleteCollection_MarksItemsWithFinalizers(t *testing.T) {
	t.Parallel()
	gs, backend := newTestStorage()
	putAgent(backend, "default", "plain", map[string]string{testServerLabel: "a"})
	putAgent(backend, "default", "guarded", map[string]string{testServerLabel: "a"}, "ark.mckinsey.com/cleanup")

	if _, err := gs.DeleteCollection(contextWithNamespace("default"), nil, nil, serverSelector(t, "a")); err != nil {
		t.Fatalf("DeleteCollection() error = %v", err)
	}
	assertStrings(t, "stored objects", storedKeys(backend), []string{"Agent/default/guarded"})
	accessor, err := meta.Accessor(backend.objects["Agent/default/guarded"])
	if err != nil {
		t.Fatalf("Accessor() error = %v", err)
	}
	if accessor.GetDeletionTimestamp() == nil {
		t.Error("expected deletionTimestamp on the item with finalizers")
	}
}

func TestGenericStorage_DeleteCollection_StopsOnStorageError(t *testing.T) {
	t.Parallel()
	gs, backend := newTestStorage()
	putAgent(backend, "default", "t1", nil)
	putAgent(backend, "default", "t2", nil)
	putAgent(backend, "default", "t3", nil)
	backend.deleteErr = map[string]error{"Agent/default/t2": errors.New("connection reset")}

	if _, err := gs.DeleteCollection(contextWithNamespace("default"), nil, nil, nil); err == nil {
		t.Fatal("expected the storage error to surface")
	}
	assertStrings(t, "stored objects", storedKeys(backend), []string{"Agent/default/t2", "Agent/default/t3"})
}

func TestGenericStorage_DeleteCollection_ListErrorSurfaces(t *testing.T) {
	t.Parallel()
	gs, backend := newTestStorage()
	backend.err = errors.New("database down")

	if _, err := gs.DeleteCollection(contextWithNamespace("default"), nil, nil, nil); err == nil {
		t.Fatal("expected the list error to surface")
	}
}

func TestGenericStorage_DeleteCollection_CancelledContext(t *testing.T) {
	t.Parallel()
	gs, backend := newTestStorage()
	putAgent(backend, "default", "t1", nil)

	ctx, cancel := context.WithCancel(contextWithNamespace("default"))
	cancel()
	if _, err := gs.DeleteCollection(ctx, nil, nil, nil); !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled, got %v", err)
	}
	assertStrings(t, "stored objects", storedKeys(backend), []string{"Agent/default/t1"})
}

func TestGenericStorage_DeleteCollection_RejectsDryRun(t *testing.T) {
	t.Parallel()
	gs, backend := newTestStorage()
	putAgent(backend, "default", "t1", nil)

	_, err := gs.DeleteCollection(contextWithNamespace("default"), nil, &metav1.DeleteOptions{DryRun: []string{metav1.DryRunAll}}, nil)
	if !apierrors.IsBadRequest(err) {
		t.Fatalf("expected BadRequest, got %v", err)
	}
	assertStrings(t, "stored objects", storedKeys(backend), []string{"Agent/default/t1"})
}

func TestGenericStorage_DeleteCollection_StopsWithinAPageWhenCancelled(t *testing.T) {
	t.Parallel()
	gs, backend := newTestStorage()
	putAgent(backend, "default", "t1", nil)
	putAgent(backend, "default", "t2", nil)
	putAgent(backend, "default", "t3", nil)

	ctx, cancel := context.WithCancel(contextWithNamespace("default"))
	defer cancel()
	validator := func(context.Context, runtime.Object) error {
		cancel()
		return nil
	}

	if _, err := gs.DeleteCollection(ctx, validator, nil, nil); !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled, got %v", err)
	}
	assertStrings(t, "stored objects", storedKeys(backend), []string{"Agent/default/t2", "Agent/default/t3"})
}
