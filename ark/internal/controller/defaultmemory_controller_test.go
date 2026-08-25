/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"sigs.k8s.io/controller-runtime/pkg/client/interceptor"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/labels"
)

func defaultMemorySchemeWithCore() *runtime.Scheme {
	s := runtime.NewScheme()
	_ = arkv1alpha1.AddToScheme(s)
	_ = corev1.AddToScheme(s)
	return s
}

func brokerConfigMap(name, namespace string, enabled bool) *corev1.ConfigMap {
	value := "false"
	if enabled {
		value = "true"
	}
	return &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: namespace},
		Data: map[string]string{
			"enabled":    value,
			"serviceRef": "name: \"ark-broker\"\nport: \"http\"",
		},
	}
}

func reconcileRequest(cmName, namespace string) ctrl.Request {
	return ctrl.Request{NamespacedName: types.NamespacedName{Name: cmName, Namespace: namespace}}
}

func TestDefaultMemoryReconciler_CreatesWhenAbsent(t *testing.T) {
	cm := brokerConfigMap("ark-config-broker", "tenant-a", true)
	c := fake.NewClientBuilder().WithScheme(defaultMemorySchemeWithCore()).WithObjects(cm).Build()
	r := &DefaultMemoryReconciler{Client: c, Scheme: c.Scheme(), AutoProvision: true}

	_, err := r.Reconcile(context.Background(), reconcileRequest("ark-config-broker", "tenant-a"))
	require.NoError(t, err)

	var mem arkv1alpha1.Memory
	require.NoError(t, c.Get(context.Background(), types.NamespacedName{Name: defaultMemoryName, Namespace: "tenant-a"}, &mem))

	require.NotNil(t, mem.Spec.Address.ValueFrom)
	require.NotNil(t, mem.Spec.Address.ValueFrom.ServiceRef)
	assert.Equal(t, "ark-broker", mem.Spec.Address.ValueFrom.ServiceRef.Name)
	assert.Equal(t, "tenant-a", mem.Spec.Address.ValueFrom.ServiceRef.Namespace)
	assert.Equal(t, "http", mem.Spec.Address.ValueFrom.ServiceRef.Port)
	assert.Equal(t, labels.ManagedByController, mem.Labels[labels.ManagedBy])

	require.Len(t, mem.OwnerReferences, 1)
	owner := mem.OwnerReferences[0]
	assert.Equal(t, "ark-config-broker", owner.Name)
	assert.Equal(t, "ConfigMap", owner.Kind)
	require.NotNil(t, owner.Controller)
	assert.True(t, *owner.Controller)
}

func TestDefaultMemoryReconciler_UsesStreamingConfigMapWhenBrokerAbsent(t *testing.T) {
	cm := brokerConfigMap("ark-config-streaming", "tenant-a", true)
	c := fake.NewClientBuilder().WithScheme(defaultMemorySchemeWithCore()).WithObjects(cm).Build()
	r := &DefaultMemoryReconciler{Client: c, Scheme: c.Scheme(), AutoProvision: true}

	_, err := r.Reconcile(context.Background(), reconcileRequest("ark-config-streaming", "tenant-a"))
	require.NoError(t, err)

	var mem arkv1alpha1.Memory
	require.NoError(t, c.Get(context.Background(), types.NamespacedName{Name: defaultMemoryName, Namespace: "tenant-a"}, &mem))
	assert.Equal(t, "ark-config-streaming", mem.OwnerReferences[0].Name)
}

func TestDefaultMemoryReconciler_ServiceRefNamespaceOverride(t *testing.T) {
	cm := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{Name: "ark-config-broker", Namespace: "tenant-a"},
		Data: map[string]string{
			"enabled":    "true",
			"serviceRef": "name: \"ark-broker\"\nport: \"http\"\nnamespace: \"shared\"",
		},
	}
	c := fake.NewClientBuilder().WithScheme(defaultMemorySchemeWithCore()).WithObjects(cm).Build()
	r := &DefaultMemoryReconciler{Client: c, Scheme: c.Scheme(), AutoProvision: true}

	_, err := r.Reconcile(context.Background(), reconcileRequest("ark-config-broker", "tenant-a"))
	require.NoError(t, err)

	var mem arkv1alpha1.Memory
	require.NoError(t, c.Get(context.Background(), types.NamespacedName{Name: defaultMemoryName, Namespace: "tenant-a"}, &mem))
	assert.Equal(t, "shared", mem.Spec.Address.ValueFrom.ServiceRef.Namespace)
}

func TestDefaultMemoryReconciler_LeavesExistingMemoryUntouched(t *testing.T) {
	cm := brokerConfigMap("ark-config-broker", "tenant-a", true)
	existing := &arkv1alpha1.Memory{
		ObjectMeta: metav1.ObjectMeta{Name: defaultMemoryName, Namespace: "tenant-a"},
		Spec: arkv1alpha1.MemorySpec{
			Address: arkv1alpha1.ValueSource{Value: "http://helm-owned-memory:8080"},
		},
	}
	c := fake.NewClientBuilder().WithScheme(defaultMemorySchemeWithCore()).WithObjects(cm, existing).
		WithInterceptorFuncs(interceptor.Funcs{
			Update: func(context.Context, client.WithWatch, client.Object, ...client.UpdateOption) error {
				t.Fatal("backstop must never update an existing Memory")
				return nil
			},
			Patch: func(context.Context, client.WithWatch, client.Object, client.Patch, ...client.PatchOption) error {
				t.Fatal("backstop must never patch an existing Memory")
				return nil
			},
		}).
		Build()
	r := &DefaultMemoryReconciler{Client: c, Scheme: c.Scheme(), AutoProvision: true}

	_, err := r.Reconcile(context.Background(), reconcileRequest("ark-config-broker", "tenant-a"))
	require.NoError(t, err)

	var mem arkv1alpha1.Memory
	require.NoError(t, c.Get(context.Background(), types.NamespacedName{Name: defaultMemoryName, Namespace: "tenant-a"}, &mem))
	assert.Equal(t, "http://helm-owned-memory:8080", mem.Spec.Address.Value)
	assert.Empty(t, mem.OwnerReferences)
}

