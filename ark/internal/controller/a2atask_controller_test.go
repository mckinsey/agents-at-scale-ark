/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"errors"
	"testing"
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"github.com/stretchr/testify/assert"
	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
)

var _ = Describe("A2ATask Controller", func() {
	Context("When reconciling an A2ATask resource", func() {
		const resourceName = "test-a2atask"

		ctx := context.Background()

		typeNamespacedName := types.NamespacedName{
			Name:      resourceName,
			Namespace: "default",
		}
		a2aTask := &arkv1alpha1.A2ATask{}

		BeforeEach(func() {
			By("creating the A2ATask resource")
			err := k8sClient.Get(ctx, typeNamespacedName, a2aTask)
			if err != nil && k8serrors.IsNotFound(err) {
				resource := &arkv1alpha1.A2ATask{
					ObjectMeta: metav1.ObjectMeta{
						Name:      resourceName,
						Namespace: "default",
					},
					Spec: arkv1alpha1.A2ATaskSpec{
						TaskID: "test-task-123",
						QueryRef: arkv1alpha1.QueryRef{
							Name: "test-query",
						},
						AgentRef: arkv1alpha1.AgentRef{
							Name: "test-agent",
						},
					},
				}
				Expect(k8sClient.Create(ctx, resource)).To(Succeed())
			}
		})

		AfterEach(func() {
			By("Cleanup the A2ATask resource")
			resource := &arkv1alpha1.A2ATask{}
			err := k8sClient.Get(ctx, typeNamespacedName, resource)
			Expect(err).NotTo(HaveOccurred())

			Expect(k8sClient.Delete(ctx, resource)).To(Succeed())
		})

		It("should successfully reconcile the resource", func() {
			By("Reconciling the created resource")
			controllerReconciler := &A2ATaskReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}

			_, err := controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: typeNamespacedName,
			})
			Expect(err).NotTo(HaveOccurred())
		})

		It("should handle approval timeout for input-required phase", func() {
			By("Creating an A2ATask in input-required phase with expired timeout")
			taskName := "test-approval-timeout"
			expiredTime := metav1.NewTime(time.Now().Add(-10 * time.Minute))

			task := &arkv1alpha1.A2ATask{
				ObjectMeta: metav1.ObjectMeta{
					Name:      taskName,
					Namespace: "default",
				},
				Spec: arkv1alpha1.A2ATaskSpec{
					TaskID: "timeout-task-456",
					QueryRef: arkv1alpha1.QueryRef{
						Name: "test-query",
					},
					AgentRef: arkv1alpha1.AgentRef{
						Name: "test-agent",
					},
				},
				Status: arkv1alpha1.A2ATaskStatus{
					Phase: arka2a.PhaseInputRequired,
					ProtocolMetadata: map[string]string{
						"requestedInputAt": expiredTime.Format(time.RFC3339),
						"timeout":          "5m",
						"onTimeout":        "reject",
					},
				},
			}
			Expect(k8sClient.Create(ctx, task)).To(Succeed())

			// Update status separately (status is a subresource in K8s)
			task.Status.Phase = arka2a.PhaseInputRequired
			task.Status.ProtocolMetadata = map[string]string{
				"requestedInputAt": expiredTime.Format(time.RFC3339),
				"timeout":          "5m",
				"onTimeout":        "reject",
			}
			task.Status.StartTime = &expiredTime
			task.Status.Conditions = []metav1.Condition{
				{
					Type:               string(arkv1alpha1.A2ATaskCompleted),
					Status:             metav1.ConditionFalse,
					Reason:             "TaskRunning",
					Message:            "Task is running",
					LastTransitionTime: metav1.Now(),
					ObservedGeneration: task.Generation,
				},
			}
			Expect(k8sClient.Status().Update(ctx, task)).To(Succeed())

			By("Reconciling to handle the timeout")
			controllerReconciler := &A2ATaskReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}

			_, err := controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: types.NamespacedName{
					Name:      taskName,
					Namespace: "default",
				},
			})
			Expect(err).NotTo(HaveOccurred())

			By("Verifying the task was moved to failed phase")
			updatedTask := &arkv1alpha1.A2ATask{}
			Expect(k8sClient.Get(ctx, types.NamespacedName{Name: taskName, Namespace: "default"}, updatedTask)).To(Succeed())
			Expect(updatedTask.Status.Phase).To(Equal(arka2a.PhaseFailed))

			// Cleanup
			Expect(k8sClient.Delete(ctx, task)).To(Succeed())
		})

		It("should handle input submission and transition to completed", func() {
			By("Creating an A2ATask in input-required phase")
			taskName := "test-input-submission"

			task := &arkv1alpha1.A2ATask{
				ObjectMeta: metav1.ObjectMeta{
					Name:      taskName,
					Namespace: "default",
				},
				Spec: arkv1alpha1.A2ATaskSpec{
					TaskID: "input-task-789",
					QueryRef: arkv1alpha1.QueryRef{
						Name: "test-query",
					},
					AgentRef: arkv1alpha1.AgentRef{
						Name: "test-agent",
					},
					Input: `{"decision": "approved"}`,
				},
				Status: arkv1alpha1.A2ATaskStatus{
					Phase: arka2a.PhaseInputRequired,
				},
			}
			Expect(k8sClient.Create(ctx, task)).To(Succeed())

			// Update status separately (status is a subresource in K8s)
			startTime := metav1.Now()
			task.Status.Phase = arka2a.PhaseInputRequired
			task.Status.StartTime = &startTime
			task.Status.Conditions = []metav1.Condition{
				{
					Type:               string(arkv1alpha1.A2ATaskCompleted),
					Status:             metav1.ConditionFalse,
					Reason:             "TaskRunning",
					Message:            "Task is running",
					LastTransitionTime: metav1.Now(),
					ObservedGeneration: task.Generation,
				},
			}
			Expect(k8sClient.Status().Update(ctx, task)).To(Succeed())

			By("Reconciling to handle the input")
			controllerReconciler := &A2ATaskReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}

			_, err := controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: types.NamespacedName{
					Name:      taskName,
					Namespace: "default",
				},
			})
			Expect(err).NotTo(HaveOccurred())

			By("Verifying the task was moved to completed phase")
			updatedTask := &arkv1alpha1.A2ATask{}
			Expect(k8sClient.Get(ctx, types.NamespacedName{Name: taskName, Namespace: "default"}, updatedTask)).To(Succeed())
			Expect(updatedTask.Status.Phase).To(Equal(arka2a.PhaseCompleted))

			// Cleanup
			Expect(k8sClient.Delete(ctx, task)).To(Succeed())
		})
	})
})

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

