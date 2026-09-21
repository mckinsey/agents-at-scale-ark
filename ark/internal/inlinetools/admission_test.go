/* Copyright 2025. McKinsey & Company */

package inlinetools

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	authorizationv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

type fakeReviewer struct {
	allowed    bool
	reason     string
	err        error
	block      time.Duration
	namespaces []string
	subjects   []Subject
}

func (f *fakeReviewer) Allowed(ctx context.Context, namespace string, subject Subject) (bool, string, error) {
	f.namespaces = append(f.namespaces, namespace)
	f.subjects = append(f.subjects, subject)
	if f.block > 0 {
		select {
		case <-time.After(f.block):
		case <-ctx.Done():
			return false, "", ctx.Err()
		}
	}
	return f.allowed, f.reason, f.err
}

func tool(namespace string, source string) *arkv1alpha1.Tool {
	return &arkv1alpha1.Tool{
		ObjectMeta: metav1.ObjectMeta{Name: "csv", Namespace: namespace},
		Spec: arkv1alpha1.ToolSpec{
			Type:   arkv1alpha1.ToolTypeInline,
			Inline: &arkv1alpha1.InlineSpec{Source: source, Language: "python"},
		},
	}
}

func alice() *Subject {
	return &Subject{
		Username: "alice",
		UID:      "uid-1",
		Groups:   []string{"team-a"},
		Extra:    map[string]authorizationv1.ExtraValue{"scopes": {"write"}},
	}
}

func enable(t *testing.T) {
	t.Helper()
	t.Setenv(EnabledEnvVar, "true")
}

