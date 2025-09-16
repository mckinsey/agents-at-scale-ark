/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"fmt"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/tools/record"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/handler"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
)

const (
	defaultModelName = "default"
)

type AgentReconciler struct {
	client.Client
	Recorder record.EventRecorder
	Scheme   *runtime.Scheme
}

// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=agents,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=agents/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=agents/finalizers,verbs=update
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=tools,verbs=get;list;watch
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=models,verbs=get;list;watch
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=a2aservers,verbs=get;list;watch

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

	// Initialize phase to Pending if not set (for newly created agents)
	if agent.Status.Phase == "" {
		agent.Status.Phase = arkv1alpha1.AgentPhasePending
		if err := r.Status().Update(ctx, &agent); err != nil {
			log.Error(err, "Failed to initialize Agent status")
			return ctrl.Result{}, err
		}
		r.Recorder.Event(&agent, corev1.EventTypeNormal, "AgentCreated", "Initialized agent status to Pending")
	}

	// Check tool dependencies and update status
	newPhase, err := r.checkDependencies(ctx, &agent)
	if err != nil {
		log.Error(err, "Failed to check dependencies")
		return ctrl.Result{}, err
	}

	// Update status if phase changed
	if agent.Status.Phase != newPhase {
		agent.Status.Phase = newPhase
		if err := r.Status().Update(ctx, &agent); err != nil {
			log.Error(err, "Failed to update Agent status")
			// Return error to trigger retry - controller-runtime will handle the retry with backoff
			return ctrl.Result{}, err
		}
		r.Recorder.Event(&agent, corev1.EventTypeNormal, "StatusChanged", fmt.Sprintf("Agent status changed to %s", newPhase))
	}

	// Note: We also watch for Tool/Model events, so this is just a fallback
	if newPhase == arkv1alpha1.AgentPhasePending {
		return ctrl.Result{RequeueAfter: 5 * time.Minute}, nil // Reduced frequency since we have event-driven updates
	}

	return ctrl.Result{}, nil
}

// checkDependencies validates all agent dependencies and returns appropriate phase
func (r *AgentReconciler) checkDependencies(ctx context.Context, agent *arkv1alpha1.Agent) (arkv1alpha1.AgentPhase, error) {
	// Check A2AServer dependency (if agent is owned by an A2AServer)
	if phase, err := r.checkA2AServerDependency(ctx, agent); err != nil || phase != arkv1alpha1.AgentPhaseReady {
		return phase, err
	}

	// Check model dependency
	if phase, err := r.checkModelDependency(ctx, agent); err != nil || phase != arkv1alpha1.AgentPhaseReady {
		return phase, err
	}

	// Check tool dependencies
	return r.checkToolDependencies(ctx, agent)
}

// checkModelDependency validates model dependency
func (r *AgentReconciler) checkModelDependency(ctx context.Context, agent *arkv1alpha1.Agent) (arkv1alpha1.AgentPhase, error) {
	modelName := defaultModelName
	modelNamespace := agent.Namespace

	if agent.Spec.ModelRef != nil {
		modelName = agent.Spec.ModelRef.Name
		if agent.Spec.ModelRef.Namespace != "" {
			modelNamespace = agent.Spec.ModelRef.Namespace
		}
	}

	var model arkv1alpha1.Model
	modelKey := types.NamespacedName{Name: modelName, Namespace: modelNamespace}
	if err := r.Get(ctx, modelKey, &model); err != nil {
		if errors.IsNotFound(err) {
			r.Recorder.Event(agent, corev1.EventTypeWarning, "ModelNotFound", fmt.Sprintf("Model '%s' not found in namespace '%s'", modelName, modelNamespace))
			return arkv1alpha1.AgentPhasePending, nil
		}
		return arkv1alpha1.AgentPhaseError, err
	}

	return arkv1alpha1.AgentPhaseReady, nil
}

