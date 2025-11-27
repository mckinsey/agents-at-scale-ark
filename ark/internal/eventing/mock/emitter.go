package mock

import (
	"context"
	"sync"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/runtime"

	"mckinsey.com/ark/internal/eventing"
)

type Event struct {
	Type    string
	Reason  string
	Message string
	Object  runtime.Object
	Data    *any
}

type MockEventEmitter struct {
	mu     sync.RWMutex
	events []Event
}

func NewMockEventEmitter() *MockEventEmitter {
	return &MockEventEmitter{
		events: make([]Event, 0),
	}
}

func (e *MockEventEmitter) EmitNormal(ctx context.Context, obj runtime.Object, reason, message string) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.events = append(e.events, Event{
		Type:    corev1.EventTypeNormal,
		Reason:  reason,
		Message: message,
		Object:  obj,
	})
}

func (e *MockEventEmitter) EmitWarning(ctx context.Context, obj runtime.Object, reason, message string) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.events = append(e.events, Event{
		Type:    corev1.EventTypeWarning,
		Reason:  reason,
		Message: message,
		Object:  obj,
	})
}

func (e *MockEventEmitter) EmitStructured(ctx context.Context, obj runtime.Object, eventType, reason, message string, data any) {
	e.mu.Lock()
	defer e.mu.Unlock()
	dataCopy := data
	e.events = append(e.events, Event{
		Type:    eventType,
		Reason:  reason,
		Message: message,
		Object:  obj,
		Data:    &dataCopy,
	})
}

func (e *MockEventEmitter) GetEvents() []Event {
	e.mu.RLock()
	defer e.mu.RUnlock()
	result := make([]Event, len(e.events))
	copy(result, e.events)
	return result
}

func (e *MockEventEmitter) Clear() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.events = make([]Event, 0)
}

func (e *MockEventEmitter) EventCount() int {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return len(e.events)
}

var _ eventing.EventEmitter = (*MockEventEmitter)(nil)
