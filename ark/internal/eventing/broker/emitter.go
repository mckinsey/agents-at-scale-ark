package broker

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/runtime"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/telemetry/routing"
)

var log = logf.Log.WithName("eventing.broker")

type Event struct {
	Timestamp string                 `json:"timestamp"`
	EventType string                 `json:"eventType"`
	Reason    string                 `json:"reason"`
	Message   string                 `json:"message"`
	Data      map[string]interface{} `json:"data"`
}

type BrokerEventEmitter struct {
	httpClient *http.Client
	endpoints  map[string]string
}

func NewBrokerEventEmitter(endpoints []routing.BrokerEndpoint) eventing.EventEmitter {
	endpointMap := make(map[string]string)
	for _, ep := range endpoints {
		endpointMap[ep.Namespace] = ep.Endpoint + "/events"
	}

	return &BrokerEventEmitter{
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
		endpoints: endpointMap,
	}
}

func (e *BrokerEventEmitter) getEndpointForNamespace(namespace string) string {
	if endpoint, ok := e.endpoints[namespace]; ok {
		return endpoint
	}
	return ""
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

	endpoint := e.getEndpointForNamespace(query.Namespace)
	if endpoint == "" {
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
		Timestamp: time.Now().Format(time.RFC3339Nano),
		EventType: eventType,
		Reason:    reason,
		Message:   message,
		Data:      eventData,
	}

	go e.sendEvent(endpoint, event)
}

func (e *BrokerEventEmitter) sendEvent(endpoint string, event Event) {
	body, err := json.Marshal(event)
	if err != nil {
		log.Error(err, "failed to marshal event")
		return
	}

	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
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
