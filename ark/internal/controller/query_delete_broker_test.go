/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func memoryWithAddress(name, brokerURL string) *arkv1alpha1.Memory {
	return &arkv1alpha1.Memory{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
		Spec: arkv1alpha1.MemorySpec{
			Address: arkv1alpha1.ValueSource{Value: brokerURL},
		},
		Status: arkv1alpha1.MemoryStatus{
			LastResolvedAddress: &brokerURL,
		},
	}
}

func makeBrokerServer(t *testing.T, status int) (*httptest.Server, *string, *string) {
	t.Helper()
	var capturedMethod, capturedPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedMethod = r.Method
		capturedPath = r.URL.Path
		w.WriteHeader(status)
	}))
	t.Cleanup(srv.Close)
	return srv, &capturedMethod, &capturedPath
}

func TestDeleteBrokerMessages_ExplicitMemory(t *testing.T) {
	srv, capturedMethod, capturedPath := makeBrokerServer(t, http.StatusOK)

	memory := memoryWithAddress("my-memory", srv.URL)
	fc := fake.NewClientBuilder().
		WithScheme(func() *runtime.Scheme { s := runtime.NewScheme(); _ = arkv1alpha1.AddToScheme(s); return s }()).
		WithObjects(memory).
		Build()

	r := &QueryReconciler{Client: fc}
	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "my-query", Namespace: "default"},
		Spec: arkv1alpha1.QuerySpec{
			Memory: &arkv1alpha1.MemoryRef{Name: "my-memory", Namespace: "default"},
		},
	}

	err := r.deleteBrokerMessages(context.Background(), query)
	require.NoError(t, err)
	assert.Equal(t, http.MethodDelete, *capturedMethod)
	assert.Equal(t, "/queries/my-query/messages", *capturedPath)
}

func TestDeleteBrokerMessages_DefaultMemoryFallback(t *testing.T) {
	srv, capturedMethod, capturedPath := makeBrokerServer(t, http.StatusOK)

	memory := memoryWithAddress("default", srv.URL)
	fc := fake.NewClientBuilder().
		WithScheme(func() *runtime.Scheme { s := runtime.NewScheme(); _ = arkv1alpha1.AddToScheme(s); return s }()).
		WithObjects(memory).
		Build()

	r := &QueryReconciler{Client: fc}
	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "my-query", Namespace: "default"},
		Spec:       arkv1alpha1.QuerySpec{},
	}

	err := r.deleteBrokerMessages(context.Background(), query)
	require.NoError(t, err)
	assert.Equal(t, http.MethodDelete, *capturedMethod)
	assert.Equal(t, "/queries/my-query/messages", *capturedPath)
}

func TestDeleteBrokerMessages_NoMemory(t *testing.T) {
	called := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)

	fc := fake.NewClientBuilder().
		WithScheme(func() *runtime.Scheme { s := runtime.NewScheme(); _ = arkv1alpha1.AddToScheme(s); return s }()).
		Build()

	r := &QueryReconciler{Client: fc}
	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "my-query", Namespace: "default"},
		Spec:       arkv1alpha1.QuerySpec{},
	}

	err := r.deleteBrokerMessages(context.Background(), query)
	require.NoError(t, err)
	assert.False(t, called, "should not call broker when no memory exists")
}

func TestDeleteBrokerMessages_MemoryNotFound(t *testing.T) {
	called := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)

	fc := fake.NewClientBuilder().
		WithScheme(func() *runtime.Scheme { s := runtime.NewScheme(); _ = arkv1alpha1.AddToScheme(s); return s }()).
		Build()

	r := &QueryReconciler{Client: fc}
	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "my-query", Namespace: "default"},
		Spec: arkv1alpha1.QuerySpec{
			Memory: &arkv1alpha1.MemoryRef{Name: "nonexistent", Namespace: "default"},
		},
	}

	err := r.deleteBrokerMessages(context.Background(), query)
	require.NoError(t, err)
	assert.False(t, called, "should not call broker when referenced memory is not found")
}

func TestDeleteBrokerMessages_Broker500ReturnsError(t *testing.T) {
	srv, _, _ := makeBrokerServer(t, http.StatusInternalServerError)

	memory := memoryWithAddress("my-memory", srv.URL)
	fc := fake.NewClientBuilder().
		WithScheme(func() *runtime.Scheme { s := runtime.NewScheme(); _ = arkv1alpha1.AddToScheme(s); return s }()).
		WithObjects(memory).
		Build()

	r := &QueryReconciler{Client: fc}
	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "my-query", Namespace: "default"},
		Spec: arkv1alpha1.QuerySpec{
			Memory: &arkv1alpha1.MemoryRef{Name: "my-memory", Namespace: "default"},
		},
	}

	err := r.deleteBrokerMessages(context.Background(), query)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "500")
}

func TestDeleteBrokerMessages_Broker404IsSkipped(t *testing.T) {
	srv, _, _ := makeBrokerServer(t, http.StatusNotFound)

	memory := memoryWithAddress("my-memory", srv.URL)
	fc := fake.NewClientBuilder().
		WithScheme(func() *runtime.Scheme { s := runtime.NewScheme(); _ = arkv1alpha1.AddToScheme(s); return s }()).
		WithObjects(memory).
		Build()

	r := &QueryReconciler{Client: fc}
	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "my-query", Namespace: "default"},
		Spec: arkv1alpha1.QuerySpec{
			Memory: &arkv1alpha1.MemoryRef{Name: "my-memory", Namespace: "default"},
		},
	}

	err := r.deleteBrokerMessages(context.Background(), query)
	require.NoError(t, err)
}

