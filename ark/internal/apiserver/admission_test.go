/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"context"
	"errors"
	"fmt"
	"testing"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/watch"
	genericrequest "k8s.io/apiserver/pkg/endpoints/request"
	"k8s.io/apiserver/pkg/registry/rest"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/apiserver/registry"
	"mckinsey.com/ark/internal/storage"
	"mckinsey.com/ark/internal/validation"
)

// --- test doubles ------------------------------------------------------------

type fakeBackend struct {
	objects map[string]runtime.Object
}

func newFakeBackend() *fakeBackend {
	return &fakeBackend{objects: make(map[string]runtime.Object)}
}

func (f *fakeBackend) key(kind, ns, name string) string { return kind + "/" + ns + "/" + name }

func (f *fakeBackend) Create(_ context.Context, kind, ns, name string, obj runtime.Object) error {
	k := f.key(kind, ns, name)
	if _, ok := f.objects[k]; ok {
		return storage.ErrAlreadyExists
	}
	f.objects[k] = obj.DeepCopyObject()
	return nil
}

func (f *fakeBackend) Get(_ context.Context, kind, ns, name string) (runtime.Object, error) {
	obj, ok := f.objects[f.key(kind, ns, name)]
	if !ok {
		return nil, errors.New("not found")
	}
	return obj.DeepCopyObject(), nil
}

func (f *fakeBackend) Update(_ context.Context, kind, ns, name string, obj runtime.Object) error {
	f.objects[f.key(kind, ns, name)] = obj.DeepCopyObject()
	return nil
}

func (f *fakeBackend) List(context.Context, string, string, storage.ListOptions) ([]runtime.Object, string, error) {
	return nil, "", nil
}
func (f *fakeBackend) UpdateStatus(context.Context, string, string, string, runtime.Object) error {
	return nil
}
func (f *fakeBackend) Delete(_ context.Context, kind, ns, name string) error {
	delete(f.objects, f.key(kind, ns, name))
	return nil
}
func (f *fakeBackend) Watch(context.Context, string, string, storage.WatchOptions) (watch.Interface, error) {
	return nil, nil
}
func (f *fakeBackend) GetResourceVersion(context.Context, string, string, string) (int64, error) {
	return 1, nil
}
func (f *fakeBackend) Close() error { return nil }

// nopLookup satisfies validation.ResourceLookup and records the namespace each lookup was
// asked for. The fixture objects reference nothing, so no validator consults it.
type nopLookup struct {
	namespaces []string
}

func (l *nopLookup) GetResource(_ context.Context, kind, namespace, name string) (runtime.Object, error) {
	l.namespaces = append(l.namespaces, namespace)
	return nil, fmt.Errorf("%s %q not found", kind, name)
}

func (l *nopLookup) GetSecret(_ context.Context, namespace, name string) (*corev1.Secret, error) {
	l.namespaces = append(l.namespaces, namespace)
	return nil, fmt.Errorf("secret %q not found", name)
}

func (l *nopLookup) GetConfigMap(_ context.Context, namespace, name string) (*corev1.ConfigMap, error) {
	l.namespaces = append(l.namespaces, namespace)
	return nil, fmt.Errorf("configmap %q not found", name)
}

func newAgentAdmissionStorage(backend storage.Backend) (*AdmissionStorage, *nopLookup) {
	cfg := registry.ResourceConfig{
		Kind: "Agent", Resource: "agents", SingularName: "agent",
		NewFunc:     func() runtime.Object { return &arkv1alpha1.Agent{} },
		NewListFunc: func() runtime.Object { return &arkv1alpha1.AgentList{} },
	}
	inner := registry.NewGenericStorage(backend, NewRegistryTypeConverter(), cfg, GetPrinterColumnRegistry())
	lookup := &nopLookup{}
	return NewAdmissionStorage(inner, validation.NewValidator(lookup)), lookup
}

func agent(name string) *arkv1alpha1.Agent {
	return &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{Name: name},
		Spec:       arkv1alpha1.AgentSpec{Prompt: "you are helpful"},
	}
}

// getNamespace reads RequestInfo, not the WithNamespace key.
func contextForNamespace(ns string) context.Context {
	return genericrequest.WithRequestInfo(context.Background(), &genericrequest.RequestInfo{
		Namespace: ns,
		Resource:  "agents",
		APIGroup:  arkv1alpha1.GroupVersion.Group,
	})
}

