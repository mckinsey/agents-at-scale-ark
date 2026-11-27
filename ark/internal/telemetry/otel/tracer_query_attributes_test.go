/* Copyright 2025. McKinsey & Company */

package otel

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"go.opentelemetry.io/otel/attribute"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/telemetry"
)

func queryAttributes(query *arkv1alpha1.Query) map[attribute.Key]string {
	values := map[attribute.Key]string{}
	for _, attr := range extractQueryAttributesFromContext(SetQueryInContext(context.Background(), query)) {
		values[attr.Key] = attr.Value.AsString()
	}
	return values
}

func TestQueryAttributesIncludeStandardSessionID(t *testing.T) {
	t.Run("uses the query session id", func(t *testing.T) {
		query := &arkv1alpha1.Query{ObjectMeta: metav1.ObjectMeta{Name: "q", UID: types.UID("uid-1")}}
		query.Spec.SessionId = "session-123"

		values := queryAttributes(query)

		assert.Equal(t, "session-123", values[telemetry.AttrSessionID])
		assert.Equal(t, "session-123", values[telemetry.AttrStandardSessionID])
	})

	t.Run("falls back to the query uid", func(t *testing.T) {
		query := &arkv1alpha1.Query{ObjectMeta: metav1.ObjectMeta{Name: "q", UID: types.UID("uid-1")}}

		values := queryAttributes(query)

		assert.Equal(t, "uid-1", values[telemetry.AttrSessionID])
		assert.Equal(t, "uid-1", values[telemetry.AttrStandardSessionID])
	})
}
