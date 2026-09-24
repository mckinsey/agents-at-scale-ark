/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"sigs.k8s.io/controller-runtime/pkg/client/interceptor"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/eventing"
)

type recordedEvent struct {
	name   string
	reason string
}

type stubToolRecorder struct {
	eventing.ToolRecorder
	events *[]recordedEvent
}

func (s *stubToolRecorder) InlineSourceChanged(_ context.Context, obj runtime.Object, reason string) {
	name := ""
	if tool, ok := obj.(*arkv1alpha1.Tool); ok {
		name = tool.Name
	}
	*s.events = append(*s.events, recordedEvent{name: name, reason: reason})
}

type stubEventing struct {
	eventing.Provider
	events []recordedEvent
}

func (s *stubEventing) ToolRecorder() eventing.ToolRecorder {
	return &stubToolRecorder{events: &s.events}
}

func inlineTool(mutate func(*arkv1alpha1.Tool)) *arkv1alpha1.Tool {
	tool := &arkv1alpha1.Tool{
		ObjectMeta: metav1.ObjectMeta{
			Name:        "inline-tool",
			Namespace:   "default",
			Generation:  1,
			Annotations: map[string]string{arkv1alpha1.AnnotationInlineAuthoredBy: "alice"},
		},
		Spec: arkv1alpha1.ToolSpec{
			Type:   arkv1alpha1.ToolTypeInline,
			Inline: &arkv1alpha1.InlineSpec{Source: "echo hi", Language: "bash"},
		},
	}
	if mutate != nil {
		mutate(tool)
	}
	return tool
}

func inlineScheme(t *testing.T) *runtime.Scheme {
	t.Helper()
	s := runtime.NewScheme()
	if err := arkv1alpha1.AddToScheme(s); err != nil {
		t.Fatalf("add scheme: %v", err)
	}
	return s
}

func reconcileTool(t *testing.T, r *ToolReconciler, tool *arkv1alpha1.Tool) (ctrl.Result, error) {
	t.Helper()
	return r.Reconcile(context.Background(), ctrl.Request{
		NamespacedName: types.NamespacedName{Name: tool.Name, Namespace: tool.Namespace},
	})
}

func TestReconcileInlineReportsRuntimeNotInstalled(t *testing.T) {
	tool := inlineTool(nil)
	s := inlineScheme(t)
	c := fake.NewClientBuilder().WithScheme(s).WithObjects(tool).WithStatusSubresource(tool).Build()
	events := &stubEventing{}
	r := &ToolReconciler{Client: c, Scheme: s, Eventing: events}

	if _, err := reconcileTool(t, r, tool); err != nil {
		t.Fatalf("reconcile: %v", err)
	}

	stored := &arkv1alpha1.Tool{}
	if err := c.Get(context.Background(), client.ObjectKeyFromObject(tool), stored); err != nil {
		t.Fatalf("get: %v", err)
	}
	if stored.Status.State != arkv1alpha1.ToolStatePending {
		t.Fatalf("state = %q, want %q", stored.Status.State, arkv1alpha1.ToolStatePending)
	}
	if stored.Status.ResolvedAddress != "" {
		t.Fatalf("resolvedAddress = %q, want empty", stored.Status.ResolvedAddress)
	}
	cond := meta.FindStatusCondition(stored.Status.Conditions, arkv1alpha1.ToolConditionAvailable)
	if cond == nil {
		t.Fatal("Available condition missing")
	}
	if cond.Status != metav1.ConditionFalse || cond.Reason != arkv1alpha1.ToolReasonRuntimeNotInstalled {
		t.Fatalf("condition = %v/%v, want False/%v", cond.Status, cond.Reason, arkv1alpha1.ToolReasonRuntimeNotInstalled)
	}
	if cond.ObservedGeneration != tool.Generation {
		t.Fatalf("observedGeneration = %d, want %d", cond.ObservedGeneration, tool.Generation)
	}
	if len(events.events) != 1 {
		t.Fatalf("events = %d, want 1", len(events.events))
	}
	want := fmt.Sprintf("inline source hash is %s (authored by %q)", sourceHash("echo hi"), "alice")
	if events.events[0].reason != want {
		t.Fatalf("event reason = %q, want %q", events.events[0].reason, want)
	}
}

