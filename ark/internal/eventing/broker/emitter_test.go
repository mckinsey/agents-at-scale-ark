package broker

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/sync/semaphore"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func newTestQuery(namespace string) *arkv1alpha1.Query {
	return &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-query",
			Namespace: namespace,
			UID:       types.UID("test-uid"),
		},
	}
}

// newTestEmitter builds an emitter whose endpoint resolution is a plain
// namespace->URL lookup, standing in for routing.ResolveBrokerEndpoint so
// tests don't depend on real cluster DNS.
func newTestEmitter(endpoints map[string]string) *BrokerEventEmitter {
	return &BrokerEventEmitter{
		httpClient: &http.Client{},
		sem:        semaphore.NewWeighted(64),
		resolveEndpoint: func(_ context.Context, namespace string) (string, error) {
			return endpoints[namespace], nil
		},
	}
}

func TestGetEndpointForNamespace_ExactMatch(t *testing.T) {
	e := newTestEmitter(map[string]string{
		"default": "http://broker.default",
		"other":   "http://broker.other",
	})

	got, err := e.getEndpointForNamespace(context.Background(), "default")
	assert.NoError(t, err)
	assert.Equal(t, "http://broker.default", got)

	got, err = e.getEndpointForNamespace(context.Background(), "other")
	assert.NoError(t, err)
	assert.Equal(t, "http://broker.other", got)
}

func TestGetEndpointForNamespace_NoFallback(t *testing.T) {
	e := newTestEmitter(map[string]string{
		"default": "http://broker.default",
	})

	got, err := e.getEndpointForNamespace(context.Background(), "chainsaw-test-ns")
	assert.NoError(t, err)
	assert.Empty(t, got, "should not fall back to another namespace's broker")
}

func TestGetEndpointForNamespace_NoEndpoints(t *testing.T) {
	e := newTestEmitter(map[string]string{})

	got, err := e.getEndpointForNamespace(context.Background(), "any-namespace")
	assert.NoError(t, err)
	assert.Empty(t, got)
}

func TestNewBrokerEventEmitter_ResolvesLiveViaRouting(t *testing.T) {
	fc := fake.NewClientBuilder().WithObjects(&corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{Name: "ark-config-broker", Namespace: "test-ns"},
		Data: map[string]string{
			"enabled":    "true",
			"serviceRef": "name: ark-broker\nport: \"80\"",
		},
	}).Build()

	emitter := NewBrokerEventEmitter(fc)
	e, ok := emitter.(*BrokerEventEmitter)
	require.True(t, ok)

	endpoint, err := e.getEndpointForNamespace(context.Background(), "test-ns")
	require.NoError(t, err)
	assert.Equal(t, "http://ark-broker.test-ns.svc.cluster.local:80", endpoint)

	endpoint, err = e.getEndpointForNamespace(context.Background(), "other-ns")
	require.NoError(t, err)
	assert.Empty(t, endpoint, "should not fall back to test-ns's broker")
}

func TestEmitStructured_SendsEventToMatchingNamespace(t *testing.T) {
	var received Event
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &received)
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	e := newTestEmitter(map[string]string{"test-ns": srv.URL})
	query := newTestQuery("test-ns")

	done := make(chan struct{})
	origClient := e.httpClient
	e.httpClient = &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			resp, err := origClient.Do(req)
			close(done)
			return resp, err
		}),
	}

	e.EmitStructured(context.Background(), query, corev1.EventTypeNormal, "QueryExecutionStart", "msg", map[string]string{"queryId": "test-uid"})
	<-done

	assert.Equal(t, "QueryExecutionStart", received.Reason)
	assert.Equal(t, "test-uid", received.Data["queryId"])
}

func TestEmitStructured_IncludesTtlSecondsWhenQueryHasTTL(t *testing.T) {
	var rawBody []byte
	var received Event
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rawBody, _ = io.ReadAll(r.Body)
		_ = json.Unmarshal(rawBody, &received)
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	e := newTestEmitter(map[string]string{"test-ns": srv.URL})
	query := newTestQuery("test-ns")
	query.Spec.TTL = &metav1.Duration{Duration: time.Hour}

	done := make(chan struct{})
	origClient := e.httpClient
	e.httpClient = &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			resp, err := origClient.Do(req)
			close(done)
			return resp, err
		}),
	}

	e.EmitStructured(context.Background(), query, corev1.EventTypeNormal, "QueryExecutionStart", "msg", map[string]string{"queryId": "test-uid"})
	<-done

	assert.Contains(t, string(rawBody), `"ttl_seconds":3600`)
	if assert.NotNil(t, received.TtlSeconds) {
		assert.Equal(t, int64(3600), *received.TtlSeconds)
	}
}

func TestEmitStructured_OmitsTtlSecondsWhenQueryHasNoTTL(t *testing.T) {
	var rawBody []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rawBody, _ = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	e := newTestEmitter(map[string]string{"test-ns": srv.URL})
	query := newTestQuery("test-ns")

	done := make(chan struct{})
	origClient := e.httpClient
	e.httpClient = &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			resp, err := origClient.Do(req)
			close(done)
			return resp, err
		}),
	}

	e.EmitStructured(context.Background(), query, corev1.EventTypeNormal, "QueryExecutionStart", "msg", map[string]string{"queryId": "test-uid"})
	<-done

	assert.NotContains(t, string(rawBody), "ttl_seconds")
}

func TestEmitStructured_DropsEventWhenNamespaceHasNoEndpoint(t *testing.T) {
	called := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	// A broker exists for "default", but the query runs in a different
	// namespace with no ConfigMap of its own — no fallback, drop the event.
	e := newTestEmitter(map[string]string{"default": srv.URL})
	query := newTestQuery("chainsaw-test-ns")

	e.EmitStructured(context.Background(), query, corev1.EventTypeNormal, "QueryExecutionStart", "msg", map[string]string{"queryId": "test-uid"})

	assert.False(t, called, "should not fall back to another namespace's broker")
}

func TestEmitStructured_DropsEventWhenNoEndpoints(t *testing.T) {
	called := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	e := newTestEmitter(map[string]string{})
	query := newTestQuery("test-ns")

	e.EmitStructured(context.Background(), query, corev1.EventTypeNormal, "QueryExecutionStart", "msg", map[string]string{})

	assert.False(t, called)
}

func TestEmitStructured_IgnoresNonQueryObjects(t *testing.T) {
	called := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	e := newTestEmitter(map[string]string{"test-ns": srv.URL})
	obj := &corev1.ConfigMap{ObjectMeta: metav1.ObjectMeta{Name: "cm", Namespace: "test-ns"}}

	e.EmitStructured(context.Background(), obj, corev1.EventTypeNormal, "SomeEvent", "msg", nil)

	assert.False(t, called)
}

func TestEmitStructured_DropsEventWhenSemaphoreFull(t *testing.T) {
	called := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	e := newTestEmitter(map[string]string{"test-ns": srv.URL})
	e.sem = semaphore.NewWeighted(0)
	query := newTestQuery("test-ns")

	e.EmitStructured(context.Background(), query, corev1.EventTypeNormal, "QueryExecutionStart", "msg", nil)

	assert.False(t, called, "event should be dropped when semaphore is full")
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}
