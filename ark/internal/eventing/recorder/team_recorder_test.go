/* Copyright 2025. McKinsey & Company */

package recorder

import (
	"context"
	"testing"

	corev1 "k8s.io/api/core/v1"

	eventmock "mckinsey.com/ark/internal/eventing/mock"
)

func TestTeamRecorderCreated(t *testing.T) {
	emitter := eventmock.NewMockEventEmitter()
	r := NewTeamRecorder(emitter, emitter)

	r.Created(context.Background(), &corev1.ConfigMap{})

	events := emitter.GetEvents()
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].Type != corev1.EventTypeNormal {
		t.Errorf("type = %q, want Normal", events[0].Type)
	}
	if events[0].Reason != "TeamCreated" {
		t.Errorf("reason = %q, want TeamCreated", events[0].Reason)
	}
	if events[0].Message != "Initialized team conditions" {
		t.Errorf("message = %q, want Initialized team conditions", events[0].Message)
	}
}

func TestTeamRecorderStatusChanged(t *testing.T) {
	emitter := eventmock.NewMockEventEmitter()
	r := NewTeamRecorder(emitter, emitter)

	r.StatusChanged(context.Background(), &corev1.ConfigMap{}, "Team availability: True - Available")

	events := emitter.GetEvents()
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].Reason != "StatusChanged" {
		t.Errorf("reason = %q, want StatusChanged", events[0].Reason)
	}
	if events[0].Message != "Team availability: True - Available" {
		t.Errorf("message = %q", events[0].Message)
	}
}
