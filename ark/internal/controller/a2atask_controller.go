/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
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

const (
	pollFailureCountAnnotation = "ark.mckinsey.com/poll-failure-count"
	defaultPollInterval        = 5 * time.Second
	defaultTaskTimeout         = 12 * time.Hour
	defaultTaskTTL             = 720 * time.Hour
	maxPollBackoff             = 5 * time.Minute
	rateLimitBackoffFloor      = 30 * time.Second
	maxBackoffExponent         = 16
)

type A2ATaskReconciler struct {
	client.Client
	Scheme   *runtime.Scheme
	Eventing eventing.Provider
}

// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=a2atasks,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=a2atasks/finalizers,verbs=update
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=a2atasks/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=queries,verbs=get;list
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=agents,verbs=get;list

//nolint:gocognit // TODO: Refactor to reduce cognitive complexity
func (r *A2ATaskReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	var a2aTask arkv1alpha1.A2ATask
	if err := r.Get(ctx, req.NamespacedName, &a2aTask); err != nil {
		log.Error(err, "unable to fetch A2ATask")
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}

	if done, err := r.reconcileTTL(ctx, &a2aTask); done || err != nil {
		return ctrl.Result{}, err
	}

	if a2aTask.Status.Phase == "" {
		a2aTask.Status.Phase = arka2a.PhasePending
	}

	if len(a2aTask.Status.Conditions) == 0 {
		r.setConditionCompleted(&a2aTask, metav1.ConditionFalse, "TaskNotStarted", "Task has not been started yet")
		return ctrl.Result{}, r.Status().Update(ctx, &a2aTask)
	}

	if arka2a.IsTerminalPhase(a2aTask.Status.Phase) {
		return ctrl.Result{}, nil
	}

	//nolint:nestif // TODO: Refactor to reduce nesting complexity
	if a2aTask.Status.Phase == arka2a.PhaseInputRequired {
		if timedOut, err := r.checkApprovalTimeout(ctx, &a2aTask); err != nil {
			log.Error(err, "failed to check approval timeout")
		} else if timedOut {
			if err := r.Status().Update(ctx, &a2aTask); err != nil {
				log.Error(err, "unable to update A2ATask status after timeout")
				return ctrl.Result{}, err
			}
			return ctrl.Result{}, nil
		}

		if a2aTask.Spec.A2AServerRef == nil && a2aTask.Spec.Input != "" {
			if handled := r.processApprovalDecision(ctx, &a2aTask); handled {
				if err := r.Status().Update(ctx, &a2aTask); err != nil {
					log.Error(err, "unable to update A2ATask status after approval decision")
					return ctrl.Result{}, err
				}
				return ctrl.Result{}, nil
			}
		}
	}

	if done, err := r.reconcileTimeout(ctx, &a2aTask); done || err != nil {
		return ctrl.Result{}, err
	}

	return r.pollTaskStatus(ctx, &a2aTask)
}

func (r *A2ATaskReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&arkv1alpha1.A2ATask{}).
		Complete(r)
}

// reconcileTTL deletes the task once it has outlived its TTL. Returns true when handled.
func (r *A2ATaskReconciler) reconcileTTL(ctx context.Context, a2aTask *arkv1alpha1.A2ATask) (bool, error) {
	ttl := defaultTaskTTL
	if a2aTask.Spec.TTL != nil {
		ttl = a2aTask.Spec.TTL.Duration
	}
	if time.Now().Before(a2aTask.CreationTimestamp.Add(ttl)) {
		return false, nil
	}
	logf.FromContext(ctx).Info("deleting A2ATask after TTL expiry", "ttl", ttl)
	if err := r.Delete(ctx, a2aTask); err != nil {
		return false, err
	}
	return true, nil
}

