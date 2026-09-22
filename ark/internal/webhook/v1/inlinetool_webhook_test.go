/* Copyright 2025. McKinsey & Company */

package v1

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	admissionv1 "k8s.io/api/admission/v1"
	authenticationv1 "k8s.io/api/authentication/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/webhook/admission"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/inlinetools"
)

type stubReviewer struct {
	allowed   bool
	namespace string
}

func (s *stubReviewer) Allowed(_ context.Context, namespace string, _ inlinetools.Subject) (bool, string, error) {
	s.namespace = namespace
	return s.allowed, "", nil
}

func newHandler(t *testing.T, allowed bool) (*inlineToolHandler, *stubReviewer) {
	t.Helper()
	scheme := runtime.NewScheme()
	if err := arkv1alpha1.AddToScheme(scheme); err != nil {
		t.Fatalf("failed to build scheme: %v", err)
	}
	reviewer := &stubReviewer{allowed: allowed}
	return &inlineToolHandler{decoder: admission.NewDecoder(scheme), reviewer: reviewer}, reviewer
}

func inlineToolRequest(t *testing.T, tool *arkv1alpha1.Tool, labels map[string]string) admission.Request {
	t.Helper()
	tool.Labels = labels
	raw, err := json.Marshal(tool)
	if err != nil {
		t.Fatalf("failed to marshal tool: %v", err)
	}
	return admission.Request{AdmissionRequest: admissionv1.AdmissionRequest{
		Operation: admissionv1.Create,
		Namespace: "team-a",
		Object:    runtime.RawExtension{Raw: raw},
		UserInfo:  authenticationv1.UserInfo{Username: "alice", UID: "uid-1", Groups: []string{"team-a"}},
	}}
}

func inlineFixture() *arkv1alpha1.Tool {
	return &arkv1alpha1.Tool{
		TypeMeta:   metav1.TypeMeta{APIVersion: "ark.mckinsey.com/v1alpha1", Kind: "Tool"},
		ObjectMeta: metav1.ObjectMeta{Name: "csv", Namespace: "team-a"},
		Spec: arkv1alpha1.ToolSpec{
			Type:   arkv1alpha1.ToolTypeInline,
			Inline: &arkv1alpha1.InlineSpec{Source: "print(1)", Language: "python"},
		},
	}
}

func TestInlineWebhookStampsAuthorship(t *testing.T) {
	t.Setenv(inlinetools.EnabledEnvVar, "true")
	handler, _ := newHandler(t, true)

	resp := handler.Handle(context.Background(), inlineToolRequest(t, inlineFixture(), nil))
	if !resp.Allowed {
		t.Fatalf("expected the write to be allowed: %v", resp.Result)
	}
	var patchedAuthor bool
	for _, p := range resp.Patches {
		if strings.Contains(p.Path, "inline-authored-by") || strings.Contains(p.Path, "annotations") {
			patchedAuthor = true
		}
	}
	if !patchedAuthor {
		t.Fatalf("expected an authorship patch, got %+v", resp.Patches)
	}
}

func TestInlineWebhookDeniesWithoutGrant(t *testing.T) {
	t.Setenv(inlinetools.EnabledEnvVar, "true")
	handler, _ := newHandler(t, false)

	resp := handler.Handle(context.Background(), inlineToolRequest(t, inlineFixture(), nil))
	if resp.Allowed {
		t.Fatal("expected the write to be denied")
	}
}

func TestInlineWebhookIgnoresSkipLabel(t *testing.T) {
	t.Setenv(inlinetools.EnabledEnvVar, "true")
	handler, _ := newHandler(t, false)

	labels := map[string]string{"ark.mckinsey.com/skip-webhook-validation": "true"}
	resp := handler.Handle(context.Background(), inlineToolRequest(t, inlineFixture(), labels))
	if resp.Allowed {
		t.Fatal("the skip label must not bypass the inline security gate")
	}
}

func TestInlineWebhookUsesRequestNamespace(t *testing.T) {
	t.Setenv(inlinetools.EnabledEnvVar, "true")
	handler, reviewer := newHandler(t, true)

	resp := handler.Handle(context.Background(), inlineToolRequest(t, inlineFixture(), nil))
	if !resp.Allowed {
		t.Fatalf("expected the write to be allowed: %v", resp.Result)
	}
	if reviewer.namespace != "team-a" {
		t.Fatalf("expected the review in the request namespace, got %q", reviewer.namespace)
	}
}

func TestInlineWebhookDeniesNamespaceMismatch(t *testing.T) {
	t.Setenv(inlinetools.EnabledEnvVar, "true")
	handler, reviewer := newHandler(t, true)

	tool := inlineFixture()
	tool.Namespace = "team-b" // body claims another namespace
	resp := handler.Handle(context.Background(), inlineToolRequest(t, tool, nil))
	if resp.Allowed {
		t.Fatal("expected a namespace mismatch to be rejected, not silently rewritten")
	}
	if reviewer.namespace != "" {
		t.Fatalf("expected no review for a rejected request, got %q", reviewer.namespace)
	}
	if msg := resp.Result.Message; !strings.Contains(msg, "does not match request namespace") {
		t.Fatalf("expected an explicit mismatch message, got %q", msg)
	}
}

func TestInlineWebhookDeniesWhenDisabled(t *testing.T) {
	t.Setenv(inlinetools.EnabledEnvVar, "false")
	handler, _ := newHandler(t, true)

	resp := handler.Handle(context.Background(), inlineToolRequest(t, inlineFixture(), nil))
	if resp.Allowed {
		t.Fatal("expected inline authoring to be rejected while disabled")
	}
}

func TestInlineWebhookAllowsNonInlineTools(t *testing.T) {
	t.Setenv(inlinetools.EnabledEnvVar, "false")
	handler, reviewer := newHandler(t, false)

	http := &arkv1alpha1.Tool{
		TypeMeta:   metav1.TypeMeta{APIVersion: "ark.mckinsey.com/v1alpha1", Kind: "Tool"},
		ObjectMeta: metav1.ObjectMeta{Name: "fetch", Namespace: "team-a"},
		Spec: arkv1alpha1.ToolSpec{
			Type: arkv1alpha1.ToolTypeHTTP,
			HTTP: &arkv1alpha1.HTTPSpec{URL: "https://example.com"},
		},
	}
	resp := handler.Handle(context.Background(), inlineToolRequest(t, http, nil))
	if !resp.Allowed {
		t.Fatalf("expected non-inline tools to be unaffected: %v", resp.Result)
	}
	if reviewer.namespace != "" {
		t.Fatal("expected no author review for a non-inline tool")
	}
}
