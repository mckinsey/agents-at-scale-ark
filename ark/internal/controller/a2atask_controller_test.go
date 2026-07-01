/* Copyright 2025. McKinsey & Company */

package controller

import (
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestComputePollBackoff(t *testing.T) {
	base := 5 * time.Second
	tests := []struct {
		name        string
		failures    int
		rateLimited bool
		want        time.Duration
	}{
		{"zero failures uses base", 0, false, 5 * time.Second},
		{"first failure doubles", 1, false, 10 * time.Second},
		{"second failure", 2, false, 20 * time.Second},
		{"third failure", 3, false, 40 * time.Second},
		{"fourth failure", 4, false, 80 * time.Second},
		{"fifth failure", 5, false, 160 * time.Second},
		{"sixth failure caps at five minutes", 6, false, 5 * time.Minute},
		{"large count stays capped, no overflow", 1000, false, 5 * time.Minute},
		{"rate limited applies floor", 1, true, 30 * time.Second},
		{"rate limited above floor unaffected", 4, true, 80 * time.Second},
		{"rate limited still capped", 100, true, 5 * time.Minute},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, computePollBackoff(tt.failures, base, tt.rateLimited))
		})
	}
}

func TestComputePollBackoff_BoundsForAnyInput(t *testing.T) {
	for failures := -5; failures < 200; failures++ {
		got := computePollBackoff(failures, 5*time.Second, false)
		assert.Greater(t, got, time.Duration(0), "failures=%d produced non-positive backoff", failures)
		assert.LessOrEqual(t, got, maxPollBackoff, "failures=%d exceeded cap", failures)
	}
}

func TestComputePollBackoff_DefaultsBaseWhenNonPositive(t *testing.T) {
	assert.Equal(t, defaultPollInterval, computePollBackoff(0, 0, false))
}

func TestIsRateLimited(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{"nil error", nil, false},
		{"429 from client", errors.New("failed to get task status from A2A server: a2aClient.doRequest: unexpected http status 429: too many requests"), true},
		{"402 maxVms quota", errors.New("a2aClient.doRequest: unexpected http status 402: maxVms limit exceeded"), true},
		{"503 unavailable", errors.New("a2aClient.doRequest: unexpected http status 503: service unavailable"), true},
		{"500 is not throttle", errors.New("a2aClient.doRequest: unexpected http status 500: internal error"), false},
		{"non-http error", errors.New("dial tcp: connection refused"), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, isRateLimited(tt.err))
		})
	}
}

func TestParseFailureCount(t *testing.T) {
	t.Run("nil annotations", func(t *testing.T) {
		c, err := parseFailureCount(nil)
		assert.NoError(t, err)
		assert.Equal(t, 0, c)
	})
	t.Run("missing key", func(t *testing.T) {
		c, err := parseFailureCount(map[string]string{"unrelated": "9"})
		assert.NoError(t, err)
		assert.Equal(t, 0, c)
	})
	t.Run("valid count", func(t *testing.T) {
		c, err := parseFailureCount(map[string]string{pollFailureCountAnnotation: "7"})
		assert.NoError(t, err)
		assert.Equal(t, 7, c)
	})
	t.Run("corrupted value surfaces error", func(t *testing.T) {
		c, err := parseFailureCount(map[string]string{pollFailureCountAnnotation: "not-a-number"})
		assert.Error(t, err)
		assert.Equal(t, 0, c)
	})
}

func TestFailureCountRoundTrip(t *testing.T) {
	r := &A2ATaskReconciler{}
	task := &arkv1alpha1.A2ATask{}

	r.recordFailure(task, 3)
	assert.Equal(t, "3", task.Annotations[pollFailureCountAnnotation])

	count, err := parseFailureCount(task.Annotations)
	assert.NoError(t, err)
	assert.Equal(t, 3, count)

	r.recordFailure(task, 0)
	count, err = parseFailureCount(task.Annotations)
	assert.NoError(t, err)
	assert.Equal(t, 0, count)
}

func TestStatusSnapshotDetectsChanges(t *testing.T) {
	base := arkv1alpha1.A2ATaskStatus{Phase: "running", ProtocolState: "working"}
	before := snapshotA2ATaskStatus(&base)

	t.Run("error-only change is detected", func(t *testing.T) {
		changed := base
		changed.Error = "transient failure"
		assert.NotEqual(t, before, snapshotA2ATaskStatus(&changed))
	})
	t.Run("phase change is detected", func(t *testing.T) {
		changed := base
		changed.Phase = "completed"
		assert.NotEqual(t, before, snapshotA2ATaskStatus(&changed))
	})
	t.Run("protocol state change is detected", func(t *testing.T) {
		changed := base
		changed.ProtocolState = "completed"
		assert.NotEqual(t, before, snapshotA2ATaskStatus(&changed))
	})
	t.Run("no change is stable", func(t *testing.T) {
		same := base
		assert.Equal(t, before, snapshotA2ATaskStatus(&same))
	})
}
