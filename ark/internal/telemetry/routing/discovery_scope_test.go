package routing

import (
	"context"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
)

const tenantA = "tenant-a"

func TestScopedListOptions(t *testing.T) {
	t.Run("unset env returns nil (cluster-wide)", func(t *testing.T) {
		t.Setenv(discoveryNamespaceEnv, "")
		if opts := scopedListOptions(); opts != nil {
			t.Errorf("expected nil options, got %v", opts)
		}
	})

	t.Run("set env scopes to that namespace", func(t *testing.T) {
		t.Setenv(discoveryNamespaceEnv, tenantA)
		opts := scopedListOptions()
		if len(opts) != 1 {
			t.Fatalf("expected 1 option, got %d", len(opts))
		}
		if ns, ok := opts[0].(client.InNamespace); !ok || string(ns) != tenantA {
			t.Errorf("expected InNamespace(\"tenant-a\"), got %#v", opts[0])
		}
	})
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
