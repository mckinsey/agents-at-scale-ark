/* Copyright 2025. McKinsey & Company */

package recorder

import (
	"context"
	"testing"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/runtime"

	"mckinsey.com/ark/internal/eventing"
)

type capturedEvent struct {
	reason  string
	message string
}

type capturingEmitter struct {
	normals []capturedEvent
}

func (c *capturingEmitter) EmitNormal(_ context.Context, _ runtime.Object, reason, message string) {
	c.normals = append(c.normals, capturedEvent{reason: reason, message: message})
}

func (c *capturingEmitter) EmitWarning(_ context.Context, _ runtime.Object, _, _ string) {}

func (c *capturingEmitter) EmitStructured(_ context.Context, _ runtime.Object, _, _, _ string, _ any) {
}

var _ eventing.EventEmitter = (*capturingEmitter)(nil)

func TestTeamRecorderCreated(t *testing.T) {
	emitter := &capturingEmitter{}
	r := NewTeamRecorder(emitter, emitter)

	r.Created(context.Background(), &corev1.ConfigMap{})

	if len(emitter.normals) != 1 {
		t.Fatalf("expected 1 normal event, got %d", len(emitter.normals))
	}
	if emitter.normals[0].reason != "TeamCreated" {
		t.Errorf("reason = %q, want TeamCreated", emitter.normals[0].reason)
	}
	if emitter.normals[0].message != "Initialized team conditions" {
		t.Errorf("message = %q, want Initialized team conditions", emitter.normals[0].message)
	}
}

func TestTeamRecorderStatusChanged(t *testing.T) {
	emitter := &capturingEmitter{}
	r := NewTeamRecorder(emitter, emitter)

	r.StatusChanged(context.Background(), &corev1.ConfigMap{}, "Team availability: True - Available")

	if len(emitter.normals) != 1 {
		t.Fatalf("expected 1 normal event, got %d", len(emitter.normals))
	}
	if emitter.normals[0].reason != "StatusChanged" {
		t.Errorf("reason = %q, want StatusChanged", emitter.normals[0].reason)
	}
	if emitter.normals[0].message != "Team availability: True - Available" {
		t.Errorf("message = %q", emitter.normals[0].message)
	}
}