// reconcileTimeout marks the task failed once it has exceeded its timeout. Returns true when handled.
// Skipped for HITL approval tasks: there's no remote A2A server to poll, so the spec.timeout
// is not meaningful for them. checkApprovalTimeout handles their expiry instead.
func (r *A2ATaskReconciler) reconcileTimeout(ctx context.Context, a2aTask *arkv1alpha1.A2ATask) (bool, error) {
	if a2aTask.Spec.A2AServerRef == nil {
		return false, nil
	}
	timeout := defaultTaskTimeout
	if a2aTask.Spec.Timeout != nil {
		timeout = a2aTask.Spec.Timeout.Duration
	}
	if time.Now().Before(a2aTask.CreationTimestamp.Add(timeout)) {
		return false, nil
	}
	logf.FromContext(ctx).Info("A2ATask exceeded timeout, marking as failed", "timeout", timeout)
	a2aTask.Status.Phase = arka2a.PhaseFailed
	a2aTask.Status.Error = fmt.Sprintf("Task polling timeout after %v", timeout)
	r.setConditionCompleted(a2aTask, metav1.ConditionTrue, "TaskTimeout", fmt.Sprintf("Task did not reach terminal state within %v", timeout))
	now := metav1.NewTime(time.Now())
	a2aTask.Status.CompletionTime = &now
	if err := r.Status().Update(ctx, a2aTask); err != nil {
		return false, err
	}
	return true, nil
}

// pollTaskStatus fetches the task status from the A2A server, applying backoff on failure.
func (r *A2ATaskReconciler) pollTaskStatus(ctx context.Context, a2aTask *arkv1alpha1.A2ATask) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	failureCount := r.getFailureCount(ctx, a2aTask)
	before := snapshotA2ATaskStatus(&a2aTask.Status)

	if err := r.fetchA2ATaskStatus(ctx, a2aTask); err != nil {
		return r.handlePollFailure(ctx, a2aTask, err, failureCount)
	}

	if failureCount > 0 {
		log.Info("poll succeeded, resetting failure count", "previousFailures", failureCount)
		r.recordFailure(a2aTask, 0)
		if err := r.Update(ctx, a2aTask); err != nil {
			log.Error(err, "unable to reset A2ATask failure count")
		}
	}

	if snapshotA2ATaskStatus(&a2aTask.Status) != before {
		if err := r.Status().Update(ctx, a2aTask); err != nil {
			log.Error(err, "unable to update A2ATask status")
			return ctrl.Result{}, err
		}
	}

	if !arka2a.IsTerminalPhase(a2aTask.Status.Phase) {
		return ctrl.Result{RequeueAfter: pollIntervalOrDefault(a2aTask)}, nil
	}
	return ctrl.Result{}, nil
}

// handlePollFailure records the failure and requeues with backoff (longer for rate-limit responses).
func (r *A2ATaskReconciler) handlePollFailure(ctx context.Context, a2aTask *arkv1alpha1.A2ATask, pollErr error, failureCount int) (ctrl.Result, error) {
	log := logf.FromContext(ctx)
	failureCount++
	rateLimited := isRateLimited(pollErr)

	log.Error(pollErr, "failed to fetch A2A task status", "taskId", a2aTask.Spec.TaskID, "failureCount", failureCount, "rateLimited", rateLimited)
	r.Eventing.A2aRecorder().TaskPollingFailed(ctx, a2aTask, fmt.Sprintf("Failed to fetch task status: %v", pollErr))

	r.recordFailure(a2aTask, failureCount)
	if err := r.Update(ctx, a2aTask); err != nil {
		log.Error(err, "unable to update A2ATask failure count")
	}

	backoff := computePollBackoff(failureCount, pollIntervalOrDefault(a2aTask), rateLimited)
	log.Info("applying backoff after poll failure", "failureCount", failureCount, "requeueAfter", backoff, "rateLimited", rateLimited)
	return ctrl.Result{RequeueAfter: backoff}, nil
}

