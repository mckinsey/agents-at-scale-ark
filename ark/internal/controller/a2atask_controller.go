/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"encoding/json"
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

	// TTL cleanup: delete task if it has exceeded its time-to-live since creation
	if a2aTask.Spec.TTL != nil {
		expiry := a2aTask.CreationTimestamp.Add(a2aTask.Spec.TTL.Duration)
		if time.Now().After(expiry) {
			if err := r.Delete(ctx, &a2aTask); err != nil {
				log.Error(err, "unable to delete A2ATask after TTL expiry")
				return ctrl.Result{}, err
			}
			return ctrl.Result{}, nil
		}
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

	// Check for approval timeout if task is in input-required phase
	//nolint:nestif // TODO: Refactor to reduce nesting complexity
	if a2aTask.Status.Phase == arka2a.PhaseInputRequired {
		if timedOut, err := r.checkApprovalTimeout(ctx, &a2aTask); err != nil {
			log.Error(err, "failed to check approval timeout")
		} else if timedOut {
			// Timeout was handled, update status and return
			if err := r.Status().Update(ctx, &a2aTask); err != nil {
				log.Error(err, "unable to update A2ATask status after timeout")
				return ctrl.Result{}, err
			}
			return ctrl.Result{}, nil
		}

		// For HITL approval tasks (no A2AServerRef), check if approval decision is in spec.Input
		if a2aTask.Spec.A2AServerRef == nil && a2aTask.Spec.Input != "" {
			if handled := r.processApprovalDecision(ctx, &a2aTask); handled {
				// Decision was processed (or invalid input was handled as terminal failure), update status and return
				if err := r.Status().Update(ctx, &a2aTask); err != nil {
					log.Error(err, "unable to update A2ATask status after approval decision")
					return ctrl.Result{}, err
				}
				return ctrl.Result{}, nil
			}
		}
	}

	// Fetch task status from A2A server for all non-terminal tasks
	if err := r.fetchA2ATaskStatus(ctx, &a2aTask); err != nil {
		log.Error(err, "failed to fetch A2A task status", "taskId", a2aTask.Spec.TaskID)
		r.Eventing.A2aRecorder().TaskPollingFailed(ctx, &a2aTask, fmt.Sprintf("Failed to fetch task status: %v", err))

		// Continue with requeue even on error to retry polling
	}

	// Update status
	if err := r.Status().Update(ctx, &a2aTask); err != nil {
		log.Error(err, "unable to update A2ATask status")
		return ctrl.Result{}, err
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

// checkApprovalTimeout checks if an approval request has timed out and applies the onTimeout policy.
// Returns true if timeout was handled, false otherwise.
func (r *A2ATaskReconciler) checkApprovalTimeout(ctx context.Context, a2aTask *arkv1alpha1.A2ATask) (bool, error) {
	log := logf.FromContext(ctx)

	// Check if there's approval metadata
	if a2aTask.Status.ProtocolMetadata == nil {
		return false, nil
	}

	timeoutStr, hasTimeout := a2aTask.Status.ProtocolMetadata["timeout"]
	onTimeout := a2aTask.Status.ProtocolMetadata["onTimeout"]

	if !hasTimeout || timeoutStr == "" {
		return false, nil
	}

	// Parse timeout duration
	timeoutDuration, err := time.ParseDuration(timeoutStr)
	if err != nil {
		log.Error(err, "failed to parse approval timeout", "timeout", timeoutStr)
		return false, fmt.Errorf("invalid timeout format: %w", err)
	}

	// Check if task has started
	if a2aTask.Status.StartTime == nil {
		return false, nil
	}

	// Calculate expiry time
	expiryTime := a2aTask.Status.StartTime.Add(timeoutDuration)
	now := time.Now()

	// Check if timeout has been exceeded
	if now.Before(expiryTime) {
		return false, nil
	}

	// Timeout exceeded - apply onTimeout policy
	log.Info("Approval timeout exceeded, applying onTimeout policy",
		"taskId", a2aTask.Spec.TaskID,
		"onTimeout", onTimeout,
		"timeout", timeoutDuration)

	switch onTimeout {
	case "proceed":
		// Allow execution to proceed
		log.Info("Approval timeout expired, proceeding per onTimeout policy", "taskId", a2aTask.Spec.TaskID)
		a2aTask.Status.Phase = arka2a.PhaseCompleted
		completionTime := metav1.Now()
		a2aTask.Status.CompletionTime = &completionTime
		r.setConditionCompleted(a2aTask, metav1.ConditionTrue, arka2a.ConditionReasonApprovalTimeoutProceeded,
			"Approval timeout exceeded, proceeding per onTimeout policy")

	case "reject", "":
		// Reject execution (default behavior)
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

	// Parse the decision JSON from spec.Input
	var decision struct {
		Decision string `json:"decision"`
	}

	if err := json.Unmarshal([]byte(a2aTask.Spec.Input), &decision); err != nil {
		log.Error(err, "failed to parse approval decision", "input", a2aTask.Spec.Input)
		// Treat parse failure as terminal - don't retry indefinitely
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
		// Treat unknown decision as terminal - don't retry indefinitely
		log.Error(fmt.Errorf("invalid decision value: %s", decision.Decision), "unknown approval decision")
		a2aTask.Status.Phase = arka2a.PhaseFailed
		a2aTask.Status.Error = fmt.Sprintf("Invalid decision value: %s", decision.Decision)
		r.setConditionCompleted(a2aTask, metav1.ConditionFalse, "InvalidApprovalDecision",
			fmt.Sprintf("Unknown decision value: %s", decision.Decision))
		return true
	}

	return true
}
