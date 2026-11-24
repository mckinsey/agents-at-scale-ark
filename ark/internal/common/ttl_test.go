/* Copyright 2025. McKinsey & Company */

package common

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestTtlSecondsFromQuery(t *testing.T) {
	tests := []struct {
		name        string
		queryTTL    *metav1.Duration
		expectNil   bool
		expectedSec int64
	}{
		{
			name:        "1 hour TTL converts to 3600 seconds",
			queryTTL:    &metav1.Duration{Duration: time.Hour},
			expectNil:   false,
			expectedSec: 3600,
		},
		{
			name:        "30 days converts to 2592000 seconds",
			queryTTL:    &metav1.Duration{Duration: 30 * 24 * time.Hour},
			expectNil:   false,
			expectedSec: 2592000,
		},
		{
			name:      "nil TTL stays nil",
			queryTTL:  nil,
			expectNil: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			query := &arkv1alpha1.Query{
				Spec: arkv1alpha1.QuerySpec{TTL: tt.queryTTL},
			}

			result := TtlSecondsFromQuery(query)

			if tt.expectNil {
				require.Nil(t, result)
			} else {
				require.NotNil(t, result)
				require.Equal(t, tt.expectedSec, *result)
			}
		})
	}
}