func TestReconcileTimeout_SkipsHITLTasks(t *testing.T) {
	// HITL approval tasks have no A2A server to poll, so the polling timeout
	// must not flip them to failed; their expiry is governed by
	// checkApprovalTimeout (driven by status.protocolMetadata.timeout) instead.
	r := &A2ATaskReconciler{}
	task := &arkv1alpha1.A2ATask{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "hitl-task",
			Namespace:         "default",
			CreationTimestamp: metav1.NewTime(time.Now().Add(-24 * time.Hour)),
		},
		Spec: arkv1alpha1.A2ATaskSpec{
			TaskID:       "hitl-1",
			A2AServerRef: nil,
			Timeout:      &metav1.Duration{Duration: 1 * time.Minute},
		},
		Status: arkv1alpha1.A2ATaskStatus{Phase: arka2a.PhaseInputRequired},
	}

	handled, err := r.reconcileTimeout(context.Background(), task)
	assert.NoError(t, err)
	assert.False(t, handled, "reconcileTimeout must be a no-op for HITL tasks")
	assert.Equal(t, arka2a.PhaseInputRequired, task.Status.Phase, "phase must not change")
	assert.Empty(t, task.Status.Error, "error must not be set")
}

func TestCheckApprovalTimeout(t *testing.T) {
	r := &A2ATaskReconciler{}
	ctx := context.Background()
	past := metav1.NewTime(time.Now().Add(-2 * time.Hour))
	future := metav1.NewTime(time.Now().Add(2 * time.Hour))

	taskWith := func(meta map[string]string, start *metav1.Time) *arkv1alpha1.A2ATask {
		return &arkv1alpha1.A2ATask{
			Spec:   arkv1alpha1.A2ATaskSpec{TaskID: "t"},
			Status: arkv1alpha1.A2ATaskStatus{ProtocolMetadata: meta, StartTime: start, Phase: arka2a.PhaseInputRequired},
		}
	}

	t.Run("no protocol metadata", func(t *testing.T) {
		handled, err := r.checkApprovalTimeout(ctx, &arkv1alpha1.A2ATask{})
		assert.NoError(t, err)
		assert.False(t, handled)
	})

	t.Run("no timeout key", func(t *testing.T) {
		handled, err := r.checkApprovalTimeout(ctx, taskWith(map[string]string{"onTimeout": "reject"}, &past))
		assert.NoError(t, err)
		assert.False(t, handled)
	})

	t.Run("invalid timeout format returns error", func(t *testing.T) {
		handled, err := r.checkApprovalTimeout(ctx, taskWith(map[string]string{"timeout": "not-a-duration"}, &past))
		assert.Error(t, err)
		assert.False(t, handled)
	})

	t.Run("no start time", func(t *testing.T) {
		handled, err := r.checkApprovalTimeout(ctx, taskWith(map[string]string{"timeout": "1m"}, nil))
		assert.NoError(t, err)
		assert.False(t, handled)
	})

	t.Run("not yet expired", func(t *testing.T) {
		handled, err := r.checkApprovalTimeout(ctx, taskWith(map[string]string{"timeout": "1m"}, &future))
		assert.NoError(t, err)
		assert.False(t, handled)
	})

	t.Run("expired with proceed policy completes", func(t *testing.T) {
		task := taskWith(map[string]string{"timeout": "1m", "onTimeout": "proceed"}, &past)
		handled, err := r.checkApprovalTimeout(ctx, task)
		assert.NoError(t, err)
		assert.True(t, handled)
		assert.Equal(t, arka2a.PhaseCompleted, task.Status.Phase)
		assert.NotNil(t, task.Status.CompletionTime)
	})

	t.Run("expired with reject policy fails", func(t *testing.T) {
		task := taskWith(map[string]string{"timeout": "1m", "onTimeout": "reject"}, &past)
		handled, err := r.checkApprovalTimeout(ctx, task)
		assert.NoError(t, err)
		assert.True(t, handled)
		assert.Equal(t, arka2a.PhaseFailed, task.Status.Phase)
		assert.Contains(t, task.Status.Error, "Approval timeout exceeded")
	})

	t.Run("expired with empty policy defaults to reject", func(t *testing.T) {
		task := taskWith(map[string]string{"timeout": "1m"}, &past)
		handled, err := r.checkApprovalTimeout(ctx, task)
		assert.NoError(t, err)
		assert.True(t, handled)
		assert.Equal(t, arka2a.PhaseFailed, task.Status.Phase)
	})

	t.Run("expired with invalid policy returns error", func(t *testing.T) {
		task := taskWith(map[string]string{"timeout": "1m", "onTimeout": "bogus"}, &past)
		handled, err := r.checkApprovalTimeout(ctx, task)
		assert.Error(t, err)
		assert.False(t, handled)
	})
}