func TestAdmitIgnoresNonInline(t *testing.T) {
	http := &arkv1alpha1.Tool{Spec: arkv1alpha1.ToolSpec{Type: arkv1alpha1.ToolTypeHTTP}}
	if err := Admit(context.Background(), http, nil, nil, nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestAdmitAllowsAuthorizedAuthor(t *testing.T) {
	enable(t)
	reviewer := &fakeReviewer{allowed: true}
	inline := tool("team-a", "print(1)")

	if err := Admit(context.Background(), inline, nil, alice(), reviewer); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := inline.Annotations[arkv1alpha1.AnnotationInlineAuthoredBy]; got != "alice" {
		t.Fatalf("expected authorship annotation for alice, got %q", got)
	}
	if inline.Annotations[arkv1alpha1.AnnotationInlineAuthoredAt] == "" {
		t.Fatal("expected an authorship timestamp")
	}
	if reviewer.namespaces[0] != "team-a" {
		t.Fatalf("expected the review in team-a, got %q", reviewer.namespaces[0])
	}
	if s := reviewer.subjects[0]; s.UID != "uid-1" || len(s.Groups) != 1 || len(s.Extra) != 1 {
		t.Fatalf("expected the full authenticated identity to be forwarded, got %+v", s)
	}
}

func TestAdmitUsesToolNamespaceForTheReview(t *testing.T) {
	enable(t)
	reviewer := &fakeReviewer{allowed: true}
	if err := Admit(context.Background(), tool("team-b", "print(1)"), nil, alice(), reviewer); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if reviewer.namespaces[0] != "team-b" {
		t.Fatalf("a grant in one namespace must not authorize another: reviewed %q", reviewer.namespaces[0])
	}
}

func TestAdmitDeniesWithoutGrant(t *testing.T) {
	enable(t)
	reviewer := &fakeReviewer{allowed: false, reason: "no binding"}
	err := Admit(context.Background(), tool("team-a", "print(1)"), nil, alice(), reviewer)
	if err == nil || !strings.Contains(err.Error(), "not permitted to author inline tools") {
		t.Fatalf("expected a denial, got %v", err)
	}
}

func TestAdmitFailsClosedOnReviewError(t *testing.T) {
	enable(t)
	reviewer := &fakeReviewer{err: errors.New("apiserver down")}
	if err := Admit(context.Background(), tool("team-a", "print(1)"), nil, alice(), reviewer); err == nil {
		t.Fatal("expected an authorization failure to be fatal")
	}
}

func TestAdmitFailsClosedOnReviewTimeout(t *testing.T) {
	enable(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	reviewer := &fakeReviewer{allowed: true, block: time.Second}
	if err := Admit(ctx, tool("team-a", "print(1)"), nil, alice(), reviewer); err == nil {
		t.Fatal("expected a timed-out review to be fatal")
	}
}

func TestAdmitRequiresIdentity(t *testing.T) {
	enable(t)
	reviewer := &fakeReviewer{allowed: true}
	if err := Admit(context.Background(), tool("team-a", "print(1)"), nil, nil, reviewer); err == nil {
		t.Fatal("expected missing identity to be rejected")
	}
	if err := Admit(context.Background(), tool("team-a", "print(1)"), nil, &Subject{}, reviewer); err == nil {
		t.Fatal("expected an empty username to be rejected")
	}
}

func TestAdmitRequiresReviewer(t *testing.T) {
	enable(t)
	if err := Admit(context.Background(), tool("team-a", "print(1)"), nil, alice(), nil); err == nil {
		t.Fatal("expected a missing authorization backend to be rejected")
	}
}

func TestAdmitRejectsWhenDisabled(t *testing.T) {
	t.Setenv(EnabledEnvVar, "")
	reviewer := &fakeReviewer{allowed: true}
	err := Admit(context.Background(), tool("team-a", "print(1)"), nil, alice(), reviewer)
	if err == nil || !strings.Contains(err.Error(), "disabled") {
		t.Fatalf("expected a disabled-feature rejection, got %v", err)
	}
	if len(reviewer.namespaces) != 0 {
		t.Fatal("expected no review when the feature is disabled")
	}
}

func TestAdmitOverwritesForgedAuthorship(t *testing.T) {
	enable(t)
	inline := tool("team-a", "print(1)")
	inline.Annotations = map[string]string{
		arkv1alpha1.AnnotationInlineAuthoredBy: "root",
		arkv1alpha1.AnnotationInlineAuthoredAt: "1999-01-01T00:00:00Z",
	}
	if err := Admit(context.Background(), inline, nil, alice(), &fakeReviewer{allowed: true}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := inline.Annotations[arkv1alpha1.AnnotationInlineAuthoredBy]; got != "alice" {
		t.Fatalf("expected the submitted author to be replaced, got %q", got)
	}
	if got := inline.Annotations[arkv1alpha1.AnnotationInlineAuthoredAt]; got == "1999-01-01T00:00:00Z" {
		t.Fatal("expected the submitted timestamp to be replaced")
	}
}

func TestAdmitMetadataOnlyUpdateNeedsNoGrant(t *testing.T) {
	enable(t)
	stored := tool("team-a", "print(1)")
	stored.Annotations = map[string]string{
		arkv1alpha1.AnnotationInlineAuthoredBy: "alice",
		arkv1alpha1.AnnotationInlineAuthoredAt: "2024-01-01T00:00:00Z",
	}
	updated := tool("team-a", "print(1)")
	updated.Labels = map[string]string{"team": "a"}

	reviewer := &fakeReviewer{allowed: false}
	if err := Admit(context.Background(), updated, stored, nil, reviewer); err != nil {
		t.Fatalf("a metadata-only update must use ordinary permissions: %v", err)
	}
	if len(reviewer.namespaces) != 0 {
		t.Fatal("expected no author review for a metadata-only update")
	}
	if updated.Annotations[arkv1alpha1.AnnotationInlineAuthoredBy] != "alice" {
		t.Fatal("expected stored authorship to survive a metadata-only update")
	}
	if updated.Annotations[arkv1alpha1.AnnotationInlineAuthoredAt] != "2024-01-01T00:00:00Z" {
		t.Fatal("expected the stored authorship timestamp to survive")
	}
}

func TestAdmitSourceUpdateNeedsGrant(t *testing.T) {
	enable(t)
	stored := tool("team-a", "print(1)")
	updated := tool("team-a", "print(2)")

	reviewer := &fakeReviewer{allowed: false}
	if err := Admit(context.Background(), updated, stored, alice(), reviewer); err == nil {
		t.Fatal("expected a source change to require the author permission")
	}

	allowing := &fakeReviewer{allowed: true}
	if err := Admit(context.Background(), updated, stored, alice(), allowing); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if updated.Annotations[arkv1alpha1.AnnotationInlineAuthoredBy] != "alice" {
		t.Fatal("expected the source change to record its author")
	}
}

func TestAdmitCoversRemovalOfInline(t *testing.T) {
	enable(t)
	stored := tool("team-a", "print(1)")
	converted := &arkv1alpha1.Tool{
		ObjectMeta: metav1.ObjectMeta{Name: "csv", Namespace: "team-a"},
		Spec:       arkv1alpha1.ToolSpec{Type: arkv1alpha1.ToolTypeHTTP},
	}
	if err := Admit(context.Background(), converted, stored, alice(), &fakeReviewer{allowed: false}); err == nil {
		t.Fatal("expected a write that drops inline source to still be gated")
	}
}

func TestAdmitRequiresNamespace(t *testing.T) {
	enable(t)
	if err := Admit(context.Background(), tool("", "print(1)"), nil, alice(), &fakeReviewer{allowed: true}); err == nil {
		t.Fatal("expected a namespaceless inline write to be rejected")
	}
}

func TestEnabledRequiresExplicitTrue(t *testing.T) {
	for _, value := range []string{"", "false", "1", "yes"} {
		t.Setenv(EnabledEnvVar, value)
		if Enabled() {
			t.Fatalf("expected %q not to enable inline authoring", value)
		}
	}
	t.Setenv(EnabledEnvVar, "TRUE")
	if !Enabled() {
		t.Fatal("expected TRUE to enable inline authoring")
	}
}

func TestRejectReviewerDenies(t *testing.T) {
	_, _, err := Reject("authentication disabled").Allowed(context.Background(), "team-a", *alice())
	if err == nil || !strings.Contains(err.Error(), "authentication disabled") {
		t.Fatalf("expected the reject reviewer to error, got %v", err)
	}
}

func TestSARReviewerBuildsTheReview(t *testing.T) {
	var captured *authorizationv1.SubjectAccessReview
	reviewer := &SARReviewer{Create: func(_ context.Context, sar *authorizationv1.SubjectAccessReview, _ metav1.CreateOptions) (*authorizationv1.SubjectAccessReview, error) {
		captured = sar
		return &authorizationv1.SubjectAccessReview{Status: authorizationv1.SubjectAccessReviewStatus{Allowed: true}}, nil
	}}

	allowed, _, err := reviewer.Allowed(context.Background(), "team-a", *alice())
	if err != nil || !allowed {
		t.Fatalf("expected an allow, got allowed=%v err=%v", allowed, err)
	}
	attrs := captured.Spec.ResourceAttributes
	if attrs.Group != AuthGroup || attrs.Resource != AuthResource || attrs.Verb != AuthVerb || attrs.Namespace != "team-a" {
		t.Fatalf("unexpected review attributes: %+v", attrs)
	}
	if captured.Spec.User != "alice" || captured.Spec.UID != "uid-1" {
		t.Fatalf("expected the authenticated subject to be forwarded: %+v", captured.Spec)
	}
}

func TestSARReviewerSurfacesEvaluationError(t *testing.T) {
	reviewer := &SARReviewer{Create: func(_ context.Context, _ *authorizationv1.SubjectAccessReview, _ metav1.CreateOptions) (*authorizationv1.SubjectAccessReview, error) {
		return &authorizationv1.SubjectAccessReview{Status: authorizationv1.SubjectAccessReviewStatus{
			Allowed:         false,
			EvaluationError: "rbac unavailable",
		}}, nil
	}}
	allowed, reason, err := reviewer.Allowed(context.Background(), "team-a", *alice())
	if allowed || err != nil || reason != "rbac unavailable" {
		t.Fatalf("expected a denial carrying the evaluation error, got allowed=%v reason=%q err=%v", allowed, reason, err)
	}
}
