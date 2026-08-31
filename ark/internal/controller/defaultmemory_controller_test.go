/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"errors"
	"slices"
	"testing"
	"time"

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

// brokerServiceObj is the Service the broker chart creates. The backstop
// refuses to name a Service that is not there, so the create-path tests have
// to seed it.
func brokerServiceObj(name, namespace string) *corev1.Service {
	return &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: namespace,
			Labels:    map[string]string{"app.kubernetes.io/name": "ark-broker"},
		},
	}
}

// settled backdates an object past the settle window. The window is anchored on
// the newest of the announcing object and the Service, so a test that wants a
// create has to age both.
func settled[T client.Object](obj T) T {
	obj.SetCreationTimestamp(metav1.NewTime(time.Now().Add(-brokerSettleDelay - time.Minute)))
	return obj
}

func reconcileRequest(cmName, namespace string) ctrl.Request {
	return ctrl.Request{NamespacedName: types.NamespacedName{Name: cmName, Namespace: namespace}}
}

func TestDefaultMemoryReconciler_CreatesWhenAbsent(t *testing.T) {
	cm := brokerConfigMap("ark-config-broker", "tenant-a", true)
	svc := brokerServiceObj("ark-broker", "tenant-a")
	c := fake.NewClientBuilder().WithScheme(defaultMemorySchemeWithCore()).WithObjects(cm, svc).Build()
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

func TestDefaultMemoryReconciler_DelaysCreationForFreshConfigMap(t *testing.T) {
	cm := brokerConfigMap("ark-config-broker", "tenant-a", true)
	cm.CreationTimestamp = metav1.Now()
	c := fake.NewClientBuilder().WithScheme(defaultMemorySchemeWithCore()).WithObjects(cm).Build()
	r := &DefaultMemoryReconciler{Client: c, Scheme: c.Scheme(), AutoProvision: true}

	result, err := r.Reconcile(context.Background(), reconcileRequest("ark-config-broker", "tenant-a"))
	require.NoError(t, err)
	assert.Greater(t, result.RequeueAfter, time.Duration(0))
	assert.LessOrEqual(t, result.RequeueAfter, brokerSettleDelay)

	var list arkv1alpha1.MemoryList
	require.NoError(t, c.List(context.Background(), &list))
	assert.Empty(t, list.Items, "must not create while helm's own install could still be in flight")
}

func TestDefaultMemoryReconciler_CreatesOnceConfigMapHasSettled(t *testing.T) {
	cm := brokerConfigMap("ark-config-broker", "tenant-a", true)
	cm.CreationTimestamp = metav1.NewTime(time.Now().Add(-brokerSettleDelay - time.Minute))
	svc := brokerServiceObj("ark-broker", "tenant-a")
	c := fake.NewClientBuilder().WithScheme(defaultMemorySchemeWithCore()).WithObjects(cm, svc).Build()
	r := &DefaultMemoryReconciler{Client: c, Scheme: c.Scheme(), AutoProvision: true}

	_, err := r.Reconcile(context.Background(), reconcileRequest("ark-config-broker", "tenant-a"))
	require.NoError(t, err)

	var mem arkv1alpha1.Memory
	require.NoError(t, c.Get(context.Background(), types.NamespacedName{Name: defaultMemoryName, Namespace: "tenant-a"}, &mem))
}

func TestDefaultMemoryReconciler_UsesStreamingConfigMapWhenBrokerAbsent(t *testing.T) {
	cm := brokerConfigMap("ark-config-streaming", "tenant-a", true)
	svc := brokerServiceObj("ark-broker", "tenant-a")
	c := fake.NewClientBuilder().WithScheme(defaultMemorySchemeWithCore()).WithObjects(cm, svc).Build()
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
	svc := brokerServiceObj("ark-broker", "shared")
	c := fake.NewClientBuilder().WithScheme(defaultMemorySchemeWithCore()).WithObjects(cm, svc).Build()
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

// Regression guard: the Service check added later made this test exit before
// r.Create was ever called, leaving the AlreadyExists tolerance uncovered
// while the test still passed.
func TestDefaultMemoryReconciler_CreateRaceWithExistingIsNotAnError(t *testing.T) {
	cm := brokerConfigMap("ark-config-broker", "tenant-a", true)
	svc := brokerServiceObj("ark-broker", "tenant-a")
	created := false
	c := fake.NewClientBuilder().WithScheme(defaultMemorySchemeWithCore()).WithObjects(cm, svc).
		WithInterceptorFuncs(interceptor.Funcs{
			Create: func(context.Context, client.WithWatch, client.Object, ...client.CreateOption) error {
				created = true
				return apierrors.NewAlreadyExists(schema.GroupResource{Group: "ark.mckinsey.com", Resource: "memories"}, defaultMemoryName)
			},
		}).
		Build()
	r := &DefaultMemoryReconciler{Client: c, Scheme: c.Scheme(), AutoProvision: true}

	_, err := r.Reconcile(context.Background(), reconcileRequest("ark-config-broker", "tenant-a"))
	require.NoError(t, err)
	require.True(t, created, "the tolerance is only proven if Create was actually reached")
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

// Finding 1 of the cross-layer review: the reconciler's own comment warned
// that naming a Service which may never exist turns NewHTTPMemory's silent
// degradation into failing queries, but it only checked for the announcing
// ConfigMap, never for the Service.
func TestDefaultMemoryReconciler_WaitsWhenAnnouncedServiceIsAbsent(t *testing.T) {
	cm := brokerConfigMap("ark-config-broker", "tenant-a", true)
	c := fake.NewClientBuilder().WithScheme(defaultMemorySchemeWithCore()).WithObjects(cm).Build()
	r := &DefaultMemoryReconciler{Client: c, Scheme: c.Scheme(), AutoProvision: true}

	result, err := r.Reconcile(context.Background(), reconcileRequest("ark-config-broker", "tenant-a"))
	require.NoError(t, err)
	assert.Greater(t, result.RequeueAfter, time.Duration(0))

	var list arkv1alpha1.MemoryList
	require.NoError(t, c.List(context.Background(), &list))
	assert.Empty(t, list.Items,
		"a Memory whose address can never resolve fails every query in the namespace")
}

func TestDefaultMemoryReconciler_WaitsWhenServiceIsInAnotherNamespaceAndAbsent(t *testing.T) {
	cm := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{Name: "ark-config-broker", Namespace: "tenant-a"},
		Data: map[string]string{
			"enabled":    "true",
			"serviceRef": "name: \"ark-broker\"\nport: \"http\"\nnamespace: \"shared\"",
		},
	}
	// Present in the wrong namespace: the serviceRef points at "shared".
	svc := brokerServiceObj("ark-broker", "tenant-a")
	c := fake.NewClientBuilder().WithScheme(defaultMemorySchemeWithCore()).WithObjects(cm, svc).Build()
	r := &DefaultMemoryReconciler{Client: c, Scheme: c.Scheme(), AutoProvision: true}

	_, err := r.Reconcile(context.Background(), reconcileRequest("ark-config-broker", "tenant-a"))
	require.NoError(t, err)

	var list arkv1alpha1.MemoryList
	require.NoError(t, c.List(context.Background(), &list))
	assert.Empty(t, list.Items)
}

// Finding 2: the two telemetry ConfigMaps are independently disablable, so a
// broker installed only for message and session storage announced itself
// nowhere and the invariant went unenforced — while the tenant chart's own
// preflight, which looks for the Service, considered the namespace fine.
func TestDefaultMemoryReconciler_FallsBackToLabelledBrokerService(t *testing.T) {
	c := fake.NewClientBuilder().WithScheme(defaultMemorySchemeWithCore()).
		WithObjects(settled(brokerServiceObj("ark-broker", "tenant-a"))).Build()
	r := &DefaultMemoryReconciler{Client: c, Scheme: c.Scheme(), AutoProvision: true}

	_, err := r.Reconcile(context.Background(), reconcileRequest("", "tenant-a"))
	require.NoError(t, err)

	var mem arkv1alpha1.Memory
	require.NoError(t, c.Get(context.Background(), types.NamespacedName{Name: defaultMemoryName, Namespace: "tenant-a"}, &mem))
	assert.Equal(t, "ark-broker", mem.Spec.Address.ValueFrom.ServiceRef.Name)
	assert.Equal(t, "tenant-a", mem.Spec.Address.ValueFrom.ServiceRef.Namespace)
	assert.Equal(t, "http", mem.Spec.Address.ValueFrom.ServiceRef.Port)

	// The Service announced the broker, so the Service owns the Memory and a
	// helm uninstall garbage-collects it exactly as the ConfigMap path does.
	require.Len(t, mem.OwnerReferences, 1)
	assert.Equal(t, "Service", mem.OwnerReferences[0].Kind)
	assert.Equal(t, "ark-broker", mem.OwnerReferences[0].Name)
}

func TestDefaultMemoryReconciler_FallbackHonoursTheSettleWindow(t *testing.T) {
	svc := brokerServiceObj("ark-broker", "tenant-a")
	svc.CreationTimestamp = metav1.Now()
	c := fake.NewClientBuilder().WithScheme(defaultMemorySchemeWithCore()).WithObjects(svc).Build()
	r := &DefaultMemoryReconciler{Client: c, Scheme: c.Scheme(), AutoProvision: true}

	result, err := r.Reconcile(context.Background(), reconcileRequest("", "tenant-a"))
	require.NoError(t, err)
	assert.Greater(t, result.RequeueAfter, time.Duration(0))

	var list arkv1alpha1.MemoryList
	require.NoError(t, c.List(context.Background(), &list))
	assert.Empty(t, list.Items)
}

func TestDefaultMemoryReconciler_IgnoresServicesThatAreNotTheBroker(t *testing.T) {
	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "some-app",
			Namespace: "tenant-a",
			Labels:    map[string]string{"app.kubernetes.io/name": "some-app"},
		},
	}
	c := fake.NewClientBuilder().WithScheme(defaultMemorySchemeWithCore()).WithObjects(svc).Build()
	r := &DefaultMemoryReconciler{Client: c, Scheme: c.Scheme(), AutoProvision: true}

	_, err := r.Reconcile(context.Background(), reconcileRequest("", "tenant-a"))
	require.NoError(t, err)

	var list arkv1alpha1.MemoryList
	require.NoError(t, c.List(context.Background(), &list))
	assert.Empty(t, list.Items)
}

