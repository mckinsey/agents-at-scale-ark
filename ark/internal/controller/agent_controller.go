/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"fmt"

	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/handler"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
	"mckinsey.com/ark/internal/eventing"
)

const (
	// Condition types
	AgentAvailable = "Available"
)

type AgentReconciler struct {
	client.Client
	Scheme   *runtime.Scheme
	Eventing eventing.Provider
}

// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=agents,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=agents/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=agents/finalizers,verbs=update
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=tools,verbs=get;list;watch
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=models,verbs=get;list;watch
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=a2aservers,verbs=get;list;watch
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=executionengines,verbs=get;list;watch

//nolint:dupl
func (r *AgentReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	// Fetch the Agent instance
	var agent arkv1alpha1.Agent
	if err := r.Get(ctx, req.NamespacedName, &agent); err != nil {
		if errors.IsNotFound(err) {
			log.Info("Agent resource not found. Ignoring since object must be deleted")
			return ctrl.Result{}, nil
		}
		log.Error(err, "Failed to get Agent")
		return ctrl.Result{}, err
	}

	// Initialize conditions if empty
	if len(agent.Status.Conditions) == 0 {
		r.setCondition(&agent, AgentAvailable, metav1.ConditionUnknown, "Initializing", "Agent availability is being determined")
		if err := r.updateStatus(ctx, &agent); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	// Check current condition
	currentCondition := meta.FindStatusCondition(agent.Status.Conditions, AgentAvailable)

	// Check all dependencies and determine new status
	available, reason, message := r.checkDependencies(ctx, &agent)

	// Determine new status
	var newStatus metav1.ConditionStatus
	if available {
		newStatus = metav1.ConditionTrue
	} else {
		newStatus = metav1.ConditionFalse
	}

	// Only update if status actually changed
	if currentCondition == nil || currentCondition.Status != newStatus || currentCondition.Reason != reason {
		log.Info("agent status changed", "agent", agent.Name, "available", newStatus, "reason", reason)
		r.setCondition(&agent, AgentAvailable, newStatus, reason, message)
		if !available {
			r.Eventing.AgentRecorder().DependencyUnavailable(ctx, &agent, message)
		}
		if err := r.updateStatus(ctx, &agent); err != nil {
			return ctrl.Result{}, err
		}
	}

	return ctrl.Result{}, nil
}

// checkDependencies validates all agent dependencies and returns availability status
func (r *AgentReconciler) checkDependencies(ctx context.Context, agent *arkv1alpha1.Agent) (available bool, reason, message string) {
	// Check A2AServer dependency (if agent is owned by an A2AServer)
	if ok, msg := r.checkA2AServerDependency(ctx, agent); !ok {
		return false, "A2AServerNotReady", msg
	}

	// Check the status of the agent's model. Some agents (such as A2A agents) have a 'nil' model, and their status is not associated with model availability.
	if agent.Spec.ModelRef != nil {
		if ok, msg := r.checkModelDependency(ctx, agent); !ok {
			return false, "ModelNotFound", msg
		}
	}

	// Check execution engine dependency
	if agent.Spec.ExecutionEngine != nil {
		if available, reason, msg := r.checkExecutionEngineDependency(ctx, agent); !available {
			return false, reason, msg
		}
	}

	// Check tool dependencies
	if ok, msg := r.checkToolDependencies(ctx, agent); !ok {
		return false, "ToolNotFound", msg
	}

	// All dependencies resolved
	return true, "Available", "All dependencies are available"
}

// checkModelDependency validates model dependency
func (r *AgentReconciler) checkModelDependency(ctx context.Context, agent *arkv1alpha1.Agent) (bool, string) {
	modelName := agent.Spec.ModelRef.Name
	modelNamespace := agent.Namespace

	if agent.Spec.ModelRef.Namespace != "" {
		modelNamespace = agent.Spec.ModelRef.Namespace
	}

	var model arkv1alpha1.Model
	modelKey := types.NamespacedName{Name: modelName, Namespace: modelNamespace}
	if err := r.Get(ctx, modelKey, &model); err != nil {
		if errors.IsNotFound(err) {
			msg := fmt.Sprintf("Model '%s' not found in namespace '%s'", modelName, modelNamespace)
			return false, msg
		}
		return false, fmt.Sprintf("Error checking model: %v", err)
	}

	// Check if model is available
	modelCondition := meta.FindStatusCondition(model.Status.Conditions, "ModelAvailable")
	if modelCondition == nil || modelCondition.Status != metav1.ConditionTrue {
		msg := fmt.Sprintf("Model '%s' is not available", modelName)
		return false, msg
	}

	return true, ""
}

// checkToolDependencies validates tool dependencies
func (r *AgentReconciler) checkToolDependencies(ctx context.Context, agent *arkv1alpha1.Agent) (bool, string) {
	for _, toolSpec := range agent.Spec.Tools {
		// Skip built-in tools - they don't reference Tool CRDs
		if toolSpec.Type == "built-in" || toolSpec.Name == "" {
			continue
		}

		toolName := toolSpec.GetToolCRDName()

		var tool arkv1alpha1.Tool
		toolKey := types.NamespacedName{Name: toolName, Namespace: agent.Namespace}
		if err := r.Get(ctx, toolKey, &tool); err != nil {
			if errors.IsNotFound(err) {
				msg := fmt.Sprintf("Tool '%s' not found in namespace '%s'", toolName, agent.Namespace)
				return false, msg
			}
			return false, fmt.Sprintf("Error checking tool: %v", err)
		}

		// Validate that the declared type matches the Tool CRD type (except for deprecated 'custom')
		if toolSpec.Type != "custom" && tool.Spec.Type != toolSpec.Type {
			msg := fmt.Sprintf("Tool '%s' has type '%s', but agent declares it as '%s'", toolName, tool.Spec.Type, toolSpec.Type)
			return false, msg
		}
	}

	return true, ""
}

// checkExecutionEngineDependency validates execution engine dependency
func (r *AgentReconciler) checkExecutionEngineDependency(ctx context.Context, agent *arkv1alpha1.Agent) (bool, string, string) {
	engineName := agent.Spec.ExecutionEngine.Name

	// The "a2a" engine is built into the controller, not a deployed
	// ExecutionEngine resource, so there is no CR to look up. Availability for
	// A2A agents is governed by the owning A2AServer (checkA2AServerDependency).
	if engineName == arka2a.ExecutionEngineA2A {
		return true, "", ""
	}

	engineNamespace := agent.Namespace

	if agent.Spec.ExecutionEngine.Namespace != "" {
		engineNamespace = agent.Spec.ExecutionEngine.Namespace
	}

	var engine arkv1prealpha1.ExecutionEngine
	engineKey := types.NamespacedName{Name: engineName, Namespace: engineNamespace}
	if err := r.Get(ctx, engineKey, &engine); err != nil {
		if errors.IsNotFound(err) {
			msg := fmt.Sprintf("ExecutionEngine '%s' not found in namespace '%s'", engineName, engineNamespace)
			return false, "ExecutionEngineNotFound", msg
		}
		return false, "ExecutionEngineNotFound", fmt.Sprintf("Error checking execution engine: %v", err)
	}

	if engine.Status.Phase != "ready" {
		msg := fmt.Sprintf("ExecutionEngine '%s' is not ready (phase: %s)", engineName, engine.Status.Phase)
		return false, "ExecutionEngineNotReady", msg
	}

	return true, "", ""
}

// checkA2AServerDependency validates A2AServer dependency for agents owned by A2AServers
func (r *AgentReconciler) checkA2AServerDependency(ctx context.Context, agent *arkv1alpha1.Agent) (bool, string) {
	// Check if agent has an A2AServer owner
	for _, ownerRef := range agent.GetOwnerReferences() {
		if ownerRef.Kind == "A2AServer" && ownerRef.APIVersion == "ark.mckinsey.com/v1prealpha1" {
			return r.validateA2AServerDependency(ctx, agent, ownerRef)
		}
	}

	// No A2AServer owner
	return true, ""
}

// validateA2AServerDependency checks if the A2AServer is ready
func (r *AgentReconciler) validateA2AServerDependency(ctx context.Context, agent *arkv1alpha1.Agent, ownerRef metav1.OwnerReference) (bool, string) {
	// Get the A2AServer
	var a2aServer arkv1prealpha1.A2AServer
	a2aServerKey := types.NamespacedName{Name: ownerRef.Name, Namespace: agent.Namespace}
	if err := r.Get(ctx, a2aServerKey, &a2aServer); err != nil {
		if errors.IsNotFound(err) {
			msg := fmt.Sprintf("A2AServer '%s' not found in namespace '%s'", ownerRef.Name, agent.Namespace)
			return false, msg
		}
		return false, fmt.Sprintf("Error checking A2AServer: %v", err)
	}

	// Check if A2AServer is Ready
	if !r.isA2AServerReady(&a2aServer) {
		msg := fmt.Sprintf("A2AServer '%s' is not ready", ownerRef.Name)
		return false, msg
	}

	return true, ""
}

// isA2AServerReady checks if an A2AServer has Ready condition true
func (r *AgentReconciler) isA2AServerReady(a2aServer *arkv1prealpha1.A2AServer) bool {
	for _, condition := range a2aServer.Status.Conditions {
		if condition.Type == "Ready" && condition.Status == "True" {
			return true
		}
	}
	return false
}

// setCondition sets a condition on the Agent
func (r *AgentReconciler) setCondition(agent *arkv1alpha1.Agent, conditionType string, status metav1.ConditionStatus, reason, message string) {
	meta.SetStatusCondition(&agent.Status.Conditions, metav1.Condition{
		Type:               conditionType,
		Status:             status,
		Reason:             reason,
		Message:            message,
		ObservedGeneration: agent.Generation,
	})
}

// updateStatus updates the Agent status
func (r *AgentReconciler) updateStatus(ctx context.Context, agent *arkv1alpha1.Agent) error {
	if ctx.Err() != nil {
		return nil
	}

	err := r.Status().Update(ctx, agent)
	if err != nil {
		if errors.IsNotFound(err) {
			return nil
		}
		logf.FromContext(ctx).Error(err, "failed to update agent status")
	}
	return err
}

// agentModelRefIndexer returns the model reference name for field-based Agent lookups.
func agentModelRefIndexer(obj client.Object) []string {
	agent := obj.(*arkv1alpha1.Agent)
	if agent.Spec.ModelRef == nil {
		return nil
	}
	return []string{agent.Spec.ModelRef.Name}
}

// agentExecutionEngineIndexer returns the execution engine name for field-based Agent lookups.
func agentExecutionEngineIndexer(obj client.Object) []string {
	agent := obj.(*arkv1alpha1.Agent)
	if agent.Spec.ExecutionEngine == nil {
		return nil
	}
	return []string{agent.Spec.ExecutionEngine.Name}
}

// agentToolNamesIndexer returns indexed tool names for field-based Agent lookups, skipping built-in tools.
func agentToolNamesIndexer(obj client.Object) []string {
	agent := obj.(*arkv1alpha1.Agent)
	var names []string
	for _, tool := range agent.Spec.Tools {
		if tool.Type == "built-in" {
			continue
		}
		if tool.Name != "" {
			names = append(names, tool.Name)
		}
		if tool.Partial != nil && tool.Partial.Name != "" {
			names = append(names, tool.Partial.Name)
		}
	}
	return names
}

func (r *AgentReconciler) SetupWithManager(mgr ctrl.Manager) error {
	if err := mgr.GetFieldIndexer().IndexField(
		context.Background(), &arkv1alpha1.Agent{}, ".spec.modelRef.name", agentModelRefIndexer,
	); err != nil {
		return err
	}

	if err := mgr.GetFieldIndexer().IndexField(
		context.Background(), &arkv1alpha1.Agent{}, ".spec.executionEngine.name", agentExecutionEngineIndexer,
	); err != nil {
		return err
	}

	if err := mgr.GetFieldIndexer().IndexField(
		context.Background(), &arkv1alpha1.Agent{}, ".spec.tools.name", agentToolNamesIndexer,
	); err != nil {
		return err
	}

	return ctrl.NewControllerManagedBy(mgr).
		For(&arkv1alpha1.Agent{}).
		Watches(
			&arkv1alpha1.Tool{},
			handler.EnqueueRequestsFromMapFunc(r.findAgentsForTool),
		).
		Watches(
			&arkv1alpha1.Model{},
			handler.EnqueueRequestsFromMapFunc(r.findAgentsForModel),
		).
		Watches(
			&arkv1prealpha1.A2AServer{},
			handler.EnqueueRequestsFromMapFunc(r.findAgentsForA2AServer),
		).
		Watches(
			&arkv1prealpha1.ExecutionEngine{},
			handler.EnqueueRequestsFromMapFunc(r.findAgentsForExecutionEngine),
		).
		Named("agent").
		Complete(r)
}

func (r *AgentReconciler) findAgentsForTool(ctx context.Context, obj client.Object) []reconcile.Request {
	var agentList arkv1alpha1.AgentList
	if err := r.List(ctx, &agentList,
		client.InNamespace(obj.GetNamespace()),
		client.MatchingFields{".spec.tools.name": obj.GetName()},
	); err != nil {
		return nil
	}
	return agentsToRequests(agentList.Items)
}

func (r *AgentReconciler) findAgentsForModel(ctx context.Context, obj client.Object) []reconcile.Request {
	var agentList arkv1alpha1.AgentList
	if err := r.List(ctx, &agentList,
		client.InNamespace(obj.GetNamespace()),
		client.MatchingFields{".spec.modelRef.name": obj.GetName()},
	); err != nil {
		return nil
	}
	return agentsToRequests(agentList.Items)
}

func (r *AgentReconciler) findAgentsForExecutionEngine(ctx context.Context, obj client.Object) []reconcile.Request {
	var agentList arkv1alpha1.AgentList
	if err := r.List(ctx, &agentList,
		client.InNamespace(obj.GetNamespace()),
		client.MatchingFields{".spec.executionEngine.name": obj.GetName()},
	); err != nil {
		return nil
	}
	return agentsToRequests(agentList.Items)
}

func agentsToRequests(agents []arkv1alpha1.Agent) []reconcile.Request {
	requests := make([]reconcile.Request, len(agents))
	for i, agent := range agents {
		requests[i] = reconcile.Request{
			NamespacedName: types.NamespacedName{Name: agent.Name, Namespace: agent.Namespace},
		}
	}
	return requests
}

// findAgentsForA2AServer finds agents owned by the given A2AServer
func (r *AgentReconciler) findAgentsForA2AServer(ctx context.Context, obj client.Object) []reconcile.Request {
	a2aServer, ok := obj.(*arkv1prealpha1.A2AServer)
	if !ok {
		return nil
	}

	log := logf.Log.WithName("agent-controller").WithValues("a2aserver", a2aServer.Name, "namespace", a2aServer.Namespace)

	// List all agents in the same namespace
	var agentList arkv1alpha1.AgentList
	if err := r.List(ctx, &agentList, client.InNamespace(a2aServer.Namespace)); err != nil {
		log.Error(err, "Failed to list agents for A2AServer dependency check")
		return nil
	}

	var requests []reconcile.Request
	for _, agent := range agentList.Items {
		// Check if this agent is owned by the A2AServer
		for _, ownerRef := range agent.GetOwnerReferences() {
			if ownerRef.Kind == "A2AServer" && ownerRef.Name == a2aServer.Name {
				requests = append(requests, reconcile.Request{
					NamespacedName: types.NamespacedName{
						Name:      agent.Name,
						Namespace: agent.Namespace,
					},
				})
				log.Info("Triggering reconciliation for agent owned by A2AServer", "agent", agent.Name)
				break
			}
		}
	}

	return requests
}
