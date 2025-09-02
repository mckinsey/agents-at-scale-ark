/* Copyright 2025. McKinsey & Company */

package genai

import (
	"context"
	"encoding/json"

	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/tools/record"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

type Recorder[T runtime.Object] struct {
	resource T
	recorder record.EventRecorder
}

func NewQueryRecorder(query *arkv1alpha1.Query, recorder record.EventRecorder) *Recorder[*arkv1alpha1.Query] {
	return &Recorder[*arkv1alpha1.Query]{
		resource: query,
		recorder: recorder,
	}
}

func NewModelRecorder(model *arkv1alpha1.Model, recorder record.EventRecorder) *Recorder[*arkv1alpha1.Model] {
	return &Recorder[*arkv1alpha1.Model]{
		resource: model,
		recorder: recorder,
	}
}

func (r *Recorder[T]) EmitEvent(ctx context.Context, eventType, reason string, data EventData) {
	log := logf.FromContext(ctx).WithValues("reason", reason)

	if r.recorder == nil {
		log.V(1).Info("event recorder is nil, skipping event emission")
		return
	}

	if r.isResourceNil() {
		log.V(1).Info("resource is nil, skipping event emission")
		return
	}

	eventMap := data.ToMap()
	eventJSON, err := json.Marshal(eventMap)
	if err != nil {
		log.Error(err, "failed to marshal event data", "data", eventMap)
		return
	}

	r.recorder.Event(r.resource, eventType, reason, string(eventJSON))
	log.V(2).Info("event emitted successfully", "data", eventMap)

	if log.V(3).Enabled() {
		log.V(3).Info("event details", "reason", reason, "eventData", eventMap)
	}
}

func (r *Recorder[T]) isResourceNil() bool {
	var zero T
	return any(r.resource) == any(zero)
}
