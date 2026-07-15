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
	"golang.org/x/sync/semaphore"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/telemetry/routing"
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

func newTestEmitter(endpoints map[string]string) *BrokerEventEmitter {
	return &BrokerEventEmitter{
		httpClient: &http.Client{},
		endpoints:  endpoints,
		sem:        semaphore.NewWeighted(64),
	}
}

func TestGetEndpointForNamespace_ExactMatch(t *testing.T) {
	e := newTestEmitter(map[string]string{
		"default": "http://broker.default/events",
		"other":   "http://broker.other/events",
	})

	assert.Equal(t, "http://broker.default/events", e.getEndpointForNamespace("default"))
	assert.Equal(t, "http://broker.other/events", e.getEndpointForNamespace("other"))
}

func TestGetEndpointForNamespace_FallbackToAny(t *testing.T) {
	e := newTestEmitter(map[string]string{
		"default": "http://broker.default/events",
	})

	assert.Equal(t, "http://broker.default/events", e.getEndpointForNamespace("chainsaw-test-ns"))
}

func TestGetEndpointForNamespace_NoEndpoints(t *testing.T) {
	e := newTestEmitter(map[string]string{})

	assert.Equal(t, "", e.getEndpointForNamespace("any-namespace"))
}

func TestNewBrokerEventEmitter(t *testing.T) {
	endpoints := []routing.BrokerEndpoint{
		{Namespace: "default", Endpoint: "http://broker.default"},
		{Namespace: "other", Endpoint: "http://broker.other"},
	}

	emitter := NewBrokerEventEmitter(endpoints)
	be := emitter.(*BrokerEventEmitter)

	assert.Equal(t, "http://broker.default/events", be.endpoints["default"])
	assert.Equal(t, "http://broker.other/events", be.endpoints["other"])
}

func TestEmitStructured_SendsEventToMatchingNamespace(t *testing.T) {
	var received Event
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &received)
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	e := newTestEmitter(map[string]string{"test-ns": srv.URL + "/events"})
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

	e := newTestEmitter(map[string]string{"test-ns": srv.URL + "/events"})
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

	e := newTestEmitter(map[string]string{"test-ns": srv.URL + "/events"})
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

func TestEmitStructured_FallsBackToAnyEndpoint(t *testing.T) {
	var received Event
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &received)
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	e := newTestEmitter(map[string]string{"default": srv.URL + "/events"})
	query := newTestQuery("chainsaw-test-ns")

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

	e := newTestEmitter(map[string]string{"test-ns": srv.URL + "/events"})
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

	e := &BrokerEventEmitter{
		httpClient: &http.Client{},
		endpoints:  map[string]string{"test-ns": srv.URL + "/events"},
		sem:        semaphore.NewWeighted(0),
	}
	query := newTestQuery("test-ns")

	e.EmitStructured(context.Background(), query, corev1.EventTypeNormal, "QueryExecutionStart", "msg", nil)

	assert.False(t, called, "event should be dropped when semaphore is full")
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}
