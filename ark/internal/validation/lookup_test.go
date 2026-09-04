package validation

import (
	"context"
	"strings"
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/watch"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/storage"
)

type fakeBackend struct {
	obj          runtime.Object
	err          error
	gotKind      string
	gotNamespace string
	gotName      string
}

func (f *fakeBackend) Get(_ context.Context, kind, namespace, name string) (runtime.Object, error) {
	f.gotKind, f.gotNamespace, f.gotName = kind, namespace, name
	if f.err != nil {
		return nil, f.err
	}
	return f.obj, nil
}

func (f *fakeBackend) Create(context.Context, string, string, string, runtime.Object) error {
	return nil
}

func (f *fakeBackend) List(context.Context, string, string, storage.ListOptions) ([]runtime.Object, string, int64, error) {
	return nil, "", 0, nil
}

func (f *fakeBackend) Update(context.Context, string, string, string, runtime.Object) error {
	return nil
}

func (f *fakeBackend) UpdateStatus(context.Context, string, string, string, runtime.Object) error {
	return nil
}

func (f *fakeBackend) Delete(context.Context, string, string, string) error { return nil }

func (f *fakeBackend) Watch(context.Context, string, string, storage.WatchOptions) (watch.Interface, error) {
	return nil, nil
}

func (f *fakeBackend) GetResourceVersion(context.Context, string, string, string) (int64, error) {
	return 0, nil
}

func (f *fakeBackend) Close() error { return nil }

func TestStorageLookup_GetArkConfig(t *testing.T) {
	backend := &fakeBackend{
		obj: &arkv1alpha1.ArkConfig{
			ObjectMeta: metav1.ObjectMeta{Name: ArkConfigSingletonName},
			Spec: arkv1alpha1.ArkConfigSpec{
				QueryTTL: &metav1.Duration{Duration: 2 * time.Hour},
			},
		},
	}
	lookup := &StorageLookup{Backend: backend}

	cfg, err := lookup.GetArkConfig(context.Background())
	if err != nil {
		t.Fatalf("GetArkConfig: %v", err)
	}
	if cfg.Spec.QueryTTL.Duration != 2*time.Hour {
		t.Errorf("queryTTL = %v, want 2h", cfg.Spec.QueryTTL.Duration)
	}
	if backend.gotKind != "ArkConfig" || backend.gotNamespace != "" || backend.gotName != ArkConfigSingletonName {
		t.Errorf("backend queried with (%q, %q, %q), want (ArkConfig, \"\", %q)",
			backend.gotKind, backend.gotNamespace, backend.gotName, ArkConfigSingletonName)
	}
}

func TestStorageLookup_GetArkConfig_NotFoundFallsBack(t *testing.T) {
	lookup := &StorageLookup{Backend: &fakeBackend{err: storage.ErrNotFound}}

	if _, err := lookup.GetArkConfig(context.Background()); err == nil {
		t.Fatal("expected an error when the singleton does not exist")
	}
	got := ResolveQueryTTL(context.Background(), lookup)
	if got.Duration != DefaultTTLFallback {
		t.Errorf("ResolveQueryTTL = %v, want fallback %v", got.Duration, DefaultTTLFallback)
	}
}

func TestStorageLookup_GetArkConfig_UnexpectedType(t *testing.T) {
	lookup := &StorageLookup{Backend: &fakeBackend{obj: &arkv1alpha1.Agent{}}}

	_, err := lookup.GetArkConfig(context.Background())
	if err == nil || !strings.Contains(err.Error(), "unexpected type") {
		t.Fatalf("GetArkConfig error = %v, want unexpected type", err)
	}
}
