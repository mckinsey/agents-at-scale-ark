/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"errors"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/telemetry"
	"mckinsey.com/ark/internal/telemetry/mock"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	testQueryName    = "test-query"
	testNamespace    = "default"
	testSessionID    = "session-123"
	queryExecuteSpan = "query.execute"
)

func newTestQuery() *arkv1alpha1.Query {
	return &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{
			Name:      testQueryName,
			Namespace: testNamespace,
		},
	}
}

// TestQueryRecorderBasicOperations verifies basic QueryRecorder creation and span lifecycle
func TestQueryRecorderBasicOperations(t *testing.T) {
	mockTracer := mock.NewTracer()
	mockRecorder := mock.NewQueryRecorder(mockTracer)
	ctx := context.Background()
	testQuery := newTestQuery()

	// Create a query span
	_, span := mockRecorder.StartQuery(ctx, testQuery, "execute")
	assert.NotNil(t, span, "span should not be nil")

	// End the span
	span.End()

	// Verify span was created and ended
	spans := mockTracer.Spans
	require.Len(t, spans, 1, "should have 1 span")
	assert.Equal(t, queryExecuteSpan, spans[0].Name)
	assert.True(t, spans[0].Ended, "span should be ended")
}

// TestQueryRecorderSessionTracking verifies session ID recording
func TestQueryRecorderSessionTracking(t *testing.T) {
	mockTracer := mock.NewTracer()
	mockRecorder := mock.NewQueryRecorder(mockTracer)
	ctx := context.Background()
	testQuery := newTestQuery()

	_, span := mockRecorder.StartQuery(ctx, testQuery, "execute")
	mockRecorder.RecordSessionID(span, testSessionID)
	span.End()

	// Verify session ID was recorded
	querySpan := mockTracer.FindSpan(queryExecuteSpan)
	require.NotNil(t, querySpan, "query span should exist")
	assert.Equal(t, testSessionID, querySpan.GetAttributeString(telemetry.AttrSessionID))
}

// TestQueryRecorderTokenUsage verifies token usage recording
func TestQueryRecorderTokenUsage(t *testing.T) {
	mockTracer := mock.NewTracer()
	mockRecorder := mock.NewQueryRecorder(mockTracer)
	ctx := context.Background()
	testQuery := newTestQuery()

	_, span := mockRecorder.StartQuery(ctx, testQuery, "execute")
	mockRecorder.RecordTokenUsage(span, 100, 50, 150)
	span.End()

	// Verify token usage
	querySpan := mockTracer.FindSpan(queryExecuteSpan)
	require.NotNil(t, querySpan, "query span should exist")
	assert.Equal(t, int64(100), querySpan.GetAttributeInt64(telemetry.AttrTokensPrompt))
	assert.Equal(t, int64(50), querySpan.GetAttributeInt64(telemetry.AttrTokensCompletion))
	assert.Equal(t, int64(150), querySpan.GetAttributeInt64(telemetry.AttrTokensTotal))
}

// TestQueryRecorderErrorHandling verifies error recording
func TestQueryRecorderErrorHandling(t *testing.T) {
	mockTracer := mock.NewTracer()
	mockRecorder := mock.NewQueryRecorder(mockTracer)
	ctx := context.Background()
	testQuery := newTestQuery()

	_, span := mockRecorder.StartQuery(ctx, testQuery, "execute")
	testErr := errors.New("test error")
	mockRecorder.RecordError(span, testErr)
	span.End()

	// Verify error was recorded
	querySpan := mockTracer.FindSpan(queryExecuteSpan)
	require.NotNil(t, querySpan, "query span should exist")
	assert.NotEmpty(t, querySpan.Errors, "should have recorded error")
	assert.Contains(t, querySpan.Errors[0].Error(), "test error")
	assert.Equal(t, telemetry.StatusError, querySpan.Status)
}

// TestQueryRecorderSuccessRecording verifies success recording
func TestQueryRecorderSuccessRecording(t *testing.T) {
	mockTracer := mock.NewTracer()
	mockRecorder := mock.NewQueryRecorder(mockTracer)
	ctx := context.Background()
	testQuery := newTestQuery()

	_, span := mockRecorder.StartQuery(ctx, testQuery, "execute")
	mockRecorder.RecordSuccess(span)
	span.End()

	// Verify success was recorded
	querySpan := mockTracer.FindSpan(queryExecuteSpan)
	require.NotNil(t, querySpan, "query span should exist")
	assert.Equal(t, telemetry.StatusOk, querySpan.Status)
	assert.Equal(t, "success", querySpan.StatusDesc)
}
