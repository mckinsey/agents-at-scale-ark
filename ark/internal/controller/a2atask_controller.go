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
	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/genai"
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
		a2aTask.Status.Phase = genai.PhasePending
	}

	// Initialize Completed condition if not set
	if len(a2aTask.Status.Conditions) == 0 {
		r.setConditionCompleted(&a2aTask, metav1.ConditionFalse, "TaskNotStarted", "Task has not been started yet")
		return ctrl.Result{}, r.Status().Update(ctx, &a2aTask)
	}

	// Handle terminal states
	if genai.IsTerminalPhase(a2aTask.Status.Phase) {
		return ctrl.Result{}, nil
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
	if !genai.IsTerminalPhase(a2aTask.Status.Phase) {
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
	genai.UpdateA2ATaskStatus(&a2aTask.Status, task)
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

	return genai.CreateA2AClient(ctx, r.Client, a2aServerAddress, a2aServer.Spec.Headers, serverNamespace, agentName, r.Eventing.A2aRecorder())
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
	case genai.PhasePending, genai.PhaseAssigned:
		r.setConditionCompleted(a2aTask, metav1.ConditionFalse, "TaskPending", "Task is pending execution")
	case genai.PhaseRunning:
		r.setConditionCompleted(a2aTask, metav1.ConditionFalse, "TaskRunning", "Task is running")
	case genai.PhaseCompleted:
		r.setConditionCompleted(a2aTask, metav1.ConditionTrue, "TaskSucceeded", "Task completed successfully")
	case genai.PhaseFailed:
		r.setConditionCompleted(a2aTask, metav1.ConditionTrue, "TaskFailed", "Task failed")
	case genai.PhaseCancelled:
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
