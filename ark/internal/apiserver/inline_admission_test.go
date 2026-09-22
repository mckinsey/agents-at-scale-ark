/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"context"
	"strings"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apiserver/pkg/authentication/user"
	genericrequest "k8s.io/apiserver/pkg/endpoints/request"
	"k8s.io/apiserver/pkg/registry/rest"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/apiserver/registry"
	"mckinsey.com/ark/internal/inlinetools"
	"mckinsey.com/ark/internal/storage"
	"mckinsey.com/ark/internal/validation"
)

type toolReviewer struct {
	allowed    bool
	namespaces []string
	subjects   []string
}

func (r *toolReviewer) Allowed(_ context.Context, namespace string, subject inlinetools.Subject) (bool, string, error) {
	r.namespaces = append(r.namespaces, namespace)
	r.subjects = append(r.subjects, subject.Username)
	return r.allowed, "", nil
}

func newToolAdmissionStorage(backend storage.Backend, reviewer inlinetools.Reviewer) *AdmissionStorage {
	cfg := registry.ResourceConfig{
		Kind: "Tool", Resource: "tools", SingularName: "tool",
		NewFunc:     func() runtime.Object { return &arkv1alpha1.Tool{} },
		NewListFunc: func() runtime.Object { return &arkv1alpha1.ToolList{} },
	}
	inner := registry.NewGenericStorage(backend, NewRegistryTypeConverter(), cfg, GetPrinterColumnRegistry())
	return NewAdmissionStorage(inner, validation.NewValidator(&nopLookup{}), nil, reviewer)
}

func inlineToolObject(name, source string) *arkv1alpha1.Tool {
	return &arkv1alpha1.Tool{
		ObjectMeta: metav1.ObjectMeta{Name: name},
		Spec: arkv1alpha1.ToolSpec{
			Type:        "inline",
			Description: "count rows",
			Inline:      &arkv1alpha1.InlineSpec{Source: source, Language: "python"},
		},
	}
}

func toolContext(ns string, username string) context.Context {
	ctx := genericrequest.WithRequestInfo(context.Background(), &genericrequest.RequestInfo{
		Namespace: ns,
		Resource:  "tools",
		APIGroup:  arkv1alpha1.GroupVersion.Group,
	})
	if username != "" {
		ctx = genericrequest.WithUser(ctx, &user.DefaultInfo{Name: username, UID: "uid-1", Groups: []string{"team-a"}})
	}
	return ctx
}

func noopValidation() rest.ValidateObjectFunc {
	return func(context.Context, runtime.Object) error { return nil }
}

func TestInlineCreate_AllowedAuthorIsRecorded(t *testing.T) {
	t.Setenv(inlinetools.EnabledEnvVar, "true")
	backend := newFakeBackend()
	reviewer := &toolReviewer{allowed: true}
	s := newToolAdmissionStorage(backend, reviewer)

	obj, err := s.Create(toolContext(nsTeamA, "alice"), inlineToolObject("csv", "print(1)"), noopValidation(), &metav1.CreateOptions{})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	created, ok := obj.(*arkv1alpha1.Tool)
	if !ok {
		t.Fatalf("unexpected object %T", obj)
	}
	if created.Annotations[arkv1alpha1.AnnotationInlineAuthoredBy] != "alice" {
		t.Fatalf("expected the admitted author to be recorded, got %v", created.Annotations)
	}
	if len(reviewer.namespaces) != 1 || reviewer.namespaces[0] != nsTeamA {
		t.Fatalf("expected one review in %q, got %v", nsTeamA, reviewer.namespaces)
	}
	if reviewer.subjects[0] != "alice" {
		t.Fatalf("expected the request user to be reviewed, got %q", reviewer.subjects[0])
	}
}

