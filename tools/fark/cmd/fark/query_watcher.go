package main

import (
	"context"
	"fmt"
	"time"

	"go.uber.org/zap"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/fields"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/watch"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

type QueryResult struct {
	Query          *arkv1alpha1.Query
	Phase          string
	Event          *unstructured.Unstructured
	IsEvent        bool
	Done           bool
	Error          error
	SpinnerCommand string // "start" or "stop"
}

type QueryWatcher struct {
	config    *Config
	queryName string
	namespace string
	logger    *zap.Logger
}

func NewQueryWatcher(config *Config, queryName, namespace string, logger *zap.Logger) *QueryWatcher {
	return &QueryWatcher{
		config:    config,
		queryName: queryName,
		namespace: namespace,
		logger:    logger,
	}
}

func (qw *QueryWatcher) Watch(ctx context.Context) (<-chan QueryResult, error) {
	resultChan := make(chan QueryResult, 10)

	queryWatch, err := qw.createQueryWatcher(ctx)
	if err != nil {
		close(resultChan)
		return nil, fmt.Errorf("failed to create query watcher: %v", err)
	}

	eventWatch, err := qw.createEventWatcher(ctx)
	if err != nil {
		qw.logger.Warn("Failed to create event watcher", zap.Error(err))
	}

	go qw.processEvents(ctx, queryWatch, eventWatch, resultChan)

	return resultChan, nil
}

func (qw *QueryWatcher) createQueryWatcher(ctx context.Context) (watch.Interface, error) {
	return qw.config.DynamicClient.Resource(GetGVR(ResourceQuery)).Namespace(qw.namespace).Watch(
		ctx,
		metav1.ListOptions{
			FieldSelector: fields.OneTermEqualSelector("metadata.name", qw.queryName).String(),
		},
	)
}

func (qw *QueryWatcher) createEventWatcher(ctx context.Context) (watch.Interface, error) {
	return qw.config.DynamicClient.Resource(GetGVR(ResourceEvent)).Namespace(qw.namespace).Watch(
		ctx,
		metav1.ListOptions{
			FieldSelector: fields.OneTermEqualSelector("involvedObject.name", qw.queryName).String(),
		},
	)
}

func (qw *QueryWatcher) processEvents(ctx context.Context, queryWatch, eventWatch watch.Interface, resultChan chan<- QueryResult) {
	defer close(resultChan)
	defer queryWatch.Stop()
	if eventWatch != nil {
		defer eventWatch.Stop()
	}

	var gracePeriodTimer *time.Timer
	var queryCompleted bool

	for {
		select {
		case event, ok := <-queryWatch.ResultChan():

			if !ok {
				// The query watch channel closed. Send a done signal.
				qw.sendResult(resultChan, QueryResult{Done: true, SpinnerCommand: "stop"})
				return
			}

			if event.Type == watch.Error {
				qw.sendResult(resultChan, QueryResult{Error: fmt.Errorf("query watch error: %v", event.Object), Done: true, SpinnerCommand: "stop"})
				return
			}

			if result := qw.processQueryEvent(event); result != nil {
				qw.sendResult(resultChan, *result)
				if result.Done && !queryCompleted {
					// Query is done, but start a grace period to capture remaining completion events
					queryCompleted = true
					gracePeriodTimer = time.NewTimer(500 * time.Millisecond)
				}
			}

		case event, ok := <-qw.getEventChannel(eventWatch):
			if !ok {
				continue
			}

			if event.Type == watch.Error {
				qw.logger.Error("Event watch error", zap.Any("error", event.Object))
				continue
			}

			if result := qw.processKubernetesEvent(event); result != nil {
				qw.sendResult(resultChan, *result)
			}

		case <-func() <-chan time.Time {
			if gracePeriodTimer != nil {
				return gracePeriodTimer.C
			}
			return make(chan time.Time) // Never fires
		}():
			// Grace period expired, now we can exit
			return

		case <-ctx.Done():
			qw.sendResult(resultChan, QueryResult{Error: ctx.Err(), Done: true, SpinnerCommand: "stop"})
			return
		}
	}
}

func (qw *QueryWatcher) processQueryEvent(event watch.Event) *QueryResult {
	if event.Object == nil {
		return nil
	}

	query, err := qw.convertToQuery(event.Object)
	if err != nil {
		return &QueryResult{Error: err}
	}

	// Log token usage when query completes
	if query.Status.Phase == "done" || query.Status.Phase == "error" {
		logTokenUsage(qw.logger, query, "")
	}

	result := &QueryResult{
		Query: query,
		Phase: query.Status.Phase,
		Done:  query.Status.Phase == "done" || query.Status.Phase == "error",
	}

	if result.Done {
		result.SpinnerCommand = "stop"
	} else if result.Phase == "running" && !result.IsEvent {
		result.SpinnerCommand = "start"
	} else if result.Phase == "provisioning" {
		result.SpinnerCommand = "start"
	}

	return result
}

func (qw *QueryWatcher) processKubernetesEvent(event watch.Event) *QueryResult {
	if event.Object == nil {
		return nil
	}

	unstructuredObj, ok := event.Object.(*unstructured.Unstructured)
	if !ok {
		return nil
	}

	return &QueryResult{
		Event:   unstructuredObj,
		IsEvent: true,
	}
}

func (qw *QueryWatcher) convertToQuery(obj any) (*arkv1alpha1.Query, error) {
	unstructuredObj, ok := obj.(*unstructured.Unstructured)
	if !ok {
		return nil, fmt.Errorf("invalid object type")
	}

	var query arkv1alpha1.Query
	err := runtime.DefaultUnstructuredConverter.FromUnstructured(
		unstructuredObj.UnstructuredContent(),
		&query,
	)
	return &query, err
}

func (qw *QueryWatcher) getEventChannel(eventWatch watch.Interface) <-chan watch.Event {
	if eventWatch == nil {
		ch := make(chan watch.Event)
		close(ch)
		return ch
	}
	return eventWatch.ResultChan()
}

func (qw *QueryWatcher) sendResult(resultChan chan<- QueryResult, result QueryResult) {
	select {
	case resultChan <- result:
	default:
		qw.logger.Warn("Result channel full, dropping result")
	}
}