// The ConfigMap carries an explicit serviceRef, including one pointing at a
// broker in another namespace, so it must win over the label scan.
func TestDefaultMemoryReconciler_ConfigMapWinsOverServiceFallback(t *testing.T) {
	cm := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{Name: "ark-config-broker", Namespace: "tenant-a"},
		Data: map[string]string{
			"enabled":    "true",
			"serviceRef": "name: \"ark-broker-primary\"\nport: \"http\"",
		},
	}
	c := fake.NewClientBuilder().WithScheme(defaultMemorySchemeWithCore()).
		WithObjects(cm, brokerServiceObj("ark-broker-primary", "tenant-a"), brokerServiceObj("ark-broker-other", "tenant-a")).
		Build()
	r := &DefaultMemoryReconciler{Client: c, Scheme: c.Scheme(), AutoProvision: true}

	_, err := r.Reconcile(context.Background(), reconcileRequest("ark-config-broker", "tenant-a"))
	require.NoError(t, err)

	var mem arkv1alpha1.Memory
	require.NoError(t, c.Get(context.Background(), types.NamespacedName{Name: defaultMemoryName, Namespace: "tenant-a"}, &mem))
	assert.Equal(t, "ark-broker-primary", mem.Spec.Address.ValueFrom.ServiceRef.Name)
	assert.Equal(t, "ConfigMap", mem.OwnerReferences[0].Kind)
}

