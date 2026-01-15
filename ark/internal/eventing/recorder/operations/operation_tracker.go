package operations

import (
	"context"
	"fmt"
	"time"

	corev1 "k8s.io/api/core/v1"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/eventing"
)

type (
	queryDetailsKeyType     struct{}
	operationDetailsKeyType struct{}
	operationStartTimeKey   struct{}
)

var (
	queryDetailsKey     = queryDetailsKeyType{}
	operationDetailsKey = operationDetailsKeyType{}
	operationStartKey   = operationStartTimeKey{}
)

type QueryDetails struct {
	Query          *arkv1alpha1.Query
	QueryID        string
	QueryName      string
	Namespace      string
	SessionID      string
	ConversationID string
}

type OperationTracker struct {
	emitter eventing.EventEmitter
}

func NewOperationTracker(emitter eventing.EventEmitter) OperationTracker {
	return OperationTracker{
		emitter: emitter,
	}
}

func (ot *OperationTracker) InitializeQueryContext(ctx context.Context, query *arkv1alpha1.Query) context.Context {
	sessionID := query.Spec.SessionId
	if sessionID == "" {
		sessionID = string(query.UID)
	}

	conversationID := query.Status.ConversationId

	qd := &QueryDetails{
		Query:          query,
		QueryID:        string(query.UID),
		QueryName:      query.Name,
		Namespace:      query.Namespace,
		SessionID:      sessionID,
		ConversationID: conversationID,
	}

	return context.WithValue(ctx, queryDetailsKey, qd)
}

func (ot *OperationTracker) GetQueryDetails(ctx context.Context) *QueryDetails {
	if v := ctx.Value(queryDetailsKey); v != nil {
		if qd, ok := v.(*QueryDetails); ok {
			return qd
		}
	}
	return nil
}

func (ot *OperationTracker) getOperationDetails(ctx context.Context) map[string]string {
	if v := ctx.Value(operationDetailsKey); v != nil {
		if metadata, ok := v.(map[string]string); ok {
			return metadata
		}
	}
	return nil
}

func (ot *OperationTracker) addTimestamp(data map[string]string, message string) (map[string]string, string) {
	timestamp := time.Now().Format(time.RFC3339Nano)
	data["message"] = message
	data["timestamp"] = timestamp
	messageWithTimestamp := fmt.Sprintf("%s (timestamp: %s)", message, timestamp)
	return data, messageWithTimestamp
}

func (ot *OperationTracker) addDuration(ctx context.Context, data map[string]string) {
	if v := ctx.Value(operationStartKey); v != nil {
		if startTime, ok := v.(time.Time); ok {
			duration := time.Since(startTime)
			data["durationMs"] = fmt.Sprintf("%.2f", duration.Seconds()*1000)
		}
	}
}

func (ot *OperationTracker) buildOperationData(ctx context.Context, additionalData map[string]string) (map[string]string, *arkv1alpha1.Query) {
	result := make(map[string]string)

	qd := ot.GetQueryDetails(ctx)
	if qd == nil {
		return result, nil
	}

	result["queryId"] = qd.QueryID
	result["queryName"] = qd.QueryName
	result["queryNamespace"] = qd.Namespace
	result["sessionId"] = qd.SessionID
	if qd.ConversationID != "" {
		result["conversationId"] = qd.ConversationID
	}

	opDetails := ot.getOperationDetails(ctx)
	for k, v := range opDetails {
		result[k] = v
	}

	for k, v := range additionalData {
		result[k] = v
	}

	return result, qd.Query
}

func (ot *OperationTracker) Start(ctx context.Context, operation, message string, data map[string]string) context.Context {
	startTime := time.Now()
	ctx = context.WithValue(ctx, operationDetailsKey, data)
	ctx = context.WithValue(ctx, operationStartKey, startTime)

	operationData, query := ot.buildOperationData(ctx, nil)
	if query == nil {
		return ctx
	}

	operationData, messageWithTimestamp := ot.addTimestamp(operationData, message)

	ot.emitter.EmitStructured(ctx, query, corev1.EventTypeNormal, operation+"Start", messageWithTimestamp, operationData)

	return ctx
}

func (ot *OperationTracker) Complete(ctx context.Context, operation, message string, data map[string]string) {
	operationData, query := ot.buildOperationData(ctx, data)
	if query == nil {
		return
	}

	ot.addDuration(ctx, operationData)
	operationData, messageWithTimestamp := ot.addTimestamp(operationData, message)

	ot.emitter.EmitStructured(ctx, query, corev1.EventTypeNormal, operation+"Complete", messageWithTimestamp, operationData)
}

func (ot *OperationTracker) Fail(ctx context.Context, operation, message string, err error, data map[string]string) {
	if data == nil {
		data = make(map[string]string)
	}
	data["error"] = err.Error()

	operationData, query := ot.buildOperationData(ctx, data)
	if query == nil {
		return
	}

	ot.addDuration(ctx, operationData)
	operationData, messageWithTimestamp := ot.addTimestamp(operationData, message)

	ot.emitter.EmitStructured(ctx, query, corev1.EventTypeWarning, operation+"Error", messageWithTimestamp, operationData)
}