func TestReconcileInlineDoesNotReemitForAReconciledGeneration(t *testing.T) {
	tool := inlineTool(func(tool *arkv1alpha1.Tool) {
		tool.Status.Conditions = []metav1.Condition{{
			Type:               arkv1alpha1.ToolConditionAvailable,
			Status:             metav1.ConditionFalse,
			Reason:             arkv1alpha1.ToolReasonRuntimeNotInstalled,
			Message:            inlineRuntimeNotInstalledMessage,
			ObservedGeneration: 1,
			LastTransitionTime: metav1.Now(),
		}}
	})
	s := inlineScheme(t)
	c := fake.NewClientBuilder().WithScheme(s).WithObjects(tool).WithStatusSubresource(tool).Build()
	events := &stubEventing{}
	r := &ToolReconciler{Client: c, Scheme: s, Eventing: events}

	if _, err := reconcileTool(t, r, tool); err != nil {
		t.Fatalf("reconcile: %v", err)
	}
	if len(events.events) != 0 {
		t.Fatalf("events = %d, want 0 for an already reconciled generation", len(events.events))
	}
}

func TestReconcileInlineSettledToolIsLeftAlone(t *testing.T) {
	tool := inlineTool(func(tool *arkv1alpha1.Tool) {
		tool.Status.State = arkv1alpha1.ToolStatePending
		tool.Status.Message = inlineRuntimeNotInstalledMessage
		tool.Status.Conditions = []metav1.Condition{{
			Type:               arkv1alpha1.ToolConditionAvailable,
			Status:             metav1.ConditionFalse,
			Reason:             arkv1alpha1.ToolReasonRuntimeNotInstalled,
			Message:            inlineRuntimeNotInstalledMessage,
			ObservedGeneration: 1,
			LastTransitionTime: metav1.Now(),
		}}
	})
	s := inlineScheme(t)
	c := fake.NewClientBuilder().WithScheme(s).WithObjects(tool).WithStatusSubresource(tool).
		WithInterceptorFuncs(interceptor.Funcs{
			SubResourceUpdate: func(context.Context, client.Client, string, client.Object, ...client.SubResourceUpdateOption) error {
				t.Fatal("a settled inline tool must not be written again")
				return nil
			},
		}).Build()
	r := &ToolReconciler{Client: c, Scheme: s}

	if _, err := reconcileTool(t, r, tool); err != nil {
		t.Fatalf("reconcile: %v", err)
	}
}

func TestReconcileInlineEmitsAgainAfterASpecChange(t *testing.T) {
	tool := inlineTool(func(tool *arkv1alpha1.Tool) {
		tool.Generation = 2
		tool.Status.Conditions = []metav1.Condition{{
			Type:               arkv1alpha1.ToolConditionAvailable,
			Status:             metav1.ConditionFalse,
			Reason:             arkv1alpha1.ToolReasonRuntimeNotInstalled,
			Message:            inlineRuntimeNotInstalledMessage,
			ObservedGeneration: 1,
			LastTransitionTime: metav1.Now(),
		}}
	})
	s := inlineScheme(t)
	c := fake.NewClientBuilder().WithScheme(s).WithObjects(tool).WithStatusSubresource(tool).Build()
	events := &stubEventing{}
	r := &ToolReconciler{Client: c, Scheme: s, Eventing: events}

	if _, err := reconcileTool(t, r, tool); err != nil {
		t.Fatalf("reconcile: %v", err)
	}
	if len(events.events) != 1 {
		t.Fatalf("events = %d, want 1 after a generation bump", len(events.events))
	}
}

func TestReconcileInlineWithoutEventingStillSetsStatus(t *testing.T) {
	tool := inlineTool(nil)
	s := inlineScheme(t)
	c := fake.NewClientBuilder().WithScheme(s).WithObjects(tool).WithStatusSubresource(tool).Build()
	r := &ToolReconciler{Client: c, Scheme: s}

	if _, err := reconcileTool(t, r, tool); err != nil {
		t.Fatalf("reconcile: %v", err)
	}
	stored := &arkv1alpha1.Tool{}
	if err := c.Get(context.Background(), client.ObjectKeyFromObject(tool), stored); err != nil {
		t.Fatalf("get: %v", err)
	}
	if stored.Status.State != arkv1alpha1.ToolStatePending {
		t.Fatalf("state = %q, want %q", stored.Status.State, arkv1alpha1.ToolStatePending)
	}
}

