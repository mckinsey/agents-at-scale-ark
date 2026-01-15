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
		logf.FromContext(ctx).Error(err, "failed to update agent status")
	}
	return err
}

func (r *AgentReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&arkv1alpha1.Agent{}).
		// Watch for Tool events and reconcile dependent agents
		Watches(
			&arkv1alpha1.Tool{},
			handler.EnqueueRequestsFromMapFunc(r.findAgentsForTool),
		).
		// Watch for Model events and reconcile dependent agents
		Watches(
			&arkv1alpha1.Model{},
			handler.EnqueueRequestsFromMapFunc(r.findAgentsForModel),
		).
		// Watch for A2AServer events and reconcile owned agents
		Watches(
			&arkv1prealpha1.A2AServer{},
			handler.EnqueueRequestsFromMapFunc(r.findAgentsForA2AServer),
		).
		Named("agent").
		Complete(r)
}

// findAgentsForTool finds agents that depend on the given tool
func (r *AgentReconciler) findAgentsForTool(ctx context.Context, obj client.Object) []reconcile.Request {
	tool, ok := obj.(*arkv1alpha1.Tool)
	if !ok {
		return nil
	}

	return r.findAgentsForDependency(ctx, tool.Name, tool.Namespace, "tool", func(agent *arkv1alpha1.Agent) bool {
		return r.agentDependsOnTool(agent, tool.Name)
	})
}

// findAgentsForModel finds agents that depend on the given model
func (r *AgentReconciler) findAgentsForModel(ctx context.Context, obj client.Object) []reconcile.Request {
	model, ok := obj.(*arkv1alpha1.Model)
	if !ok {
		return nil
	}

	return r.findAgentsForDependency(ctx, model.Name, model.Namespace, "model", func(agent *arkv1alpha1.Agent) bool {
		return r.agentDependsOnModel(agent, model.Name)
	})
}

// findAgentsForDependency is a generic function to find agents that depend on a given resource
func (r *AgentReconciler) findAgentsForDependency(ctx context.Context, resourceName, namespace, resourceType string, dependencyCheck func(*arkv1alpha1.Agent) bool) []reconcile.Request {
	log := logf.Log.WithName("agent-controller").WithValues(resourceType, resourceName, "namespace", namespace)

	// List all agents in the same namespace
	var agentList arkv1alpha1.AgentList
	if err := r.List(ctx, &agentList, client.InNamespace(namespace)); err != nil {
		log.Error(err, "Failed to list agents for dependency check", "resourceType", resourceType)
		return nil
	}

	var requests []reconcile.Request
	seenAgents := make(map[string]bool) // Deduplication map

	for _, agent := range agentList.Items {
		// Check if this agent depends on the resource
		if dependencyCheck(&agent) {
			agentKey := agent.Namespace + "/" + agent.Name

			// Skip if we've already added this agent
			if seenAgents[agentKey] {
				continue
			}
			seenAgents[agentKey] = true

			requests = append(requests, reconcile.Request{
				NamespacedName: types.NamespacedName{
					Name:      agent.Name,
					Namespace: agent.Namespace,
				},
			})
		}
	}

	return requests
}

// agentDependsOnTool checks if an agent depends on a specific tool
func (r *AgentReconciler) agentDependsOnTool(agent *arkv1alpha1.Agent, toolName string) bool {
	for _, toolSpec := range agent.Spec.Tools {
		// Skip built-in tools - they don't reference Tool CRDs
		if toolSpec.Type == "built-in" {
			continue
		}
		// Check both the exposed name and the actual tool name (for partial tools)
		if toolSpec.Name == toolName {
			return true
		}
		if toolSpec.Partial != nil && toolSpec.Partial.Name == toolName {
			return true
		}
	}
	return false
}

// agentDependsOnModel checks if an agent depends on a specific model
func (r *AgentReconciler) agentDependsOnModel(agent *arkv1alpha1.Agent, modelName string) bool {
	return agent.Spec.ModelRef != nil && agent.Spec.ModelRef.Name == modelName
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
