package broker

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"golang.org/x/sync/semaphore"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/telemetry/routing"
)

var log = logf.Log.WithName("eventing.broker")

type Event struct {
	Timestamp  string                 `json:"timestamp"`
	EventType  string                 `json:"eventType"`
	Reason     string                 `json:"reason"`
	Message    string                 `json:"message"`
	Data       map[string]interface{} `json:"data"`
	TtlSeconds *int64                 `json:"ttl_seconds,omitempty"`
}

type BrokerEventEmitter struct {
	httpClient *http.Client
	k8sClient  client.Client
	sem        *semaphore.Weighted

	// resolveEndpoint resolves the broker base URL for a namespace. Defaults
	// to routing.ResolveBrokerEndpoint when nil; tests override it to avoid
	// depending on real cluster DNS.
	resolveEndpoint func(ctx context.Context, namespace string) (string, error)
}

// NewBrokerEventEmitter resolves the broker endpoint live, per event, via
// routing.ResolveBrokerEndpoint — no endpoint list is cached up front, so a
// namespace's ark-config-broker ConfigMap takes effect immediately, and a
// namespace with no ConfigMap of its own gets no broker (see
// ResolveBrokerEndpoint's doc comment for why there's no cross-namespace
// fallback).
func NewBrokerEventEmitter(k8sClient client.Client) eventing.EventEmitter {
	return &BrokerEventEmitter{
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
		k8sClient: k8sClient,
		sem:       semaphore.NewWeighted(64),
	}
}

func (e *BrokerEventEmitter) EmitNormal(ctx context.Context, obj runtime.Object, reason, message string) {
	e.EmitStructured(ctx, obj, corev1.EventTypeNormal, reason, message, nil)
}

func (e *BrokerEventEmitter) EmitWarning(ctx context.Context, obj runtime.Object, reason, message string) {
	e.EmitStructured(ctx, obj, corev1.EventTypeWarning, reason, message, nil)
}

func (e *BrokerEventEmitter) EmitStructured(ctx context.Context, obj runtime.Object, eventType, reason, message string, data any) {
	query, ok := obj.(*arkv1alpha1.Query)
	if !ok {
		return
	}

	dataMap, ok := data.(map[string]string)
	if !ok && data != nil {
		return
	}

	eventData := make(map[string]interface{})
	for k, v := range dataMap {
		eventData[k] = v
	}

	event := Event{
		Timestamp:  time.Now().Format(time.RFC3339Nano),
		EventType:  eventType,
		Reason:     reason,
		Message:    message,
		Data:       eventData,
		TtlSeconds: common.TtlSecondsFromQuery(query),
	}

	if e.sem.TryAcquire(1) {
		go func() {
			defer e.sem.Release(1)
			e.sendEvent(context.WithoutCancel(ctx), query.Namespace, event)
		}()
	} else {
		log.V(1).Info("semaphore full, dropping event", "namespace", query.Namespace, "reason", reason)
	}
}

func (e *BrokerEventEmitter) getEndpointForNamespace(ctx context.Context, namespace string) (string, error) {
	if e.resolveEndpoint != nil {
		return e.resolveEndpoint(ctx, namespace)
	}
	return routing.ResolveBrokerEndpoint(ctx, e.k8sClient, namespace)
}

func (e *BrokerEventEmitter) sendEvent(ctx context.Context, namespace string, event Event) {
	baseURL, err := e.getEndpointForNamespace(ctx, namespace)
	if err != nil {
		log.Error(err, "failed to resolve broker endpoint", "namespace", namespace, "reason", event.Reason)
		return
	}
	if baseURL == "" {
		log.V(1).Info("no broker endpoint for namespace, dropping event", "namespace", namespace, "reason", event.Reason)
		return
	}
	endpoint := baseURL + "/events"

	body, err := json.Marshal(event)
	if err != nil {
		log.Error(err, "failed to marshal event")
		return
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		log.Error(err, "failed to create request", "endpoint", endpoint)
		return
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := e.httpClient.Do(req)
	if err != nil {
		log.Error(err, "failed to send event to broker", "endpoint", endpoint)
		return
	}
	defer func() {
		if err := resp.Body.Close(); err != nil {
			log.Error(err, "failed to close response body")
		}
	}()

	if resp.StatusCode != http.StatusCreated {
		log.Error(fmt.Errorf("unexpected status code: %d", resp.StatusCode), "failed to send event to broker", "endpoint", endpoint)
	}
}
