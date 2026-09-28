package kubernetes

import (
	"context"
	"encoding/json"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/recorder"

	"mckinsey.com/ark/internal/annotations"
	"mckinsey.com/ark/internal/eventing"
)

type KubernetesEventEmitter struct {
	recorder recorder.EventRecorder
}

func NewKubernetesEventEmitter(rec recorder.EventRecorder) eventing.EventEmitter {
	return &KubernetesEventEmitter{
		recorder: rec,
	}
}

func (e *KubernetesEventEmitter) EmitNormal(ctx context.Context, obj runtime.Object, reason, message string) {
	e.recorder.Eventf(obj, nil, corev1.EventTypeNormal, reason, reason, "%s", message)
}

func (e *KubernetesEventEmitter) EmitWarning(ctx context.Context, obj runtime.Object, reason, message string) {
	e.recorder.Eventf(obj, nil, corev1.EventTypeWarning, reason, reason, "%s", message)
}

func (e *KubernetesEventEmitter) EmitStructured(ctx context.Context, obj runtime.Object, eventType, reason, message string, data any) {
	jsonBytes, err := json.Marshal(data)
	if err != nil {
		e.recorder.Eventf(obj, nil, eventType, reason, reason, "%s", message)
		return
	}

	eventAnnotations := map[string]string{
		annotations.EventData: string(jsonBytes),
	}
	e.recorder.AnnotatedEventf(obj, nil, eventAnnotations, eventType, reason, reason, "%s", message)
}
