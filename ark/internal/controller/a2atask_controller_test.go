/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
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

func TestPollIntervalOrDefault(t *testing.T) {
	t.Run("defaults when unset", func(t *testing.T) {
		assert.Equal(t, defaultPollInterval, pollIntervalOrDefault(&arkv1alpha1.A2ATask{}))
	})
	t.Run("uses configured interval", func(t *testing.T) {
		task := &arkv1alpha1.A2ATask{Spec: arkv1alpha1.A2ATaskSpec{PollInterval: &metav1.Duration{Duration: 90 * time.Second}}}
		assert.Equal(t, 90*time.Second, pollIntervalOrDefault(task))
	})
}

func TestGetFailureCount(t *testing.T) {
	r := &A2ATaskReconciler{}
	ctx := context.Background()
	t.Run("valid annotation", func(t *testing.T) {
		task := &arkv1alpha1.A2ATask{ObjectMeta: metav1.ObjectMeta{Annotations: map[string]string{pollFailureCountAnnotation: "4"}}}
		assert.Equal(t, 4, r.getFailureCount(ctx, task))
	})
	t.Run("missing annotation is zero", func(t *testing.T) {
		assert.Equal(t, 0, r.getFailureCount(ctx, &arkv1alpha1.A2ATask{}))
	})
	t.Run("corrupted annotation resets to zero", func(t *testing.T) {
		task := &arkv1alpha1.A2ATask{ObjectMeta: metav1.ObjectMeta{Annotations: map[string]string{pollFailureCountAnnotation: "bad"}}}
		assert.Equal(t, 0, r.getFailureCount(ctx, task))
	})
}

func TestReconcileTTL(t *testing.T) {
	ctx := context.Background()

	t.Run("not expired keeps the task", func(t *testing.T) {
		task := &arkv1alpha1.A2ATask{
			ObjectMeta: metav1.ObjectMeta{Name: "fresh", Namespace: "default", CreationTimestamp: metav1.Now()},
		}
		r := &A2ATaskReconciler{Client: fake.NewClientBuilder().WithScheme(newTestScheme()).WithObjects(task).Build()}

		done, err := r.reconcileTTL(ctx, task)
		assert.NoError(t, err)
		assert.False(t, done)
		assert.NoError(t, r.Get(ctx, client.ObjectKeyFromObject(task), &arkv1alpha1.A2ATask{}))
	})

	t.Run("expired deletes the task", func(t *testing.T) {
		task := &arkv1alpha1.A2ATask{
			ObjectMeta: metav1.ObjectMeta{
				Name:              "stale",
				Namespace:         "default",
				CreationTimestamp: metav1.NewTime(time.Now().Add(-2 * time.Hour)),
			},
			Spec: arkv1alpha1.A2ATaskSpec{TTL: &metav1.Duration{Duration: time.Hour}},
		}
		r := &A2ATaskReconciler{Client: fake.NewClientBuilder().WithScheme(newTestScheme()).WithObjects(task).Build()}

		done, err := r.reconcileTTL(ctx, task)
		assert.NoError(t, err)
		assert.True(t, done)
		assert.True(t, apierrors.IsNotFound(r.Get(ctx, client.ObjectKeyFromObject(task), &arkv1alpha1.A2ATask{})))
	})
}

func TestReconcileTimeout(t *testing.T) {
	ctx := context.Background()

	t.Run("within timeout is a no-op", func(t *testing.T) {
		task := &arkv1alpha1.A2ATask{
			ObjectMeta: metav1.ObjectMeta{Name: "live", Namespace: "default", CreationTimestamp: metav1.Now()},
		}
		r := &A2ATaskReconciler{Client: fake.NewClientBuilder().WithScheme(newTestScheme()).WithObjects(task).WithStatusSubresource(task).Build()}

		done, err := r.reconcileTimeout(ctx, task)
		assert.NoError(t, err)
		assert.False(t, done)
		assert.NotEqual(t, arka2a.PhaseFailed, task.Status.Phase)
	})

	t.Run("exceeded timeout marks the task failed", func(t *testing.T) {
		task := &arkv1alpha1.A2ATask{
			ObjectMeta: metav1.ObjectMeta{
				Name:              "expired",
				Namespace:         "default",
				CreationTimestamp: metav1.NewTime(time.Now().Add(-2 * time.Hour)),
			},
			Spec: arkv1alpha1.A2ATaskSpec{Timeout: &metav1.Duration{Duration: time.Hour}},
		}
		r := &A2ATaskReconciler{Client: fake.NewClientBuilder().WithScheme(newTestScheme()).WithObjects(task).WithStatusSubresource(task).Build()}

		done, err := r.reconcileTimeout(ctx, task)
		assert.NoError(t, err)
		assert.True(t, done)
		assert.Equal(t, arka2a.PhaseFailed, task.Status.Phase)
		assert.NotEmpty(t, task.Status.Error)
		assert.NotNil(t, task.Status.CompletionTime)
	})
}