func TestInlineCreate_DeniedWriteIsNotPersisted(t *testing.T) {
	t.Setenv(inlinetools.EnabledEnvVar, "true")
	backend := newFakeBackend()
	s := newToolAdmissionStorage(backend, &toolReviewer{allowed: false})

	_, err := s.Create(toolContext(nsTeamA, "alice"), inlineToolObject("csv", "print(1)"), noopValidation(), &metav1.CreateOptions{})
	if err == nil {
		t.Fatal("expected the create to be denied")
	}
	if len(backend.objects) != 0 {
		t.Fatalf("expected nothing persisted, got %d objects", len(backend.objects))
	}
}

func TestInlineCreate_RequiresAuthenticatedIdentity(t *testing.T) {
	t.Setenv(inlinetools.EnabledEnvVar, "true")
	s := newToolAdmissionStorage(newFakeBackend(), &toolReviewer{allowed: true})

	_, err := s.Create(toolContext(nsTeamA, ""), inlineToolObject("csv", "print(1)"), noopValidation(), &metav1.CreateOptions{})
	if err == nil || !strings.Contains(err.Error(), "authenticated user identity") {
		t.Fatalf("expected a missing-identity rejection, got %v", err)
	}
}

func TestInlineCreate_RejectedWhenDisabled(t *testing.T) {
	t.Setenv(inlinetools.EnabledEnvVar, "false")
	s := newToolAdmissionStorage(newFakeBackend(), &toolReviewer{allowed: true})

	_, err := s.Create(toolContext(nsTeamA, "alice"), inlineToolObject("csv", "print(1)"), noopValidation(), &metav1.CreateOptions{})
	if err == nil || !strings.Contains(err.Error(), "disabled") {
		t.Fatalf("expected a disabled-feature rejection, got %v", err)
	}
}

func TestInlineCreate_RejectedWithoutAuthorizationBackend(t *testing.T) {
	t.Setenv(inlinetools.EnabledEnvVar, "true")
	// What an authentication-disabled aggregated apiserver installs.
	s := newToolAdmissionStorage(newFakeBackend(), inlinetools.Reject("authentication is disabled"))

	_, err := s.Create(toolContext(nsTeamA, "alice"), inlineToolObject("csv", "print(1)"), noopValidation(), &metav1.CreateOptions{})
	if err == nil || !strings.Contains(err.Error(), "authentication is disabled") {
		t.Fatalf("expected the reject reviewer's reason to surface, got %v", err)
	}
}

func TestInlineCreate_BodyNamespaceCannotMoveTheCheck(t *testing.T) {
	t.Setenv(inlinetools.EnabledEnvVar, "true")
	reviewer := &toolReviewer{allowed: true}
	s := newToolAdmissionStorage(newFakeBackend(), reviewer)

	tool := inlineToolObject("csv", "print(1)")
	tool.Namespace = "team-b"
	_, err := s.Create(toolContext(nsTeamA, "alice"), tool, noopValidation(), &metav1.CreateOptions{})
	if err == nil || !strings.Contains(err.Error(), "does not match request namespace") {
		t.Fatalf("expected a namespace mismatch rejection, got %v", err)
	}
}

func TestNonInlineToolIsUnaffected(t *testing.T) {
	t.Setenv(inlinetools.EnabledEnvVar, "false")
	reviewer := &toolReviewer{allowed: false}
	s := newToolAdmissionStorage(newFakeBackend(), reviewer)

	http := &arkv1alpha1.Tool{
		ObjectMeta: metav1.ObjectMeta{Name: "fetch"},
		Spec: arkv1alpha1.ToolSpec{
			Type: "http",
			HTTP: &arkv1alpha1.HTTPSpec{URL: "https://example.com", Method: "GET"},
		},
	}
	if _, err := s.Create(toolContext(nsTeamA, "alice"), http, noopValidation(), &metav1.CreateOptions{}); err != nil {
		t.Fatalf("expected non-inline creation to be unaffected: %v", err)
	}
	if len(reviewer.namespaces) != 0 {
		t.Fatal("expected no author review for a non-inline tool")
	}
}