// The fake client's List already returns Services name-sorted, so asserting on
// the winner alone would pass with the tiebreak deleted. Drive findBrokerSignal
// against a List that hands back the reverse order instead.
func TestDefaultMemoryReconciler_FallbackPicksDeterministicallyOnMultipleBrokers(t *testing.T) {
	c := fake.NewClientBuilder().WithScheme(defaultMemorySchemeWithCore()).
		WithObjects(settled(brokerServiceObj("aaa-broker", "tenant-a")), settled(brokerServiceObj("zzz-broker", "tenant-a"))).
		WithInterceptorFuncs(interceptor.Funcs{
			List: func(ctx context.Context, cl client.WithWatch, list client.ObjectList, opts ...client.ListOption) error {
				if err := cl.List(ctx, list, opts...); err != nil {
					return err
				}
				if services, ok := list.(*corev1.ServiceList); ok {
					slices.Reverse(services.Items)
				}
				return nil
			},
		}).
		Build()
	r := &DefaultMemoryReconciler{Client: c, Scheme: c.Scheme(), AutoProvision: true}

	signal, err := r.findBrokerSignal(context.Background(), "tenant-a")
	require.NoError(t, err)
	require.NotNil(t, signal)
	assert.Equal(t, "aaa-broker", signal.serviceRef.Name,
		"lowest name wins whatever order List returns, so repeated reconciles agree")
}