// fetchA2ATaskStatus queries the A2A server for the current task status and updates the A2ATask
func (r *A2ATaskReconciler) fetchA2ATaskStatus(ctx context.Context, a2aTask *arkv1alpha1.A2ATask) error {
	a2aClient, err := r.createA2AClient(ctx, a2aTask)
	if err != nil {
		return err
	}

	// For approval tasks without A2AServer (a2aClient is nil), skip remote polling
	if a2aClient == nil {
		return nil
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
	// For approval tasks without an A2AServer, there's no remote server to poll
	if a2aTask.Spec.A2AServerRef == nil {
		return nil, nil
	}

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

// checkApprovalTimeout checks if an approval request has timed out and applies the onTimeout policy.
// Returns true if timeout was handled, false otherwise.
func (r *A2ATaskReconciler) checkApprovalTimeout(ctx context.Context, a2aTask *arkv1alpha1.A2ATask) (bool, error) {
	log := logf.FromContext(ctx)

	if a2aTask.Status.ProtocolMetadata == nil {
		return false, nil
	}

	timeoutStr, hasTimeout := a2aTask.Status.ProtocolMetadata["timeout"]
	onTimeout := a2aTask.Status.ProtocolMetadata["onTimeout"]

	if !hasTimeout || timeoutStr == "" {
		return false, nil
	}

	timeoutDuration, err := time.ParseDuration(timeoutStr)
	if err != nil {
		log.Error(err, "failed to parse approval timeout", "timeout", timeoutStr)
		return false, fmt.Errorf("invalid timeout format: %w", err)
	}

	if a2aTask.Status.StartTime == nil {
		return false, nil
	}

	expiryTime := a2aTask.Status.StartTime.Add(timeoutDuration)
	if time.Now().Before(expiryTime) {
		return false, nil
	}

	log.Info("Approval timeout exceeded, applying onTimeout policy",
		"taskId", a2aTask.Spec.TaskID,
		"onTimeout", onTimeout,
		"timeout", timeoutDuration)

	switch onTimeout {
	case "proceed":
		log.Info("Approval timeout expired, proceeding per onTimeout policy", "taskId", a2aTask.Spec.TaskID)
		a2aTask.Status.Phase = arka2a.PhaseCompleted
		completionTime := metav1.Now()
		a2aTask.Status.CompletionTime = &completionTime
		r.setConditionCompleted(a2aTask, metav1.ConditionTrue, arka2a.ConditionReasonApprovalTimeoutProceeded,
			"Approval timeout exceeded, proceeding per onTimeout policy")

	case "reject", "":
		log.Info("Approval timeout expired, rejecting per onTimeout policy", "taskId", a2aTask.Spec.TaskID)
		a2aTask.Status.Phase = arka2a.PhaseFailed
		a2aTask.Status.Error = fmt.Sprintf("Approval timeout exceeded after %s", timeoutDuration)
		completionTime := metav1.Now()
		a2aTask.Status.CompletionTime = &completionTime
		r.setConditionCompleted(a2aTask, metav1.ConditionTrue, arka2a.ConditionReasonApprovalTimeoutRejected,
			"Approval timeout exceeded, rejecting per onTimeout policy")

	default:
		return false, fmt.Errorf("invalid onTimeout value: %s", onTimeout)
	}

	return true, nil
}

// processApprovalDecision processes the approval decision from spec.Input for HITL tasks.
// Returns true if decision was processed (or if bad input was handled as terminal failure), false otherwise.
func (r *A2ATaskReconciler) processApprovalDecision(ctx context.Context, a2aTask *arkv1alpha1.A2ATask) bool {
	log := logf.FromContext(ctx)

	var decision struct {
		Decision string `json:"decision"`
	}

	if err := json.Unmarshal([]byte(a2aTask.Spec.Input), &decision); err != nil {
		log.Error(err, "failed to parse approval decision", "input", a2aTask.Spec.Input)
		completionTime := metav1.Now()
		a2aTask.Status.CompletionTime = &completionTime
		a2aTask.Status.Phase = arka2a.PhaseFailed
		a2aTask.Status.Error = fmt.Sprintf("Invalid approval decision format: %v", err)
		r.setConditionCompleted(a2aTask, metav1.ConditionFalse, "InvalidApprovalDecision",
			fmt.Sprintf("Failed to parse approval decision: %v", err))
		return true
	}

	if decision.Decision == "" {
		return false
	}

	log.Info("Processing approval decision",
		"taskId", a2aTask.Spec.TaskID,
		"decision", decision.Decision)

	completionTime := metav1.Now()
	a2aTask.Status.CompletionTime = &completionTime

	switch decision.Decision {
	case "approved":
		log.Info("Approval granted, marking task as completed", "taskId", a2aTask.Spec.TaskID)
		a2aTask.Status.Phase = arka2a.PhaseCompleted
		r.setConditionCompleted(a2aTask, metav1.ConditionTrue, arka2a.ConditionReasonApprovalGranted,
			"User approved the tool calls")

	case "rejected":
		log.Info("Approval rejected, marking task as failed", "taskId", a2aTask.Spec.TaskID)
		a2aTask.Status.Phase = arka2a.PhaseFailed
		a2aTask.Status.Error = "Tool execution rejected by user"
		r.setConditionCompleted(a2aTask, metav1.ConditionTrue, arka2a.ConditionReasonApprovalRejected,
			"Tool execution rejected by user")

	default:
		log.Error(fmt.Errorf("invalid decision value: %s", decision.Decision), "unknown approval decision")
		a2aTask.Status.Phase = arka2a.PhaseFailed
		a2aTask.Status.Error = fmt.Sprintf("Invalid decision value: %s", decision.Decision)
		r.setConditionCompleted(a2aTask, metav1.ConditionFalse, "InvalidApprovalDecision",
			fmt.Sprintf("Unknown decision value: %s", decision.Decision))
		return true
	}

	return true
}

func (r *A2ATaskReconciler) getFailureCount(ctx context.Context, a2aTask *arkv1alpha1.A2ATask) int {
	count, err := parseFailureCount(a2aTask.Annotations)
	if err != nil {
		logf.FromContext(ctx).Error(err, "invalid poll-failure-count annotation, resetting to 0", "value", a2aTask.Annotations[pollFailureCountAnnotation])
		return 0
	}
	return count
}

func (r *A2ATaskReconciler) recordFailure(a2aTask *arkv1alpha1.A2ATask, count int) {
	if a2aTask.Annotations == nil {
		a2aTask.Annotations = make(map[string]string)
	}
	a2aTask.Annotations[pollFailureCountAnnotation] = strconv.Itoa(count)
}

func pollIntervalOrDefault(a2aTask *arkv1alpha1.A2ATask) time.Duration {
	if a2aTask.Spec.PollInterval != nil {
		return a2aTask.Spec.PollInterval.Duration
	}
	return defaultPollInterval
}

// parseFailureCount reads the persisted failure count, surfacing a parse error rather than silently resetting.
func parseFailureCount(annotations map[string]string) (int, error) {
	if annotations == nil {
		return 0, nil
	}
	value, ok := annotations[pollFailureCountAnnotation]
	if !ok {
		return 0, nil
	}
	return strconv.Atoi(value)
}

// isRateLimited reports whether the poll error is a backend throttle/quota response.
// The trpc-a2a-go client surfaces only the status code as a string and discards the
// Retry-After header, so detection is by status code and the backoff floor stands in
// for a server-provided retry delay.
func isRateLimited(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	for _, code := range []string{"http status 429", "http status 402", "http status 503"} {
		if strings.Contains(msg, code) {
			return true
		}
	}
	return false
}

// computePollBackoff returns the requeue delay for a given consecutive failure count.
// It grows exponentially from base, is capped at maxPollBackoff, and uses a higher
// floor for rate-limited responses. The exponent is bounded to avoid shift overflow.
func computePollBackoff(failureCount int, base time.Duration, rateLimited bool) time.Duration {
	if base <= 0 {
		base = defaultPollInterval
	}
	exponent := failureCount
	if exponent < 0 {
		exponent = 0
	}
	if exponent > maxBackoffExponent {
		exponent = maxBackoffExponent
	}
	backoff := base * time.Duration(int64(1)<<uint(exponent))
	if backoff <= 0 || backoff > maxPollBackoff {
		backoff = maxPollBackoff
	}
	if rateLimited && backoff < rateLimitBackoffFloor {
		backoff = rateLimitBackoffFloor
	}
	return backoff
}

type a2aTaskStatusSnapshot struct {
	phase         string
	protocolState string
	errMsg        string
	artifactsLen  int
	historyLen    int
}

func snapshotA2ATaskStatus(status *arkv1alpha1.A2ATaskStatus) a2aTaskStatusSnapshot {
	return a2aTaskStatusSnapshot{
		phase:         status.Phase,
		protocolState: status.ProtocolState,
		errMsg:        status.Error,
		artifactsLen:  len(status.Artifacts),
		historyLen:    len(status.History),
	}
}