type toolUpdate struct {
	obj *arkv1alpha1.Tool
}

func (u toolUpdate) Preconditions() *metav1.Preconditions { return nil }
func (u toolUpdate) UpdatedObject(_ context.Context, _ runtime.Object) (runtime.Object, error) {
	return u.obj.DeepCopy(), nil
}

func storeInlineTool(t *testing.T, s *AdmissionStorage, ctx context.Context) *arkv1alpha1.Tool {
	t.Helper()
	obj, err := s.Create(ctx, inlineToolObject("csv", "print(1)"), noopValidation(), &metav1.CreateOptions{})
	if err != nil {
		t.Fatalf("seed create: %v", err)
	}
	return obj.(*arkv1alpha1.Tool)
}

func TestInlineUpdate_SourceChangeRequiresTheGrant(t *testing.T) {
	t.Setenv(inlinetools.EnabledEnvVar, "true")
	ctx := toolContext(nsTeamA, "alice")
	reviewer := &toolReviewer{allowed: true}
	s := newToolAdmissionStorage(newFakeBackend(), reviewer)
	stored := storeInlineTool(t, s, ctx)

	edited := stored.DeepCopy()
	edited.Spec.Inline.Source = "print(2)"

	reviewer.allowed = false
	_, _, err := s.Update(ctx, "csv", toolUpdate{obj: edited}, noopValidation(), func(context.Context, runtime.Object, runtime.Object) error { return nil }, false, &metav1.UpdateOptions{})
	if err == nil {
		t.Fatal("expected a source change to require the author permission")
	}
}

func TestInlineUpdate_MetadataOnlyKeepsAuthorship(t *testing.T) {
	t.Setenv(inlinetools.EnabledEnvVar, "true")
	ctx := toolContext(nsTeamA, "alice")
	reviewer := &toolReviewer{allowed: true}
	s := newToolAdmissionStorage(newFakeBackend(), reviewer)
	stored := storeInlineTool(t, s, ctx)

	labelled := stored.DeepCopy()
	labelled.Labels = map[string]string{"team": "a"}
	delete(labelled.Annotations, arkv1alpha1.AnnotationInlineAuthoredBy)
	delete(labelled.Annotations, arkv1alpha1.AnnotationInlineAuthoredAt)

	reviewer.allowed = false
	obj, _, err := s.Update(ctx, "csv", toolUpdate{obj: labelled}, noopValidation(), func(context.Context, runtime.Object, runtime.Object) error { return nil }, false, &metav1.UpdateOptions{})
	if err != nil {
		t.Fatalf("a metadata-only update must not need the author permission: %v", err)
	}
	updated := obj.(*arkv1alpha1.Tool)
	if updated.Annotations[arkv1alpha1.AnnotationInlineAuthoredBy] != "alice" {
		t.Fatalf("expected stored authorship to survive, got %v", updated.Annotations)
	}
}

func TestInlineUpdate_TypeConversionIsRejected(t *testing.T) {
	t.Setenv(inlinetools.EnabledEnvVar, "true")
	ctx := toolContext(nsTeamA, "alice")
	s := newToolAdmissionStorage(newFakeBackend(), &toolReviewer{allowed: true})
	stored := storeInlineTool(t, s, ctx)

	converted := stored.DeepCopy()
	converted.Spec.Type = "http"
	converted.Spec.Inline = nil
	converted.Spec.HTTP = &arkv1alpha1.HTTPSpec{URL: "https://example.com", Method: "GET"}

	_, _, err := s.Update(ctx, "csv", toolUpdate{obj: converted}, noopValidation(), func(context.Context, runtime.Object, runtime.Object) error { return nil }, false, &metav1.UpdateOptions{})
	if err == nil || !strings.Contains(err.Error(), "delete and recreate") {
		t.Fatalf("expected delete/recreate guidance, got %v", err)
	}
}
