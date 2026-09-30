package kubernetes

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/recorder"

	"mckinsey.com/ark/internal/annotations"
)

type mockEventRecorder struct {
	events          []string
	annotatedEvents []annotatedEvent
	eventType       string
	reason          string
	message         string
}

type annotatedEvent struct {
	annotations map[string]string
	eventType   string
	reason      string
	message     string
	obj         runtime.Object
}

func (m *mockEventRecorder) Eventf(regarding, related runtime.Object, eventtype, reason, action, note string, args ...interface{}) {
	msg := fmt.Sprintf(note, args...)
	m.events = append(m.events, msg)
	m.eventType = eventtype
	m.reason = reason
	m.message = msg
}

func (m *mockEventRecorder) AnnotatedEventf(regarding, related runtime.Object, eventAnnotations map[string]string, eventtype, reason, action, note string, args ...interface{}) {
	m.annotatedEvents = append(m.annotatedEvents, annotatedEvent{
		annotations: eventAnnotations,
		eventType:   eventtype,
		reason:      reason,
		message:     fmt.Sprintf(note, args...),
		obj:         regarding,
	})
}

var _ recorder.EventRecorder = (*mockEventRecorder)(nil)

func TestKubernetesEventEmitter_EmitNormal(t *testing.T) {
	mockRecorder := &mockEventRecorder{events: []string{}}
	emitter := NewKubernetesEventEmitter(mockRecorder)

	obj := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-configmap",
			Namespace: "test-ns",
		},
	}

	ctx := context.Background()
	emitter.EmitNormal(ctx, obj, "TestReason", "Test message")

	assert.Equal(t, 1, len(mockRecorder.events))
	assert.Equal(t, corev1.EventTypeNormal, mockRecorder.eventType)
	assert.Equal(t, "TestReason", mockRecorder.reason)
	assert.Equal(t, "Test message", mockRecorder.message)
}

func TestKubernetesEventEmitter_EmitWarning(t *testing.T) {
	mockRecorder := &mockEventRecorder{events: []string{}}
	emitter := NewKubernetesEventEmitter(mockRecorder)

	obj := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-configmap",
			Namespace: "test-ns",
		},
	}

	ctx := context.Background()
	emitter.EmitWarning(ctx, obj, "WarningReason", "Warning message")

	assert.Equal(t, 1, len(mockRecorder.events))
	assert.Equal(t, corev1.EventTypeWarning, mockRecorder.eventType)
	assert.Equal(t, "WarningReason", mockRecorder.reason)
	assert.Equal(t, "Warning message", mockRecorder.message)
}

func TestKubernetesEventEmitter_EmitStructured(t *testing.T) {
	mockRecorder := &mockEventRecorder{events: []string{}, annotatedEvents: []annotatedEvent{}}
	emitter := NewKubernetesEventEmitter(mockRecorder)

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

	assert.Equal(t, 1, len(mockRecorder.annotatedEvents))
	event := mockRecorder.annotatedEvents[0]
	assert.Equal(t, corev1.EventTypeNormal, event.eventType)
	assert.Equal(t, "StructuredReason", event.reason)
	assert.Equal(t, "Structured message", event.message)
	assert.Equal(t, obj, event.obj)

	jsonData, exists := event.annotations[annotations.EventData]
	assert.True(t, exists)

	var parsedData map[string]string
	err := json.Unmarshal([]byte(jsonData), &parsedData)
	assert.NoError(t, err)
	assert.Equal(t, "value1", parsedData["key1"])
	assert.Equal(t, "value2", parsedData["key2"])
}

func TestKubernetesEventEmitter_EmitStructured_InvalidData(t *testing.T) {
	mockRecorder := &mockEventRecorder{events: []string{}, annotatedEvents: []annotatedEvent{}}
	emitter := NewKubernetesEventEmitter(mockRecorder)

	obj := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-configmap",
			Namespace: "test-ns",
		},
	}

	invalidData := make(chan int)

	ctx := context.Background()
	emitter.EmitStructured(ctx, obj, corev1.EventTypeNormal, "StructuredReason", "Structured message", invalidData)

	assert.Equal(t, 1, len(mockRecorder.events))
	assert.Equal(t, corev1.EventTypeNormal, mockRecorder.eventType)
	assert.Equal(t, "StructuredReason", mockRecorder.reason)
	assert.Equal(t, "Structured message", mockRecorder.message)
	assert.Equal(t, 0, len(mockRecorder.annotatedEvents))
}

func TestKubernetesEventEmitter_EmitStructured_NilData(t *testing.T) {
	mockRecorder := &mockEventRecorder{events: []string{}, annotatedEvents: []annotatedEvent{}}
	emitter := NewKubernetesEventEmitter(mockRecorder)

	obj := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-configmap",
			Namespace: "test-ns",
		},
	}

	ctx := context.Background()
	emitter.EmitStructured(ctx, obj, corev1.EventTypeNormal, "StructuredReason", "Structured message", nil)

	assert.Equal(t, 1, len(mockRecorder.annotatedEvents))
	event := mockRecorder.annotatedEvents[0]
	assert.Equal(t, corev1.EventTypeNormal, event.eventType)
	assert.Equal(t, "StructuredReason", event.reason)

	jsonData, exists := event.annotations[annotations.EventData]
	assert.True(t, exists)
	assert.Equal(t, "null", jsonData)
}
