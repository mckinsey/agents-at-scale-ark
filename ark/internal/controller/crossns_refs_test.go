package controller

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"sigs.k8s.io/controller-runtime/pkg/client/interceptor"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/crossns"
)

func crossNamespaceScheme() *runtime.Scheme {
	s := runtime.NewScheme()
	_ = arkv1alpha1.AddToScheme(s)
	return s
}

func availableModel(namespace, name string, annotations map[string]string) *arkv1alpha1.Model {
	model := &arkv1alpha1.Model{ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: namespace, Annotations: annotations}}
	meta.SetStatusCondition(&model.Status.Conditions, metav1.Condition{Type: "ModelAvailable", Status: metav1.ConditionTrue, Reason: "Available"})
	return model
}

func TestCheckModelDependencyCrossNamespace(t *testing.T) {
	fc := fake.NewClientBuilder().WithScheme(crossNamespaceScheme()).WithObjects(
		availableModel("tenant-b", "closed", nil),
		availableModel("tenant-b", "open", map[string]string{crossns.AllowedNamespacesAnnotation: "tenant-a"}),
	).Build()
	r := &AgentReconciler{Client: fc}

	agentFor := func(model string) *arkv1alpha1.Agent {
		return &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "ag", Namespace: "tenant-a"},
			Spec:       arkv1alpha1.AgentSpec{ModelRef: &arkv1alpha1.AgentModelRef{Name: model, Namespace: "tenant-b"}},
		}
	}

	for _, model := range []string{"closed", "missing"} {
		t.Run("not usable: "+model, func(t *testing.T) {
			reason, message, lookupErr := r.checkModelDependency(context.Background(), agentFor(model))
			require.NoError(t, lookupErr)
			assert.Equal(t, reasonModelNotFound, reason)
			assert.Equal(t, crossns.DeniedError("Model", "tenant-b", model, "tenant-a").Error(), message)
		})
	}

	t.Run("usable when allowed", func(t *testing.T) {
		reason, message, lookupErr := r.checkModelDependency(context.Background(), agentFor("open"))
		require.NoError(t, lookupErr)
		assert.Empty(t, reason)
		assert.Empty(t, message)
	})
}

func TestCheckModelDependencyCrossNamespaceTransientError(t *testing.T) {
	fc := fake.NewClientBuilder().WithScheme(crossNamespaceScheme()).WithInterceptorFuncs(interceptor.Funcs{
		Get: func(context.Context, client.WithWatch, client.ObjectKey, client.Object, ...client.GetOption) error {
			return errors.New("connection refused")
		},
	}).Build()
	r := &AgentReconciler{Client: fc}
	agent := &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{Name: "ag", Namespace: "tenant-a"},
		Spec:       arkv1alpha1.AgentSpec{ModelRef: &arkv1alpha1.AgentModelRef{Name: "m", Namespace: "tenant-b"}},
	}

	reason, message, lookupErr := r.checkModelDependency(context.Background(), agent)
	require.Error(t, lookupErr)
	assert.Equal(t, reasonModelNotFound, reason)
	assert.Equal(t, crossns.DeniedError("Model", "tenant-b", "m", "tenant-a").Error(), message)
}

func TestDeleteBrokerMessages_CrossNamespaceMemory(t *testing.T) {
	cases := []struct {
		name        string
		annotations map[string]string
		wantCall    bool
	}{
		{name: "skips a memory that does not allow the query namespace", wantCall: false},
		{name: "cleans up a memory that allows the query namespace", annotations: map[string]string{crossns.AllowedNamespacesAnnotation: "tenant-a"}, wantCall: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv, capturedMethod, _ := makeBrokerServer(t, http.StatusOK)
			memory := memoryWithAddress("shared", srv.URL)
			memory.Namespace = "tenant-b"
			memory.Annotations = tc.annotations
			fc := fake.NewClientBuilder().WithScheme(crossNamespaceScheme()).WithObjects([]client.Object{memory}...).Build()

			r := &QueryReconciler{Client: fc}
			query := &arkv1alpha1.Query{
				ObjectMeta: metav1.ObjectMeta{Name: "my-query", Namespace: "tenant-a"},
				Spec:       arkv1alpha1.QuerySpec{Memory: &arkv1alpha1.MemoryRef{Name: "shared", Namespace: "tenant-b"}},
			}

			require.NoError(t, r.deleteBrokerMessages(context.Background(), query))
			if tc.wantCall {
				assert.Equal(t, http.MethodDelete, *capturedMethod)
			} else {
				assert.Empty(t, *capturedMethod)
			}
		})
	}
}