// checkToolDependencies validates tool dependencies
func (r *AgentReconciler) checkToolDependencies(ctx context.Context, agent *arkv1alpha1.Agent) (arkv1alpha1.AgentPhase, error) {
	for _, toolSpec := range agent.Spec.Tools {
		if toolSpec.Type == "custom" && toolSpec.Name != "" {
			var tool arkv1alpha1.Tool
			toolKey := types.NamespacedName{Name: toolSpec.Name, Namespace: agent.Namespace}
			if err := r.Get(ctx, toolKey, &tool); err != nil {
				if errors.IsNotFound(err) {
					r.Recorder.Event(agent, corev1.EventTypeWarning, "ToolNotFound", fmt.Sprintf("Tool '%s' not found in namespace '%s'", toolSpec.Name, agent.Namespace))
					return arkv1alpha1.AgentPhasePending, nil
				}
				return arkv1alpha1.AgentPhaseError, err
			}
		}
	}

	// All dependencies resolved
	return arkv1alpha1.AgentPhaseReady, nil
}

// checkA2AServerDependency validates A2AServer dependency for agents owned by A2AServers
func (r *AgentReconciler) checkA2AServerDependency(ctx context.Context, agent *arkv1alpha1.Agent) (arkv1alpha1.AgentPhase, error) {
	// Check if agent has an A2AServer owner
	for _, ownerRef := range agent.GetOwnerReferences() {
		if ownerRef.Kind == "A2AServer" && ownerRef.APIVersion == "ark.mckinsey.com/v1prealpha1" {
			// Get the A2AServer
			var a2aServer arkv1prealpha1.A2AServer
			a2aServerKey := types.NamespacedName{Name: ownerRef.Name, Namespace: agent.Namespace}
			if err := r.Get(ctx, a2aServerKey, &a2aServer); err != nil {
				if errors.IsNotFound(err) {
					r.Recorder.Event(agent, corev1.EventTypeWarning, "A2AServerNotFound", fmt.Sprintf("A2AServer '%s' not found in namespace '%s'", ownerRef.Name, agent.Namespace))
					return arkv1alpha1.AgentPhasePending, nil
				}
				return arkv1alpha1.AgentPhaseError, err
			}

			// Check if A2AServer is Ready
			isReady := false
			for _, condition := range a2aServer.Status.Conditions {
				if condition.Type == "Ready" && condition.Status == "True" {
					isReady = true
					break
				}
			}

			if !isReady {
				r.Recorder.Event(agent, corev1.EventTypeWarning, "A2AServerNotReady", fmt.Sprintf("A2AServer '%s' is not ready", ownerRef.Name))
				return arkv1alpha1.AgentPhasePending, nil
			}

			// A2AServer is ready - emit event for successful dependency
			r.Recorder.Event(agent, corev1.EventTypeNormal, "A2AServerReady", fmt.Sprintf("A2AServer '%s' is ready", ownerRef.Name))
		}
	}

	// No A2AServer owner or A2AServer is ready
	return arkv1alpha1.AgentPhaseReady, nil
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
			log.Info("Triggering reconciliation for agent dependent on resource", "agent", agent.Name, "resourceType", resourceType)
		}
	}

	return requests
}

// agentDependsOnTool checks if an agent depends on a specific tool
func (r *AgentReconciler) agentDependsOnTool(agent *arkv1alpha1.Agent, toolName string) bool {
	for _, toolSpec := range agent.Spec.Tools {
		if toolSpec.Type == "custom" && toolSpec.Name == toolName {
			return true
		}
	}
	return false
}

// agentDependsOnModel checks if an agent depends on a specific model
func (r *AgentReconciler) agentDependsOnModel(agent *arkv1alpha1.Agent, modelName string) bool {
	// Check if agent explicitly references this model
	if agent.Spec.ModelRef != nil && agent.Spec.ModelRef.Name == modelName {
		return true
	}
	// Check if agent uses default model (no modelRef) and this is the default model
	if agent.Spec.ModelRef == nil && modelName == defaultModelName {
		return true
	}
	return false
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
