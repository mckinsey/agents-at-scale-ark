/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"fmt"
	"time"

	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	a2aclient "trpc.group/trpc-go/trpc-a2a-go/client"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
	"mckinsey.com/ark/internal/eventing"
)

type A2ATaskReconciler struct {
	client.Client
	Scheme   *runtime.Scheme
	Eventing eventing.Provider
}

// pollFailureTracker tracks consecutive failures for exponential backoff
type pollFailureTracker struct {
	consecutiveFailures int
	lastFailureTime     time.Time
}

// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=a2atasks,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=a2atasks/finalizers,verbs=update
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=a2atasks/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=queries,verbs=get;list
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=agents,verbs=get;list

func (r *A2ATaskReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	var a2aTask arkv1alpha1.A2ATask
	if err := r.Get(ctx, req.NamespacedName, &a2aTask); err != nil {
		log.Error(err, "unable to fetch A2ATask")
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}

	// TTL cleanup: delete task if it has exceeded its time-to-live since creation
	ttl := a2aTask.Spec.TTL
	if ttl == nil {
		// Default TTL to 720h (30 days) to prevent orphaned tasks
		defaultTTL := metav1.Duration{Duration: 720 * time.Hour}
		ttl = &defaultTTL
	}
	expiry := a2aTask.CreationTimestamp.Add(ttl.Duration)
	if time.Now().After(expiry) {
		log.Info("deleting A2ATask after TTL expiry", "ttl", ttl.Duration, "expiry", expiry)
		if err := r.Delete(ctx, &a2aTask); err != nil {
			log.Error(err, "unable to delete A2ATask after TTL expiry")
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	// Initialize phase if not set
	if a2aTask.Status.Phase == "" {
		a2aTask.Status.Phase = arka2a.PhasePending
	}

	// Initialize Completed condition if not set
	if len(a2aTask.Status.Conditions) == 0 {
		r.setConditionCompleted(&a2aTask, metav1.ConditionFalse, "TaskNotStarted", "Task has not been started yet")
		return ctrl.Result{}, r.Status().Update(ctx, &a2aTask)
	}

	// Handle terminal states
	if arka2a.IsTerminalPhase(a2aTask.Status.Phase) {
		return ctrl.Result{}, nil
	}

	// Check timeout: fail task if it has exceeded the timeout since creation
	timeout := a2aTask.Spec.Timeout
	if timeout == nil {
		// Default timeout to 12h
		defaultTimeout := metav1.Duration{Duration: 12 * time.Hour}
		timeout = &defaultTimeout
	}
	deadline := a2aTask.CreationTimestamp.Add(timeout.Duration)
	if time.Now().After(deadline) {
		log.Info("A2ATask exceeded timeout, marking as failed", "timeout", timeout.Duration, "deadline", deadline)
		a2aTask.Status.Phase = arka2a.PhaseFailed
		a2aTask.Status.Error = fmt.Sprintf("Task polling timeout after %v", timeout.Duration)
		r.setConditionCompleted(&a2aTask, metav1.ConditionTrue, "TaskTimeout", fmt.Sprintf("Task did not reach terminal state within %v", timeout.Duration))
		now := metav1.NewTime(time.Now())
		a2aTask.Status.CompletionTime = &now
		if err := r.Status().Update(ctx, &a2aTask); err != nil {
			log.Error(err, "unable to update A2ATask status after timeout")
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	// Capture old status for comparison
	oldPhase := a2aTask.Status.Phase
	oldProtocolState := a2aTask.Status.ProtocolState
	oldArtifactsLen := len(a2aTask.Status.Artifacts)
	oldHistoryLen := len(a2aTask.Status.History)

	// Track poll failures for exponential backoff
	failureCount := r.getFailureCount(&a2aTask)

	// Fetch task status from A2A server for all non-terminal tasks
	if err := r.fetchA2ATaskStatus(ctx, &a2aTask); err != nil {
		log.Error(err, "failed to fetch A2A task status", "taskId", a2aTask.Spec.TaskID, "failureCount", failureCount+1)
		r.Eventing.A2aRecorder().TaskPollingFailed(ctx, &a2aTask, fmt.Sprintf("Failed to fetch task status: %v", err))

		// Increment failure count
		failureCount++
		r.recordFailure(&a2aTask, failureCount)

		// Persist the failure count annotation
		if err := r.Update(ctx, &a2aTask); err != nil {
			log.Error(err, "unable to update A2ATask annotations for failure tracking")
		}

		// Calculate exponential backoff (5s * 2^failures, capped at 5 minutes)
		basePollInterval := time.Second * 5
		if a2aTask.Spec.PollInterval != nil {
			basePollInterval = a2aTask.Spec.PollInterval.Duration
		}
		backoffMultiplier := 1 << failureCount // 2^failures
		if backoffMultiplier > 60 {            // cap at 60x base interval
			backoffMultiplier = 60
		}
		requeueAfter := basePollInterval * time.Duration(backoffMultiplier)
		if requeueAfter > 5*time.Minute {
			requeueAfter = 5 * time.Minute
		}

		log.Info("applying exponential backoff after poll failure", "failureCount", failureCount, "requeueAfter", requeueAfter)
		return ctrl.Result{RequeueAfter: requeueAfter}, nil
	}

	// Reset failure count on success
	if failureCount > 0 {
		log.Info("poll succeeded, resetting failure count", "previousFailures", failureCount)
		r.recordFailure(&a2aTask, 0)
		// Persist the reset
		if err := r.Update(ctx, &a2aTask); err != nil {
			log.Error(err, "unable to update A2ATask annotations after resetting failure count")
		}
	}

	// Only update status if it actually changed
	statusChanged := oldPhase != a2aTask.Status.Phase ||
		oldProtocolState != a2aTask.Status.ProtocolState ||
		oldArtifactsLen != len(a2aTask.Status.Artifacts) ||
		oldHistoryLen != len(a2aTask.Status.History)

	if statusChanged {
		if err := r.Status().Update(ctx, &a2aTask); err != nil {
			log.Error(err, "unable to update A2ATask status")
			return ctrl.Result{}, err
		}
	}

	// Requeue for non-terminal tasks using the configured poll interval
	if !arka2a.IsTerminalPhase(a2aTask.Status.Phase) {
		pollInterval := time.Second * 5 // default fallback
		if a2aTask.Spec.PollInterval != nil {
			pollInterval = a2aTask.Spec.PollInterval.Duration
		}
		return ctrl.Result{RequeueAfter: pollInterval}, nil
	}

	return ctrl.Result{}, nil
}

func (r *A2ATaskReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&arkv1alpha1.A2ATask{}).
		Complete(r)
}

// fetchA2ATaskStatus queries the A2A server for the current task status and updates the A2ATask
func (r *A2ATaskReconciler) fetchA2ATaskStatus(ctx context.Context, a2aTask *arkv1alpha1.A2ATask) error {
	a2aClient, err := r.createA2AClient(ctx, a2aTask)
	if err != nil {
		return err
	}

	task, err := r.queryTaskStatus(ctx, a2aClient, a2aTask.Spec.TaskID)
	if err != nil {
		return err
	}

	oldPhase := a2aTask.Status.Phase
	arka2a.UpdateA2ATaskStatus(&a2aTask.Status, task)
	r.updateConditionsAndEvents(a2aTask, oldPhase)
	return nil
}

// createA2AClient creates an A2A client for the task
func (r *A2ATaskReconciler) createA2AClient(ctx context.Context, a2aTask *arkv1alpha1.A2ATask) (*a2aclient.A2AClient, error) {
	serverNamespace := a2aTask.Spec.A2AServerRef.Namespace
	if serverNamespace == "" {
		serverNamespace = a2aTask.Namespace
	}

	var a2aServer arkv1prealpha1.A2AServer
	serverKey := client.ObjectKey{Name: a2aTask.Spec.A2AServerRef.Name, Namespace: serverNamespace}
	if err := r.Get(ctx, serverKey, &a2aServer); err != nil {
		return nil, fmt.Errorf("unable to get A2AServer %v: %w", serverKey, err)
	}

	a2aServerAddress := a2aServer.Status.LastResolvedAddress
	if a2aServerAddress == "" {
		return nil, fmt.Errorf("A2AServer %v has no resolved address", serverKey)
	}

	agentName := a2aTask.Spec.AgentRef.Name

	return arka2a.CreateA2AClient(ctx, r.Client, a2aServerAddress, a2aServer.Spec.Headers, serverNamespace, agentName, r.Eventing.A2aRecorder())
}

// queryTaskStatus queries the A2A server for task status
func (r *A2ATaskReconciler) queryTaskStatus(ctx context.Context, a2aClient *a2aclient.A2AClient, taskID string) (*protocol.Task, error) {
	historyLength := 100
	params := protocol.TaskQueryParams{
		ID:            taskID,
		HistoryLength: &historyLength,
	}
	task, err := a2aClient.GetTasks(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("failed to get task status from A2A server: %w", err)
	}
	return task, nil
}

func (r *A2ATaskReconciler) updateConditionsAndEvents(a2aTask *arkv1alpha1.A2ATask, oldPhase string) {
	newPhase := a2aTask.Status.Phase
	if newPhase == oldPhase {
		return
	}

	// Update Completed condition based on phase
	switch newPhase {
	case arka2a.PhasePending, arka2a.PhaseAssigned:
		r.setConditionCompleted(a2aTask, metav1.ConditionFalse, "TaskPending", "Task is pending execution")
	case arka2a.PhaseRunning:
		r.setConditionCompleted(a2aTask, metav1.ConditionFalse, "TaskRunning", "Task is running")
	case arka2a.PhaseCompleted:
		r.setConditionCompleted(a2aTask, metav1.ConditionTrue, "TaskSucceeded", "Task completed successfully")
	case arka2a.PhaseFailed:
		r.setConditionCompleted(a2aTask, metav1.ConditionTrue, "TaskFailed", "Task failed")
	case arka2a.PhaseCancelled:
		r.setConditionCompleted(a2aTask, metav1.ConditionTrue, "TaskCancelled", "Task was cancelled")
	}
}

// setConditionCompleted sets the Completed condition on the A2ATask
func (r *A2ATaskReconciler) setConditionCompleted(a2aTask *arkv1alpha1.A2ATask, status metav1.ConditionStatus, reason, message string) {
	meta.SetStatusCondition(&a2aTask.Status.Conditions, metav1.Condition{
		Type:               string(arkv1alpha1.A2ATaskCompleted),
		Status:             status,
		Reason:             reason,
		Message:            message,
		ObservedGeneration: a2aTask.Generation,
	})
}

// getFailureCount retrieves the failure count from the task's annotations
func (r *A2ATaskReconciler) getFailureCount(a2aTask *arkv1alpha1.A2ATask) int {
	if a2aTask.Annotations == nil {
		return 0
	}
	countStr, ok := a2aTask.Annotations["ark.mckinsey.com/poll-failure-count"]
	if !ok {
		return 0
	}
	count := 0
	fmt.Sscanf(countStr, "%d", &count)
	return count
}

// recordFailure stores the failure count in the task's annotations
func (r *A2ATaskReconciler) recordFailure(a2aTask *arkv1alpha1.A2ATask, count int) {
	if a2aTask.Annotations == nil {
		a2aTask.Annotations = make(map[string]string)
	}
	a2aTask.Annotations["ark.mckinsey.com/poll-failure-count"] = fmt.Sprintf("%d", count)
}
