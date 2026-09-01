package routing

import (
	"context"
	"slices"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
)

const tenantA = "tenant-a"

func setScopeEnv(t *testing.T, discovery, watch string) {
	t.Helper()
	t.Setenv(discoveryNamespaceEnv, discovery)
	t.Setenv(watchNamespacesEnv, watch)
}

func scopeNamespaces(t *testing.T, sets [][]client.ListOption) []string {
	t.Helper()
	out := make([]string, 0, len(sets))
	for _, set := range sets {
		if set == nil {
			out = append(out, "")
			continue
		}
		ns, ok := set[0].(client.InNamespace)
		if !ok {
			t.Fatalf("expected InNamespace option, got %#v", set[0])
		}
		out = append(out, string(ns))
	}
	return out
}

func TestScopedListOptionSets(t *testing.T) {
	cases := []struct {
		name      string
		discovery string
		watch     string
		want      []string
	}{
		{"both unset is cluster-wide", "", "", []string{""}},
		{"discovery namespace scopes to one", tenantA, "", []string{tenantA}},
		{"watch namespaces scope to each", "", " tenant-a , tenant-b ,", []string{"tenant-a", "tenant-b"}},
		{"discovery namespace wins", tenantA, "tenant-b,tenant-c", []string{tenantA}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			setScopeEnv(t, c.discovery, c.watch)
			got := scopeNamespaces(t, scopedListOptionSets())
			if !slices.Equal(got, c.want) {
				t.Errorf("scopedListOptionSets() = %v, want %v", got, c.want)
			}
		})
	}
}

func TestDiscoverBrokerEndpointsWatchNamespaces(t *testing.T) {
	objs := []client.Object{
		&corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{Name: brokerConfigName, Namespace: tenantA},
			Data:       map[string]string{"enabled": "true", "serviceRef": "name: collector\nport: 4318"},
		},
		&corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{Name: brokerConfigName, Namespace: "tenant-b"},
			Data:       map[string]string{"enabled": "true", "serviceRef": "name: collector\nport: 4318"},
		},
		&corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{Name: brokerConfigName, Namespace: "tenant-c"},
			Data:       map[string]string{"enabled": "true", "serviceRef": "name: collector\nport: 4318"},
		},
	}
	k8sClient := fake.NewClientBuilder().WithObjects(objs...).Build()

	t.Setenv(watchNamespacesEnv, "tenant-a,tenant-b")
	endpoints, err := DiscoverBrokerEndpoints(context.Background(), k8sClient)
	if err != nil {
		t.Fatalf("DiscoverBrokerEndpoints() error = %v", err)
	}
	if len(endpoints) != 2 {
		t.Fatalf("got %d endpoints, want 2 (tenant-a, tenant-b)", len(endpoints))
	}
	got := map[string]bool{endpoints[0].Namespace: true, endpoints[1].Namespace: true}
	if !got[tenantA] || !got["tenant-b"] || got["tenant-c"] {
		t.Errorf("endpoints namespaces = %v, want tenant-a and tenant-b only", got)
	}
}

func TestDiscoverBrokerEndpointsNamespaceScoped(t *testing.T) {
	objs := []client.Object{
		&corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{Name: brokerConfigName, Namespace: tenantA},
			Data: map[string]string{
				"enabled":    "true",
				"serviceRef": "name: collector\nport: 4318",
			},
		},
		&corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{Name: brokerConfigName, Namespace: "tenant-b"},
			Data: map[string]string{
				"enabled":    "true",
				"serviceRef": "name: collector\nport: 4318",
			},
		},
	}
	k8sClient := fake.NewClientBuilder().WithObjects(objs...).Build()

	t.Setenv(discoveryNamespaceEnv, tenantA)
	endpoints, err := DiscoverBrokerEndpoints(context.Background(), k8sClient)
	if err != nil {
		t.Fatalf("DiscoverBrokerEndpoints() error = %v", err)
	}
	if len(endpoints) != 1 {
		t.Fatalf("got %d endpoints, want 1 (scoped to tenant-a)", len(endpoints))
	}
	if endpoints[0].Namespace != tenantA {
		t.Errorf("endpoint namespace = %s, want tenant-a", endpoints[0].Namespace)
	}
}

func TestDiscoverTargetEndpointsNamespaceScoped(t *testing.T) {
	objs := []client.Object{
		&corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: otelSecretName, Namespace: tenantA},
			Data:       map[string][]byte{"OTEL_EXPORTER_OTLP_ENDPOINT": []byte("http://collector.tenant-a:4318")},
		},
		&corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: otelSecretName, Namespace: "tenant-b"},
			Data:       map[string][]byte{"OTEL_EXPORTER_OTLP_ENDPOINT": []byte("http://collector.tenant-b:4318")},
		},
	}
	k8sClient := fake.NewClientBuilder().WithObjects(objs...).Build()

	t.Setenv(discoveryNamespaceEnv, tenantA)
	endpoints, err := DiscoverTargetEndpoints(context.Background(), k8sClient)
	if err != nil {
		t.Fatalf("DiscoverTargetEndpoints() error = %v", err)
	}
	if len(endpoints) != 1 {
		t.Fatalf("got %d endpoints, want 1 (scoped to tenant-a)", len(endpoints))
	}
	if endpoints[0].Namespace != tenantA {
		t.Errorf("endpoint namespace = %s, want tenant-a", endpoints[0].Namespace)
	}
}
