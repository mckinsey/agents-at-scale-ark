/* Copyright 2025. McKinsey & Company */

package registry

import (
	"testing"

	metainternalversion "k8s.io/apimachinery/pkg/apis/meta/internalversion"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func clusterScopedConfig() ResourceConfig {
	return ResourceConfig{
		Kind:          "ArkConfig",
		Resource:      "arkconfigs",
		SingularName:  "arkconfig",
		ClusterScoped: true,
		NewFunc:       func() runtime.Object { return &arkv1alpha1.ArkConfig{} },
		NewListFunc:   func() runtime.Object { return &arkv1alpha1.ArkConfigList{} },
	}
}

func newClusterScopedTestStorage() (*GenericStorage, *mockBackend) {
	backend := newMockBackend()
	return NewGenericStorage(backend, &mockConverter{}, clusterScopedConfig(), nil), backend
}

func TestGenericStorage_ClusterScoped_NamespaceScoped(t *testing.T) {
	t.Parallel()
	storage, _ := newClusterScopedTestStorage()
	if storage.NamespaceScoped() {
		t.Error("cluster-scoped storage must report NamespaceScoped() = false")
	}
	statusStorage := NewStatusStorage(newMockBackend(), &mockConverter{}, clusterScopedConfig())
	if statusStorage.NamespaceScoped() {
		t.Error("cluster-scoped status storage must report NamespaceScoped() = false")
	}
}

func TestGenericStorage_ClusterScoped_CreateStoresUnderEmptyNamespace(t *testing.T) {
	t.Parallel()
	storage, backend := newClusterScopedTestStorage()

	obj := &arkv1alpha1.ArkConfig{ObjectMeta: metav1.ObjectMeta{Name: "default", Namespace: "leaked"}}
	if _, err := storage.Create(contextWithNamespace(testNS()), obj, nil, &metav1.CreateOptions{}); err != nil {
		t.Fatalf("create: %v", err)
	}

	stored, ok := backend.objects["ArkConfig//default"]
	if !ok {
		t.Fatalf("expected key %q, got keys %v", "ArkConfig//default", mapKeys(backend.objects))
	}
	if ns := stored.(*arkv1alpha1.ArkConfig).Namespace; ns != "" {
		t.Errorf("stored namespace = %q, want empty", ns)
	}
}

func TestGenericStorage_ClusterScoped_GetIgnoresRequestNamespace(t *testing.T) {
	t.Parallel()
	storage, backend := newClusterScopedTestStorage()
	backend.objects["ArkConfig//default"] = &arkv1alpha1.ArkConfig{ObjectMeta: metav1.ObjectMeta{Name: "default"}}

	obj, err := storage.Get(contextWithNamespace("some-namespace"), "default", &metav1.GetOptions{})
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if obj.(*arkv1alpha1.ArkConfig).Name != "default" {
		t.Errorf("got %q, want %q", obj.(*arkv1alpha1.ArkConfig).Name, "default")
	}
}

func TestGenericStorage_ClusterScoped_ListIgnoresRequestNamespace(t *testing.T) {
	t.Parallel()
	storage, backend := newClusterScopedTestStorage()
	backend.objects["ArkConfig//default"] = &arkv1alpha1.ArkConfig{
		ObjectMeta: metav1.ObjectMeta{Name: "default", ResourceVersion: "1"},
	}

	list, err := storage.List(contextWithNamespace("some-namespace"), &metainternalversion.ListOptions{})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	items := list.(*arkv1alpha1.ArkConfigList).Items
	if len(items) != 1 {
		t.Fatalf("got %d items, want 1", len(items))
	}
}

func mapKeys(m map[string]runtime.Object) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}