// The race that broke e2e: CI pre-creates the broker ConfigMap long before the
// install, so anchoring the window on it alone left it expired by the time Helm
// created the Service. The Service watch then fired and the backstop created a
// Memory a moment before Helm created its own, failing the release.
func TestDefaultMemoryReconciler_WaitsWhenTheServiceIsFresherThanTheConfigMap(t *testing.T) {
	cm := brokerConfigMap("ark-config-broker", "tenant-a", true)
	cm.CreationTimestamp = metav1.NewTime(time.Now().Add(-time.Hour))
	svc := brokerServiceObj("ark-broker", "tenant-a")
	svc.CreationTimestamp = metav1.Now()
	c := fake.NewClientBuilder().WithScheme(defaultMemorySchemeWithCore()).WithObjects(cm, svc).Build()
	r := &DefaultMemoryReconciler{Client: c, Scheme: c.Scheme(), AutoProvision: true}

	result, err := r.Reconcile(context.Background(), reconcileRequest("", "tenant-a"))
	require.NoError(t, err)
	assert.Greater(t, result.RequeueAfter, time.Duration(0))

	var list arkv1alpha1.MemoryList
	require.NoError(t, c.List(context.Background(), &list))
	assert.Empty(t, list.Items,
		"helm is mid-install; creating here races the chart's own Memory and fails the release")
}

// The mirror of the case above, and the race layer 2 was built for: a Helm
// install that adds the ConfigMap alongside its own Memory, against a broker
// Service that was already there.
func TestDefaultMemoryReconciler_WaitsWhenTheConfigMapIsFresherThanTheService(t *testing.T) {
	cm := brokerConfigMap("ark-config-broker", "tenant-a", true)
	cm.CreationTimestamp = metav1.Now()
	c := fake.NewClientBuilder().WithScheme(defaultMemorySchemeWithCore()).
		WithObjects(cm, settled(brokerServiceObj("ark-broker", "tenant-a"))).Build()
	r := &DefaultMemoryReconciler{Client: c, Scheme: c.Scheme(), AutoProvision: true}

	result, err := r.Reconcile(context.Background(), reconcileRequest("ark-config-broker", "tenant-a"))
	require.NoError(t, err)
	assert.Greater(t, result.RequeueAfter, time.Duration(0))

	var list arkv1alpha1.MemoryList
	require.NoError(t, c.List(context.Background(), &list))
	assert.Empty(t, list.Items)
}

func TestDefaultMemoryReconciler_CreatesOnceBothSignalsHaveSettled(t *testing.T) {
	cm := brokerConfigMap("ark-config-broker", "tenant-a", true)
	cm.CreationTimestamp = metav1.NewTime(time.Now().Add(-time.Hour))
	c := fake.NewClientBuilder().WithScheme(defaultMemorySchemeWithCore()).
		WithObjects(cm, settled(brokerServiceObj("ark-broker", "tenant-a"))).Build()
	r := &DefaultMemoryReconciler{Client: c, Scheme: c.Scheme(), AutoProvision: true}

	_, err := r.Reconcile(context.Background(), reconcileRequest("", "tenant-a"))
	require.NoError(t, err)

	var mem arkv1alpha1.Memory
	require.NoError(t, c.Get(context.Background(), types.NamespacedName{Name: defaultMemoryName, Namespace: "tenant-a"}, &mem))
}