func TestDefaultMemoryReconciler_NoConfigMapDoesNothing(t *testing.T) {
	c := fake.NewClientBuilder().WithScheme(defaultMemorySchemeWithCore()).Build()
	r := &DefaultMemoryReconciler{Client: c, Scheme: c.Scheme(), AutoProvision: true}

	_, err := r.Reconcile(context.Background(), reconcileRequest("ark-config-broker", "tenant-a"))
	require.NoError(t, err)

	var list arkv1alpha1.MemoryList
	require.NoError(t, c.List(context.Background(), &list))
	assert.Empty(t, list.Items)
}

func TestDefaultMemoryReconciler_DisabledConfigMapDoesNothing(t *testing.T) {
	cm := brokerConfigMap("ark-config-broker", "tenant-a", false)
	c := fake.NewClientBuilder().WithScheme(defaultMemorySchemeWithCore()).WithObjects(cm).Build()
	r := &DefaultMemoryReconciler{Client: c, Scheme: c.Scheme(), AutoProvision: true}

	_, err := r.Reconcile(context.Background(), reconcileRequest("ark-config-broker", "tenant-a"))
	require.NoError(t, err)

	var list arkv1alpha1.MemoryList
	require.NoError(t, c.List(context.Background(), &list))
	assert.Empty(t, list.Items)
}

func TestDefaultMemoryReconciler_AutoProvisionFalseIsNoop(t *testing.T) {
	cm := brokerConfigMap("ark-config-broker", "tenant-a", true)
	c := fake.NewClientBuilder().WithScheme(defaultMemorySchemeWithCore()).WithObjects(cm).
		WithInterceptorFuncs(interceptor.Funcs{
			Get: func(context.Context, client.WithWatch, client.ObjectKey, client.Object, ...client.GetOption) error {
				t.Fatal("AutoProvision=false must short-circuit before touching the client")
				return nil
			},
		}).
		Build()
	r := &DefaultMemoryReconciler{Client: c, Scheme: c.Scheme(), AutoProvision: false}

	_, err := r.Reconcile(context.Background(), reconcileRequest("ark-config-broker", "tenant-a"))
	require.NoError(t, err)
}

func TestDefaultMemoryReconciler_CreateRaceWithExistingIsNotAnError(t *testing.T) {
	cm := brokerConfigMap("ark-config-broker", "tenant-a", true)
	c := fake.NewClientBuilder().WithScheme(defaultMemorySchemeWithCore()).WithObjects(cm).
		WithInterceptorFuncs(interceptor.Funcs{
			Create: func(context.Context, client.WithWatch, client.Object, ...client.CreateOption) error {
				return apierrors.NewAlreadyExists(schema.GroupResource{Group: "ark.mckinsey.com", Resource: "memories"}, defaultMemoryName)
			},
		}).
		Build()
	r := &DefaultMemoryReconciler{Client: c, Scheme: c.Scheme(), AutoProvision: true}

	_, err := r.Reconcile(context.Background(), reconcileRequest("ark-config-broker", "tenant-a"))
	require.NoError(t, err)
}

func TestDefaultMemoryReconciler_PropagatesGetError(t *testing.T) {
	cm := brokerConfigMap("ark-config-broker", "tenant-a", true)
	boom := errors.New("boom-get")
	c := fake.NewClientBuilder().WithScheme(defaultMemorySchemeWithCore()).WithObjects(cm).
		WithInterceptorFuncs(interceptor.Funcs{
			Get: func(ctx context.Context, wc client.WithWatch, key client.ObjectKey, obj client.Object, opts ...client.GetOption) error {
				if _, ok := obj.(*arkv1alpha1.Memory); ok {
					return boom
				}
				return wc.Get(ctx, key, obj, opts...)
			},
		}).
		Build()
	r := &DefaultMemoryReconciler{Client: c, Scheme: c.Scheme(), AutoProvision: true}

	_, err := r.Reconcile(context.Background(), reconcileRequest("ark-config-broker", "tenant-a"))
	require.ErrorIs(t, err, boom)
}

func TestDefaultMemoryReconciler_HonoursDiscoveryNamespaceScope(t *testing.T) {
	t.Setenv("ARK_DISCOVERY_NAMESPACE", "tenant-a")

	cm := brokerConfigMap("ark-config-broker", "tenant-b", true)
	c := fake.NewClientBuilder().WithScheme(defaultMemorySchemeWithCore()).WithObjects(cm).Build()
	r := &DefaultMemoryReconciler{Client: c, Scheme: c.Scheme(), AutoProvision: true}

	_, err := r.Reconcile(context.Background(), reconcileRequest("ark-config-broker", "tenant-b"))
	require.NoError(t, err)

	var list arkv1alpha1.MemoryList
	require.NoError(t, c.List(context.Background(), &list))
	assert.Empty(t, list.Items, "reconciler must not act outside its scoped namespace")
}
