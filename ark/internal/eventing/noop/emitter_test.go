package noop

import (
	"context"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestNoopEventEmitter_EmitNormal(t *testing.T) {
	emitter := NewNoopEventEmitter()

	obj := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-configmap",
			Namespace: "test-ns",
		},
	}

	ctx := context.Background()
	emitter.EmitNormal(ctx, obj, "TestReason", "Test message")
}

func TestNoopEventEmitter_EmitWarning(t *testing.T) {
	emitter := NewNoopEventEmitter()

	obj := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-configmap",
			Namespace: "test-ns",
		},
	}

	ctx := context.Background()
	emitter.EmitWarning(ctx, obj, "WarningReason", "Warning message")
}

func TestNoopEventEmitter_EmitStructured(t *testing.T) {
	emitter := NewNoopEventEmitter()

	obj := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-configmap",
			Namespace: "test-ns",
		},
	}

	data := map[string]string{
		"key1": "value1",
		"key2": "value2",
	}

	ctx := context.Background()
	emitter.EmitStructured(ctx, obj, corev1.EventTypeNormal, "StructuredReason", "Structured message", data)
}

func TestNoopEventEmitter_EmitStructured_NilData(t *testing.T) {
	emitter := NewNoopEventEmitter()

	obj := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-configmap",
			Namespace: "test-ns",
		},
	}

	ctx := context.Background()
	emitter.EmitStructured(ctx, obj, corev1.EventTypeNormal, "StructuredReason", "Structured message", nil)
}