// The watch filters and the mapping used to live inside SetupWithManager,
// which no unit test can reach — deleting the Service watch left the suite
// green. These pin them.
func TestDefaultMemoryReconciler_BrokerPresenceConfigMapFilter(t *testing.T) {
	for name, want := range map[string]bool{
		"ark-config-broker":       true,
		"ark-config-streaming":    true,
		"ark-config-broker-extra": false,
		"kube-root-ca.crt":        false,
	} {
		cm := &corev1.ConfigMap{ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "tenant-a"}}
		assert.Equal(t, want, isBrokerPresenceConfigMap(cm), "ConfigMap %q", name)
	}
}

func TestDefaultMemoryReconciler_BrokerServiceFilter(t *testing.T) {
	assert.True(t, isBrokerService(brokerServiceObj("ark-broker", "tenant-a")),
		"the chart's Service must match")
	assert.True(t, isBrokerService(brokerServiceObj("renamed-release-broker", "tenant-a")),
		"the label is the chart's, not the release's, so a renamed release still matches")

	other := &corev1.Service{ObjectMeta: metav1.ObjectMeta{
		Name:      "ark-broker",
		Namespace: "tenant-a",
		Labels:    map[string]string{"app.kubernetes.io/name": "something-else"},
	}}
	assert.False(t, isBrokerService(other), "the name alone must not be enough")
	assert.False(t, isBrokerService(&corev1.Service{ObjectMeta: metav1.ObjectMeta{Name: "ark-broker"}}),
		"an unlabelled Service must not match")
}

func TestDefaultMemoryReconciler_NamespaceRequestDropsTheName(t *testing.T) {
	reqs := namespaceRequest(context.Background(), brokerServiceObj("ark-broker", "tenant-a"))

	require.Len(t, reqs, 1)
	assert.Equal(t, "tenant-a", reqs[0].Namespace)
	assert.Empty(t, reqs[0].Name, "Reconcile keys on the namespace; any name would be misleading")
}

// The two error paths the coverage report showed at zero: a Service read that
// fails for a reason other than NotFound, and a failing List in the fallback.
// Swallowing either would mask a Forbidden or an API outage as "still waiting".
func TestDefaultMemoryReconciler_PropagatesServiceGetError(t *testing.T) {
	boom := errors.New("apiserver is unwell")
	cm := brokerConfigMap("ark-config-broker", "tenant-a", true)
	c := fake.NewClientBuilder().WithScheme(defaultMemorySchemeWithCore()).WithObjects(cm).
		WithInterceptorFuncs(interceptor.Funcs{
			Get: func(ctx context.Context, cl client.WithWatch, key client.ObjectKey, obj client.Object, opts ...client.GetOption) error {
				if _, ok := obj.(*corev1.Service); ok {
					return boom
				}
				return cl.Get(ctx, key, obj, opts...)
			},
		}).Build()
	r := &DefaultMemoryReconciler{Client: c, Scheme: c.Scheme(), AutoProvision: true}

	_, err := r.Reconcile(context.Background(), reconcileRequest("ark-config-broker", "tenant-a"))
	require.ErrorIs(t, err, boom)
}

func TestDefaultMemoryReconciler_PropagatesServiceListError(t *testing.T) {
	boom := errors.New("cannot list services")
	c := fake.NewClientBuilder().WithScheme(defaultMemorySchemeWithCore()).
		WithInterceptorFuncs(interceptor.Funcs{
			List: func(ctx context.Context, cl client.WithWatch, list client.ObjectList, opts ...client.ListOption) error {
				if _, ok := list.(*corev1.ServiceList); ok {
					return boom
				}
				return cl.List(ctx, list, opts...)
			},
		}).Build()
	r := &DefaultMemoryReconciler{Client: c, Scheme: c.Scheme(), AutoProvision: true}

	_, err := r.Reconcile(context.Background(), reconcileRequest("", "tenant-a"))
	require.ErrorIs(t, err, boom)
}
