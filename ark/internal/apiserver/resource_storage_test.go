/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"testing"

	"mckinsey.com/ark/internal/apiserver/registry"
	"mckinsey.com/ark/internal/validation"
)

func TestResourceStorage_WrapsEveryResourceAndItsStatus(t *testing.T) {
	backend := newFakeBackend()
	lookup := &validation.StorageLookup{Backend: backend}
	v := validation.NewValidator(lookup)

	for _, resources := range [][]ResourceDef{V1Alpha1Resources, V1PreAlpha1Resources} {
		got := resourceStorage(backend, NewRegistryTypeConverter(), resources, v, lookup)
		if len(got) != 2*len(resources) {
			t.Fatalf("storage map has %d entries, want %d", len(got), 2*len(resources))
		}
		for _, res := range resources {
			main, ok := got[res.Resource].(*AdmissionStorage)
			if !ok {
				t.Fatalf("%s: main storage is %T, want *AdmissionStorage", res.Resource, got[res.Resource])
			}
			if main.lookup != lookup {
				t.Errorf("%s: admission storage lacks the ArkConfig lookup", res.Resource)
			}
			if main.NamespaceScoped() == res.ClusterScoped {
				t.Errorf("%s: NamespaceScoped()=%v with ClusterScoped=%v", res.Resource, main.NamespaceScoped(), res.ClusterScoped)
			}
			if _, ok := got[res.Resource+"/status"].(*registry.StatusStorage); !ok {
				t.Errorf("%s/status: storage is %T, want *registry.StatusStorage", res.Resource, got[res.Resource+"/status"])
			}
		}
	}
}