func TestReconcileInlineWithoutInlineBlockEmitsNothing(t *testing.T) {
	tool := inlineTool(func(tool *arkv1alpha1.Tool) { tool.Spec.Inline = nil })
	s := inlineScheme(t)
	c := fake.NewClientBuilder().WithScheme(s).WithObjects(tool).WithStatusSubresource(tool).Build()
	events := &stubEventing{}
	r := &ToolReconciler{Client: c, Scheme: s, Eventing: events}

	if _, err := reconcileTool(t, r, tool); err != nil {
		t.Fatalf("reconcile: %v", err)
	}
	if len(events.events) != 0 {
		t.Fatalf("events = %d, want 0 without inline source", len(events.events))
	}
}

func TestReconcileInlineSurfacesAStatusUpdateFailure(t *testing.T) {
	tool := inlineTool(nil)
	s := inlineScheme(t)
	c := fake.NewClientBuilder().WithScheme(s).WithObjects(tool).WithStatusSubresource(tool).
		WithInterceptorFuncs(interceptor.Funcs{
			SubResourceUpdate: func(context.Context, client.Client, string, client.Object, ...client.SubResourceUpdateOption) error {
				return errors.New("conflict")
			},
		}).Build()
	r := &ToolReconciler{Client: c, Scheme: s}

	if _, err := reconcileTool(t, r, tool); err == nil {
		t.Fatal("expected the status update failure to be returned")
	}
}

func TestReconcileMissingToolIsNotAnError(t *testing.T) {
	s := inlineScheme(t)
	c := fake.NewClientBuilder().WithScheme(s).Build()
	r := &ToolReconciler{Client: c, Scheme: s}

	if _, err := reconcileTool(t, r, inlineTool(nil)); err != nil {
		t.Fatalf("reconcile of a deleted tool: %v", err)
	}
}

func TestReconcileNonInlineToolBecomesReady(t *testing.T) {
	tool := inlineTool(func(tool *arkv1alpha1.Tool) {
		tool.Spec.Type = arkv1alpha1.ToolTypeBuiltin
		tool.Spec.Inline = nil
		tool.Spec.Builtin = &arkv1alpha1.BuiltinToolRef{Name: "noop"}
	})
	s := inlineScheme(t)
	c := fake.NewClientBuilder().WithScheme(s).WithObjects(tool).WithStatusSubresource(tool).Build()
	r := &ToolReconciler{Client: c, Scheme: s}

	if _, err := reconcileTool(t, r, tool); err != nil {
		t.Fatalf("reconcile: %v", err)
	}
	stored := &arkv1alpha1.Tool{}
	if err := c.Get(context.Background(), client.ObjectKeyFromObject(tool), stored); err != nil {
		t.Fatalf("get: %v", err)
	}
	if stored.Status.State != arkv1alpha1.ToolStateReady {
		t.Fatalf("state = %q, want %q", stored.Status.State, arkv1alpha1.ToolStateReady)
	}
	if len(stored.Status.Conditions) != 0 {
		t.Fatalf("conditions = %d, want none on a non-inline tool", len(stored.Status.Conditions))
	}
}

func TestReconcileReadyToolIsLeftAlone(t *testing.T) {
	tool := inlineTool(func(tool *arkv1alpha1.Tool) {
		tool.Spec.Type = arkv1alpha1.ToolTypeBuiltin
		tool.Spec.Inline = nil
		tool.Spec.Builtin = &arkv1alpha1.BuiltinToolRef{Name: "noop"}
		tool.Status.State = arkv1alpha1.ToolStateReady
	})
	s := inlineScheme(t)
	c := fake.NewClientBuilder().WithScheme(s).WithObjects(tool).WithStatusSubresource(tool).
		WithInterceptorFuncs(interceptor.Funcs{
			SubResourceUpdate: func(context.Context, client.Client, string, client.Object, ...client.SubResourceUpdateOption) error {
				t.Fatal("a Ready tool must not be written again")
				return nil
			},
		}).Build()
	r := &ToolReconciler{Client: c, Scheme: s}

	if _, err := reconcileTool(t, r, tool); err != nil {
		t.Fatalf("reconcile: %v", err)
	}
}

func TestSourceHashTracksSource(t *testing.T) {
	if sourceHash("echo hi") == sourceHash("echo bye") {
		t.Fatal("different sources must hash differently")
	}
	if got := len(sourceHash("")); got != 64 {
		t.Fatalf("hash length = %d, want 64", got)
	}
}