func TestProcessApprovalDecision(t *testing.T) {
	r := &A2ATaskReconciler{}
	ctx := context.Background()

	taskWith := func(input string) *arkv1alpha1.A2ATask {
		return &arkv1alpha1.A2ATask{
			Spec:   arkv1alpha1.A2ATaskSpec{TaskID: "t", Input: input},
			Status: arkv1alpha1.A2ATaskStatus{Phase: arka2a.PhaseInputRequired},
		}
	}

	t.Run("invalid json marks failed and handled", func(t *testing.T) {
		task := taskWith("{not json")
		assert.True(t, r.processApprovalDecision(ctx, task))
		assert.Equal(t, arka2a.PhaseFailed, task.Status.Phase)
		assert.Contains(t, task.Status.Error, "Invalid approval decision")
	})

	t.Run("empty decision is not handled", func(t *testing.T) {
		task := taskWith(`{"decision":""}`)
		assert.False(t, r.processApprovalDecision(ctx, task))
		assert.Equal(t, arka2a.PhaseInputRequired, task.Status.Phase)
	})

	t.Run("approved marks completed", func(t *testing.T) {
		task := taskWith(`{"decision":"approved"}`)
		assert.True(t, r.processApprovalDecision(ctx, task))
		assert.Equal(t, arka2a.PhaseCompleted, task.Status.Phase)
	})

	t.Run("rejected marks failed", func(t *testing.T) {
		task := taskWith(`{"decision":"rejected"}`)
		assert.True(t, r.processApprovalDecision(ctx, task))
		assert.Equal(t, arka2a.PhaseFailed, task.Status.Phase)
		assert.Equal(t, "Tool execution rejected by user", task.Status.Error)
	})

	t.Run("unknown decision marks failed and handled", func(t *testing.T) {
		task := taskWith(`{"decision":"maybe"}`)
		assert.True(t, r.processApprovalDecision(ctx, task))
		assert.Equal(t, arka2a.PhaseFailed, task.Status.Phase)
		assert.Contains(t, task.Status.Error, "Invalid decision value")
	})
}

func TestPollIntervalOrDefault(t *testing.T) {
	t.Run("returns spec interval when set", func(t *testing.T) {
		task := &arkv1alpha1.A2ATask{
			Spec: arkv1alpha1.A2ATaskSpec{PollInterval: &metav1.Duration{Duration: 7 * time.Second}},
		}
		assert.Equal(t, 7*time.Second, pollIntervalOrDefault(task))
	})

	t.Run("returns default when unset", func(t *testing.T) {
		assert.Equal(t, defaultPollInterval, pollIntervalOrDefault(&arkv1alpha1.A2ATask{}))
	})
}

func TestGetFailureCount(t *testing.T) {
	r := &A2ATaskReconciler{}
	ctx := context.Background()

	t.Run("nil annotations returns zero", func(t *testing.T) {
		assert.Equal(t, 0, r.getFailureCount(ctx, &arkv1alpha1.A2ATask{}))
	})

	t.Run("valid annotation returns count", func(t *testing.T) {
		task := &arkv1alpha1.A2ATask{ObjectMeta: metav1.ObjectMeta{Annotations: map[string]string{pollFailureCountAnnotation: "3"}}}
		assert.Equal(t, 3, r.getFailureCount(ctx, task))
	})

	t.Run("invalid annotation resets to zero", func(t *testing.T) {
		task := &arkv1alpha1.A2ATask{ObjectMeta: metav1.ObjectMeta{Annotations: map[string]string{pollFailureCountAnnotation: "abc"}}}
		assert.Equal(t, 0, r.getFailureCount(ctx, task))
	})
}
