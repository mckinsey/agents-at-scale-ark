package config

import (
	"context"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
)

const (
	otelSecretName   = "otel-environment-variables"
	brokerConfigName = "ark-config-broker"
)

func TestDiscoverBrokerProcessor_NilClient(t *testing.T) {
	processor := discoverBrokerProcessor(context.Background(), nil)
	if processor != nil {
		t.Error("expected nil processor for nil client")
	}
}

func TestDiscoverBrokerProcessor_NoConfigMaps(t *testing.T) {
	client := fake.NewClientBuilder().Build()
	processor := discoverBrokerProcessor(context.Background(), client)
	if processor != nil {
		t.Error("expected nil processor when no configmaps exist")
	}
}

func TestDiscoverBrokerProcessor_NoMatchingConfigMaps(t *testing.T) {
	configMaps := []runtime.Object{
		&corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{Name: "other-config", Namespace: "ns1"},
			Data:       map[string]string{"enabled": "true"},
		},
	}
	client := fake.NewClientBuilder().WithRuntimeObjects(configMaps...).Build()
	processor := discoverBrokerProcessor(context.Background(), client)
	if processor != nil {
		t.Error("expected nil processor when no matching configmaps exist")
	}
}

func TestDiscoverBrokerProcessor_WithValidEndpoints(t *testing.T) {
	configMaps := []runtime.Object{
		&corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{Name: brokerConfigName, Namespace: "tenant-a"},
			Data: map[string]string{
				"enabled":    "true",
				"serviceRef": "name: collector\nport: \"4318\"",
			},
		},
	}
	client := fake.NewClientBuilder().WithRuntimeObjects(configMaps...).Build()
	processor := discoverBrokerProcessor(context.Background(), client)
	if processor == nil {
		t.Error("expected non-nil processor when valid endpoints exist")
	}
}

func TestDiscoverBrokerProcessor_WithMultipleEndpoints(t *testing.T) {
	configMaps := []runtime.Object{
		&corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{Name: brokerConfigName, Namespace: "tenant-a"},
			Data: map[string]string{
				"enabled":    "true",
				"serviceRef": "name: collector-a\nport: \"4318\"",
			},
		},
		&corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{Name: brokerConfigName, Namespace: "tenant-b"},
			Data: map[string]string{
				"enabled":    "true",
				"serviceRef": "name: collector-b\nport: \"4317\"",
			},
		},
	}
	client := fake.NewClientBuilder().WithRuntimeObjects(configMaps...).Build()
	processor := discoverBrokerProcessor(context.Background(), client)
	if processor == nil {
		t.Error("expected non-nil processor when multiple valid endpoints exist")
	}
}

func TestDiscoverBrokerProcessor_SkipsDisabledBrokers(t *testing.T) {
	configMaps := []runtime.Object{
		&corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{Name: brokerConfigName, Namespace: "tenant-a"},
			Data: map[string]string{
				"enabled":    "true",
				"serviceRef": "name: collector\nport: \"4318\"",
			},
		},
		&corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{Name: brokerConfigName, Namespace: "tenant-b"},
			Data: map[string]string{
				"enabled":    "false",
				"serviceRef": "name: collector\nport: \"4318\"",
			},
		},
	}
	client := fake.NewClientBuilder().WithRuntimeObjects(configMaps...).Build()
	processor := discoverBrokerProcessor(context.Background(), client)
	if processor == nil {
		t.Error("expected non-nil processor when at least one valid endpoint exists")
	}
}

func TestDiscoverOTELProcessor_NilClient(t *testing.T) {
	processor := discoverOTELProcessor(context.Background(), nil)
	if processor != nil {
		t.Error("expected nil processor for nil client")
	}
}

func TestDiscoverOTELProcessor_NoSecrets(t *testing.T) {
	client := fake.NewClientBuilder().Build()
	processor := discoverOTELProcessor(context.Background(), client)
	if processor != nil {
		t.Error("expected nil processor when no secrets exist")
	}
}

func TestDiscoverOTELProcessor_NoMatchingSecrets(t *testing.T) {
	secrets := []runtime.Object{
		&corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: "other-secret", Namespace: "ns1"},
			Data:       map[string][]byte{"OTEL_EXPORTER_OTLP_ENDPOINT": []byte("http://collector:4318")},
		},
	}
	client := fake.NewClientBuilder().WithRuntimeObjects(secrets...).Build()
	processor := discoverOTELProcessor(context.Background(), client)
	if processor != nil {
		t.Error("expected nil processor when no matching secrets exist")
	}
}

func TestDiscoverOTELProcessor_WithValidEndpoints(t *testing.T) {
	secrets := []runtime.Object{
		&corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: otelSecretName, Namespace: "tenant-a"},
			Data:       map[string][]byte{"OTEL_EXPORTER_OTLP_ENDPOINT": []byte("http://collector:4318/v1/traces")},
		},
	}
	client := fake.NewClientBuilder().WithRuntimeObjects(secrets...).Build()
	processor := discoverOTELProcessor(context.Background(), client)
	if processor == nil {
		t.Error("expected non-nil processor when valid endpoints exist")
	}
}

func TestDiscoverOTELProcessor_WithMultipleEndpoints(t *testing.T) {
	secrets := []runtime.Object{
		&corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: otelSecretName, Namespace: "tenant-a"},
			Data:       map[string][]byte{"OTEL_EXPORTER_OTLP_ENDPOINT": []byte("http://collector-a:4318")},
		},
		&corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: otelSecretName, Namespace: "tenant-b"},
			Data: map[string][]byte{
				"OTEL_EXPORTER_OTLP_ENDPOINT": []byte("https://collector-b:443"),
				"OTEL_EXPORTER_OTLP_HEADERS":  []byte("Authorization=Bearer token"),
			},
		},
	}
	client := fake.NewClientBuilder().WithRuntimeObjects(secrets...).Build()
	processor := discoverOTELProcessor(context.Background(), client)
	if processor == nil {
		t.Error("expected non-nil processor when multiple valid endpoints exist")
	}
}

func TestDiscoverOTELProcessor_SkipsInvalidSecrets(t *testing.T) {
	secrets := []runtime.Object{
		&corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: otelSecretName, Namespace: "tenant-a"},
			Data:       map[string][]byte{"OTEL_EXPORTER_OTLP_ENDPOINT": []byte("http://valid:4318")},
		},
		&corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: otelSecretName, Namespace: "tenant-b"},
			Data:       map[string][]byte{"OTHER_KEY": []byte("value")},
		},
	}
	client := fake.NewClientBuilder().WithRuntimeObjects(secrets...).Build()
	processor := discoverOTELProcessor(context.Background(), client)
	if processor == nil {
		t.Error("expected non-nil processor when at least one valid endpoint exists")
	}
}