// --- tests -------------------------------------------------------------------

// Guards the original bug: nil was passed in place of createValidation, silently disabling
// every ValidatingAdmissionPolicy and validating webhook.
func TestAdmissionStorage_Create_ForwardsAdmissionCallback(t *testing.T) {
	t.Parallel()

	s, _ := newAgentAdmissionStorage(newFakeBackend())
	ctx := contextForNamespace("team-a")

	called := 0
	spy := rest.ValidateObjectFunc(func(_ context.Context, _ runtime.Object) error {
		called++
		return nil
	})

	if _, err := s.Create(ctx, agent("a1"), spy, &metav1.CreateOptions{}); err != nil {
		t.Fatalf("create: %v", err)
	}
	if called != 1 {
		t.Errorf("admission callback called %d times, want 1", called)
	}
}

func TestAdmissionStorage_Create_RejectionBlocksTheWrite(t *testing.T) {
	t.Parallel()

	backend := newFakeBackend()
	s, _ := newAgentAdmissionStorage(backend)
	ctx := contextForNamespace("team-a")

	denied := errors.New("denied by policy")
	spy := rest.ValidateObjectFunc(func(_ context.Context, _ runtime.Object) error { return denied })

	_, err := s.Create(ctx, agent("a1"), spy, &metav1.CreateOptions{})
	if !errors.Is(err, denied) {
		t.Fatalf("expected the policy rejection to surface, got %v", err)
	}
	if len(backend.objects) != 0 {
		t.Errorf("expected nothing persisted after a rejection, got %d objects", len(backend.objects))
	}
}

// Guards the ordering defect: admission ran before namespace/uid/creationTimestamp were
// populated, so a policy reading object.metadata.* saw empty strings.
func TestAdmissionStorage_Create_AdmissionSeesFullyFormedObject(t *testing.T) {
	t.Parallel()

	s, _ := newAgentAdmissionStorage(newFakeBackend())
	ctx := contextForNamespace("team-a")

	var seen metav1.Object
	spy := rest.ValidateObjectFunc(func(_ context.Context, obj runtime.Object) error {
		a, err := meta.Accessor(obj)
		if err != nil {
			return err
		}
		seen = a
		return nil
	})

	if _, err := s.Create(ctx, agent("a1"), spy, &metav1.CreateOptions{}); err != nil {
		t.Fatalf("create: %v", err)
	}
	if seen == nil {
		t.Fatal("admission callback was never invoked")
	}
	if got := seen.GetName(); got != "a1" {
		t.Errorf("name = %q, want %q", got, "a1")
	}
	if got := seen.GetNamespace(); got != "team-a" {
		t.Errorf("namespace = %q, want %q (policies keyed on namespace match nothing when empty)", got, "team-a")
	}
	if seen.GetUID() == "" {
		t.Error("uid is empty; a policy reading object.metadata.uid would match nothing")
	}
	if ts := seen.GetCreationTimestamp(); ts.IsZero() {
		t.Error("creationTimestamp is zero; a policy reading it would match nothing")
	}
}

// generateName is the sharpest case: the name is server-chosen, so admission running too
// early saw "" and any naming-convention policy passed.
func TestAdmissionStorage_Create_AdmissionSeesGeneratedName(t *testing.T) {
	t.Parallel()

	s, _ := newAgentAdmissionStorage(newFakeBackend())
	ctx := contextForNamespace("team-a")

	obj := agent("")
	obj.GenerateName = "probe-"

	var seenName string
	spy := rest.ValidateObjectFunc(func(_ context.Context, o runtime.Object) error {
		a, err := meta.Accessor(o)
		if err != nil {
			return err
		}
		seenName = a.GetName()
		return nil
	})

	out, err := s.Create(ctx, obj, spy, &metav1.CreateOptions{})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if seenName == "" {
		t.Fatal("admission saw an empty name; a naming-convention policy could never reject")
	}
	stored, err := meta.Accessor(out)
	if err != nil {
		t.Fatal(err)
	}
	if seenName != stored.GetName() {
		t.Errorf("admission saw name %q but %q was stored; policy judged a different object", seenName, stored.GetName())
	}
}

