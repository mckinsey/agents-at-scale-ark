package kubernetes

import (
	"context"
	"encoding/json"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/tools/record"

	"mckinsey.com/ark/internal/annotations"
	"mckinsey.com/ark/internal/eventing"
)

type KubernetesEventEmitter struct {
	recorder record.EventRecorder
}

func NewKubernetesEventEmitter(recorder record.EventRecorder) eventing.EventEmitter {
	return &KubernetesEventEmitter{
		recorder: recorder,
	}
}

func (e *KubernetesEventEmitter) EmitNormal(ctx context.Context, obj runtime.Object, reason, message string) {
	e.recorder.Event(obj, corev1.EventTypeNormal, reason, message)
}

func (e *KubernetesEventEmitter) EmitWarning(ctx context.Context, obj runtime.Object, reason, message string) {
	e.recorder.Event(obj, corev1.EventTypeWarning, reason, message)
}

func (e *KubernetesEventEmitter) EmitStructured(ctx context.Context, obj runtime.Object, eventType, reason, message string, data any) {
	jsonBytes, err := json.Marshal(data)
	if err != nil {
		e.recorder.Event(obj, eventType, reason, message)
		return
	}

	eventAnnotations := map[string]string{
		annotations.EventData: string(jsonBytes),
	}
	e.recorder.AnnotatedEventf(obj, eventAnnotations, eventType, reason, message)
}
