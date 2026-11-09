package apiserver

import (
	"context"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apiserver/pkg/registry/rest"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/crossns"
)

func seedCrossNamespaceObject(t *testing.T, backend *fakeBackend, kind string, obj runtime.Object) {
	t.Helper()
	if err := backend.Create(context.Background(), kind, nsTeamA, "seeded", obj); err != nil {
		t.Fatalf("seed: %v", err)
	}
}

func updateWith(t *testing.T, s *AdmissionStorage, obj runtime.Object) error {
	t.Helper()
	_, _, err := s.Update(contextForNamespace(nsTeamA), "seeded", rest.DefaultUpdatedObjectInfo(obj), nil, nil, false, &metav1.UpdateOptions{})
	return err
}

func TestAdmissionStorage_Update_CrossNamespaceModelRefCheckedOnlyWhenChanged(t *testing.T) {
	t.Parallel()

	backend := newFakeBackend()
	s := newAgentAdmissionStorage(backend)
	stored := &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{Name: "seeded", Namespace: nsTeamA, UID: "uid-1", ResourceVersion: "1"},
		Spec:       arkv1alpha1.AgentSpec{Prompt: "p", ModelRef: &arkv1alpha1.AgentModelRef{Name: "closed", Namespace: "tenant-b"}},
	}
	seedCrossNamespaceObject(t, backend, "Agent", stored)

	unchanged := stored.DeepCopy()
	unchanged.Labels = map[string]string{"touched": "true"}
	if err := updateWith(t, s, unchanged); err != nil {
		t.Fatalf("update with unchanged modelRef: %v", err)
	}

	retargeted := stored.DeepCopy()
	retargeted.Spec.ModelRef.Name = "other"
	err := updateWith(t, s, retargeted)
	want := crossns.DeniedError("Model", "tenant-b", "other", nsTeamA).Error()
	if err == nil || err.Error() != want {
		t.Fatalf("update with changed modelRef: err = %v, want %q", err, want)
	}
}

func TestAdmissionStorage_Update_CrossNamespaceMemoryCheckedOnlyWhenChanged(t *testing.T) {
	t.Parallel()

	backend := newFakeBackend()
	s := newQueryAdmissionStorage(backend, nil)
	stored := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "seeded", Namespace: nsTeamA, UID: "uid-1", ResourceVersion: "1"},
		Spec: arkv1alpha1.QuerySpec{
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "x"}},
			Memory:   &arkv1alpha1.MemoryRef{Name: "closed", Namespace: "tenant-b"},
		},
	}
	if err := stored.Spec.SetInputString("hi"); err != nil {
		t.Fatal(err)
	}
	seedCrossNamespaceObject(t, backend, "Query", stored)

	unchanged := stored.DeepCopy()
	unchanged.Labels = map[string]string{"touched": "true"}
	if err := updateWith(t, s, unchanged); err != nil {
		t.Fatalf("update with unchanged memory: %v", err)
	}

	retargeted := stored.DeepCopy()
	retargeted.Spec.Memory.Name = "other"
	err := updateWith(t, s, retargeted)
	want := crossns.DeniedError("Memory", "tenant-b", "other", nsTeamA).Error()
	if err == nil || err.Error() != want {
		t.Fatalf("update with changed memory: err = %v, want %q", err, want)
	}
}