func TestAdmissionStorage_Update_ForwardsAdmissionCallback(t *testing.T) {
	t.Parallel()

	backend := newFakeBackend()
	s, _ := newAgentAdmissionStorage(backend)
	ctx := contextForNamespace("team-a")

	created, err := s.Create(ctx, agent("a1"), nil, &metav1.CreateOptions{})
	if err != nil {
		t.Fatalf("seed create: %v", err)
	}
	createdAcc, _ := meta.Accessor(created)

	called := 0
	updateValidation := rest.ValidateObjectUpdateFunc(func(_ context.Context, _, _ runtime.Object) error {
		called++
		return nil
	})

	next := agent("a1")
	next.Namespace = "team-a"
	next.ResourceVersion = createdAcc.GetResourceVersion()
	next.Spec.Prompt = "updated"

	if _, _, err := s.Update(ctx, "a1", rest.DefaultUpdatedObjectInfo(next), nil, updateValidation, false, &metav1.UpdateOptions{}); err != nil {
		t.Fatalf("update: %v", err)
	}
	if called != 1 {
		t.Errorf("update admission callback called %d times, want 1", called)
	}
}

// A PUT body omitting uid/creationTimestamp must not let a client dodge a policy keyed on them.
func TestAdmissionStorage_Update_AdmissionSeesPreservedIdentity(t *testing.T) {
	t.Parallel()

	backend := newFakeBackend()
	s, _ := newAgentAdmissionStorage(backend)
	ctx := contextForNamespace("team-a")

	created, err := s.Create(ctx, agent("a1"), nil, &metav1.CreateOptions{})
	if err != nil {
		t.Fatalf("seed create: %v", err)
	}
	createdAcc, _ := meta.Accessor(created)

	var seen metav1.Object
	updateValidation := rest.ValidateObjectUpdateFunc(func(_ context.Context, obj, _ runtime.Object) error {
		a, err := meta.Accessor(obj)
		if err != nil {
			return err
		}
		seen = a
		return nil
	})

	// Deliberately omit uid and creationTimestamp, as a hand-written PUT would.
	next := agent("a1")
	next.Namespace = "team-a"
	next.ResourceVersion = createdAcc.GetResourceVersion()

	if _, _, err := s.Update(ctx, "a1", rest.DefaultUpdatedObjectInfo(next), nil, updateValidation, false, &metav1.UpdateOptions{}); err != nil {
		t.Fatalf("update: %v", err)
	}
	if seen == nil {
		t.Fatal("update admission callback was never invoked")
	}
	if seen.GetUID() != createdAcc.GetUID() {
		t.Errorf("uid = %q, want the stored %q", seen.GetUID(), createdAcc.GetUID())
	}
	if ts := seen.GetCreationTimestamp(); ts.IsZero() {
		t.Error("creationTimestamp was blanked out by the client's PUT body")
	}
}

// Both AdmissionStorage.Create and GenericStorage.Create call it.
func TestPrepareForCreate_Idempotent(t *testing.T) {
	t.Parallel()

	ctx := contextForNamespace("team-a")
	obj := agent("a1")

	if err := registry.PrepareForCreate(ctx, obj); err != nil {
		t.Fatal(err)
	}
	firstUID, firstTS := obj.GetUID(), obj.GetCreationTimestamp()

	if err := registry.PrepareForCreate(ctx, obj); err != nil {
		t.Fatal(err)
	}
	if obj.GetUID() != firstUID {
		t.Errorf("uid changed on second call: %q -> %q", firstUID, obj.GetUID())
	}
	if secondTS := obj.GetCreationTimestamp(); !secondTS.Equal(&firstTS) {
		t.Error("creationTimestamp changed on second call")
	}
	if obj.GetNamespace() != "team-a" {
		t.Errorf("namespace = %q, want team-a", obj.GetNamespace())
	}
}

func TestPrepareForCreate_DoesNotOverrideExplicitNamespace(t *testing.T) {
	t.Parallel()

	ctx := contextForNamespace("from-context")
	obj := agent("a1")
	obj.Namespace = "explicit"

	if err := registry.PrepareForCreate(ctx, obj); err != nil {
		t.Fatal(err)
	}
	if obj.GetNamespace() != "explicit" {
		t.Errorf("namespace = %q, want %q", obj.GetNamespace(), "explicit")
	}
}