func TestHandleFinalizer_BrokerFailure_RequeuesUntilGrace(t *testing.T) {
	srv, _, _ := makeBrokerServer(t, http.StatusInternalServerError)

	memory := memoryWithAddress("my-memory", srv.URL)
	fc := fake.NewClientBuilder().
		WithScheme(func() *runtime.Scheme {
			s := runtime.NewScheme()
			_ = arkv1alpha1.AddToScheme(s)
			_ = corev1.AddToScheme(s)
			return s
		}()).
		WithObjects(memory).
		Build()

	r := &QueryReconciler{Client: fc}

	now := metav1.Now()
	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "my-query",
			Namespace:         "default",
			DeletionTimestamp: &now,
			Finalizers:        []string{finalizer},
		},
		Spec: arkv1alpha1.QuerySpec{
			Memory: &arkv1alpha1.MemoryRef{Name: "my-memory", Namespace: "default"},
		},
	}

	result, err := r.handleFinalizer(context.Background(), query)
	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, messageCleanupRetryInterval, result.RequeueAfter)
}

func TestHandleFinalizer_GracePeriodExpired_RemovesFinalizer(t *testing.T) {
	srv, _, _ := makeBrokerServer(t, http.StatusInternalServerError)

	memory := memoryWithAddress("my-memory", srv.URL)
	pastGrace := metav1.Time{Time: time.Now().Add(-messageCleanupGracePeriod - time.Second)}
	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "my-query",
			Namespace:         "default",
			DeletionTimestamp: &pastGrace,
			Finalizers:        []string{finalizer},
		},
		Spec: arkv1alpha1.QuerySpec{
			Memory: &arkv1alpha1.MemoryRef{Name: "my-memory", Namespace: "default"},
		},
	}

	scheme := runtime.NewScheme()
	_ = arkv1alpha1.AddToScheme(scheme)
	_ = corev1.AddToScheme(scheme)
	fc := fake.NewClientBuilder().
		WithScheme(scheme).
		WithObjects(memory, query).
		Build()

	r := &QueryReconciler{Client: fc}

	result, err := r.handleFinalizer(context.Background(), query)
	require.NoError(t, err)
	assert.Equal(t, &ctrl.Result{}, result)
	assert.Empty(t, query.Finalizers)
}

func TestDeleteBrokerEvents_EndpointResolved(t *testing.T) {
	srv, capturedMethod, capturedPath := makeBrokerServer(t, http.StatusOK)

	r := &QueryReconciler{
		brokerEventsEndpoint: func(_ context.Context, _ string) (string, error) {
			return srv.URL, nil
		},
	}
	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "my-query", Namespace: "default", UID: "query-uid-123"},
	}

	err := r.deleteBrokerEvents(context.Background(), query)
	require.NoError(t, err)
	assert.Equal(t, http.MethodDelete, *capturedMethod)
	assert.Equal(t, "/events/query-uid-123", *capturedPath)
}

func TestDeleteBrokerEvents_NoBrokerConfigured(t *testing.T) {
	called := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)

	r := &QueryReconciler{
		brokerEventsEndpoint: func(_ context.Context, _ string) (string, error) {
			return "", nil
		},
	}
	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "my-query", Namespace: "default", UID: "query-uid-123"},
	}

	err := r.deleteBrokerEvents(context.Background(), query)
	require.NoError(t, err)
	assert.False(t, called, "should not call broker when no broker is configured for the namespace")
}

func TestDeleteBrokerEvents_Broker500ReturnsError(t *testing.T) {
	srv, _, _ := makeBrokerServer(t, http.StatusInternalServerError)

	r := &QueryReconciler{
		brokerEventsEndpoint: func(_ context.Context, _ string) (string, error) {
			return srv.URL, nil
		},
	}
	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "my-query", Namespace: "default", UID: "query-uid-123"},
	}

	err := r.deleteBrokerEvents(context.Background(), query)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "500")
}

func TestDeleteBrokerEvents_Broker404IsSkipped(t *testing.T) {
	srv, _, _ := makeBrokerServer(t, http.StatusNotFound)

	r := &QueryReconciler{
		brokerEventsEndpoint: func(_ context.Context, _ string) (string, error) {
			return srv.URL, nil
		},
	}
	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "my-query", Namespace: "default", UID: "query-uid-123"},
	}

	err := r.deleteBrokerEvents(context.Background(), query)
	require.NoError(t, err)
}

func TestResolveBrokerEventsEndpoint_DefaultUsesRoutingDiscovery(t *testing.T) {
	scheme := runtime.NewScheme()
	_ = corev1.AddToScheme(scheme)
	fc := fake.NewClientBuilder().WithScheme(scheme).Build()

	r := &QueryReconciler{Client: fc}

	endpoint, err := r.resolveBrokerEventsEndpoint(context.Background(), "default")
	require.NoError(t, err)
	assert.Empty(t, endpoint, "no ark-config-broker ConfigMap exists, so no endpoint should resolve")
}
