/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/annotations"
	"mckinsey.com/ark/internal/common"
	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/genai"
	"mckinsey.com/ark/internal/labels"
)

const (
	// Condition types
	A2AServerReady       = "Ready"
	A2AServerDiscovering = "Discovering"
)

type A2AServerReconciler struct {
	client.Client
	Scheme   *runtime.Scheme
	Eventing eventing.Provider
	resolver *common.ValueSourceResolverV1PreAlpha1
}

// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=a2aservers,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=a2aservers/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=a2aservers/finalizers,verbs=update
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=agents,verbs=get;list;watch;create;update;patch;delete;deletecollection
// +kubebuilder:rbac:groups="",resources=events,verbs=create;patch
// +kubebuilder:rbac:groups="",resources=secrets,verbs=get;list;watch
// +kubebuilder:rbac:groups="",resources=configmaps,verbs=get;list;watch
// +kubebuilder:rbac:groups="",resources=services,verbs=get;list;watch

func (r *A2AServerReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	var a2aServer arkv1prealpha1.A2AServer
	if err := r.Get(ctx, req.NamespacedName, &a2aServer); err != nil {
		if errors.IsNotFound(err) {
			// A2AServer was deleted, associated agents will be cleaned up by owner references
			log.Info("A2AServer deleted, associated agents will be cleaned up by owner references", "server", req.Name, "namespace", req.Namespace)
			return ctrl.Result{}, nil
		}
		log.Error(err, "unable to fetch A2AServer")
		return ctrl.Result{}, err
	}

	if len(a2aServer.Status.Conditions) == 0 {
		if err := r.reconcileConditionsInitializing(ctx, &a2aServer); err != nil {
			return ctrl.Result{}, err
		}
		// Return early to avoid double reconciliation, let the status update trigger next reconcile
		return ctrl.Result{}, nil
	}

	resolver := r.getResolver()
	resolvedAddress, err := resolver.ResolveValueSource(ctx, a2aServer.Spec.Address, a2aServer.Namespace)
	if err != nil {
		if err := r.reconcileConditionsAddressResolutionFailed(ctx, &a2aServer); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{RequeueAfter: a2aServer.Spec.PollInterval.Duration}, nil
	}
	a2aServer.Status.LastResolvedAddress = resolvedAddress

	return r.processServer(ctx, a2aServer)
}

func (r *A2AServerReconciler) getResolver() *common.ValueSourceResolverV1PreAlpha1 {
	if r.resolver == nil {
		r.resolver = &common.ValueSourceResolverV1PreAlpha1{Client: r.Client}
	}
	return r.resolver
}

func (r *A2AServerReconciler) processServer(ctx context.Context, a2aServer arkv1prealpha1.A2AServer) (ctrl.Result, error) {
	// Set discovering condition
	r.reconcileCondition(&a2aServer, A2AServerDiscovering, metav1.ConditionTrue, "DiscoveringAgents", "Discovering agents from A2A server")

	// Use the already resolved address from status
	resolvedAddress := a2aServer.Status.LastResolvedAddress
	// Don't pass recorder - we handle events at controller level based on actual changes
	agentCard, err := genai.DiscoverA2AAgents(ctx, r.Client, resolvedAddress, a2aServer.Spec.Headers, a2aServer.Namespace)
	if err != nil {
		if err := r.reconcileConditionsDiscoveryFailed(ctx, &a2aServer, err, resolvedAddress); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{RequeueAfter: a2aServer.Spec.PollInterval.Duration}, nil
	}

	// Create/update agents and check if anything actually changed
	agentsChanged, err := r.createAgentWithSkills(ctx, &a2aServer, agentCard)
	if err != nil {
		if err := r.reconcileConditionsAgentCreationFailed(ctx, &a2aServer, err, agentCard.Name); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{RequeueAfter: a2aServer.Spec.PollInterval.Duration}, nil
	}

	return r.finalizeA2AServerProcessing(ctx, a2aServer, agentsChanged)
}

// reconcileCondition updates a condition on the A2AServer and returns true if it changed
func (r *A2AServerReconciler) reconcileCondition(a2aServer *arkv1prealpha1.A2AServer, conditionType string, status metav1.ConditionStatus, reason, message string) bool {
	return meta.SetStatusCondition(&a2aServer.Status.Conditions, metav1.Condition{
		Type:               conditionType,
		Status:             status,
		Reason:             reason,
		Message:            message,
		ObservedGeneration: a2aServer.Generation,
	})
}

// reconcileConditionsInitializing sets initial conditions for a new A2AServer
func (r *A2AServerReconciler) reconcileConditionsInitializing(ctx context.Context, a2aServer *arkv1prealpha1.A2AServer) error {
	changed1 := r.reconcileCondition(a2aServer, A2AServerReady, metav1.ConditionFalse, "Initializing", "A2AServer is being initialized")
	changed2 := r.reconcileCondition(a2aServer, A2AServerDiscovering, metav1.ConditionTrue, "StartingDiscovery", "Starting agent discovery process")
	if changed1 || changed2 {
		return r.updateStatusWithConditions(ctx, a2aServer)
	}
	return nil
}

// reconcileConditionsAddressResolutionFailed updates conditions when address resolution fails
func (r *A2AServerReconciler) reconcileConditionsAddressResolutionFailed(ctx context.Context, a2aServer *arkv1prealpha1.A2AServer) error {
	changed1 := r.reconcileCondition(a2aServer, A2AServerDiscovering, metav1.ConditionFalse, "AddressResolutionFailed", "Cannot attempt discovery due to address resolution failure")
	changed2 := r.reconcileCondition(a2aServer, A2AServerReady, metav1.ConditionFalse, "AddressResolutionFailed", "Server not ready due to address resolution failure")
	if changed1 || changed2 {
		return r.updateStatusWithConditions(ctx, a2aServer)
	}
	return nil
}

// reconcileConditionsDiscoveryFailed updates conditions when discovery fails
func (r *A2AServerReconciler) reconcileConditionsDiscoveryFailed(ctx context.Context, a2aServer *arkv1prealpha1.A2AServer, err error, resolvedAddress string) error {
	changed := r.reconcileCondition(a2aServer, A2AServerReady, metav1.ConditionFalse, "DiscoveryFailed", fmt.Sprintf("Server not ready due to discovery failure: %v", err))
	if changed {
		r.Eventing.A2aRecorder().AgentDiscoveryFailed(ctx, a2aServer, fmt.Sprintf("Failed to discover agents from A2A server %s: %v", resolvedAddress, err))
		return r.updateStatusWithConditions(ctx, a2aServer)
	}
	return nil
}

// reconcileConditionsAgentCreationFailed updates conditions when agent creation fails
func (r *A2AServerReconciler) reconcileConditionsAgentCreationFailed(ctx context.Context, a2aServer *arkv1prealpha1.A2AServer, err error, agentName string) error {
	changed := r.reconcileCondition(a2aServer, A2AServerReady, metav1.ConditionFalse, "AgentCreationFailed", fmt.Sprintf("Failed to create agent: %v", err))
	if changed {
		r.Eventing.A2aRecorder().AgentCreationFailed(ctx, a2aServer, fmt.Sprintf("Failed to create A2A agent %s: %v", agentName, err))
		return r.updateStatusWithConditions(ctx, a2aServer)
	}
	return nil
}

// reconcileConditionsReady updates conditions when A2AServer becomes ready
func (r *A2AServerReconciler) reconcileConditionsReady(ctx context.Context, a2aServer *arkv1prealpha1.A2AServer, agentsChanged bool) error {
	log := logf.FromContext(ctx)
	changed1 := r.reconcileCondition(a2aServer, A2AServerDiscovering, metav1.ConditionFalse, "DiscoveryComplete", "Agent discovery completed")
	changed2 := r.reconcileCondition(a2aServer, A2AServerReady, metav1.ConditionTrue, "AgentDiscovered", "Successfully discovered agent")

	if changed1 || changed2 || agentsChanged {
		if changed1 || changed2 {
			if err := r.updateStatusWithConditions(ctx, a2aServer); err != nil {
				return err
			}
		}
		if agentsChanged {
			log.Info("a2a agent discovered", "server", a2aServer.Name, "namespace", a2aServer.Namespace)
		}
	}
	return nil
}

// updateStatusWithConditions updates the A2AServer status
func (r *A2AServerReconciler) updateStatusWithConditions(ctx context.Context, a2aServer *arkv1prealpha1.A2AServer) error {
	if ctx.Err() != nil {
		return nil
	}
	err := r.Status().Update(ctx, a2aServer)
	if err != nil {
		logf.FromContext(ctx).Error(err, "failed to update A2AServer status")
	}
	return err
}

func (r *A2AServerReconciler) createAgentWithSkills(ctx context.Context, a2aServer *arkv1prealpha1.A2AServer, agentCard *genai.A2AAgentCard) (bool, error) {
	log := logf.FromContext(ctx)
	anyChange := false

	// Get existing agents for mark-and-sweep
	existingAgents, err := r.listAgentByA2AServer(ctx, a2aServer.Namespace, a2aServer.Name)
	if err != nil {
		return false, fmt.Errorf("failed to list agents for A2AServer %s: %w", a2aServer.Name, err)
	}

	// Mark all existing agents for deletion
	agentMap := make(map[string]bool)
	for _, agent := range existingAgents.Items {
		agentMap[agent.Name] = false
	}

	// Create/update current agent and mark as keep
	agentName := r.sanitizeAgentName(agentCard.Name)
	agent := r.buildAgentWithSkills(a2aServer, agentCard, agentName)
	agentMap[agentName] = true

	created, err := r.createOrUpdateAgent(ctx, agent, agentName, a2aServer.Name)
	if err != nil {
		log.Error(err, "Failed to create agent", "agent", agentName, "a2aServer", a2aServer.Name, "namespace", a2aServer.Namespace)
		return false, err
	}

	if created {
		anyChange = true
	}

	// Delete unmarked agents
	for agentName, keep := range agentMap {
		if !keep {
			if err := r.Delete(ctx, &arkv1alpha1.Agent{
				ObjectMeta: metav1.ObjectMeta{
					Name:      agentName,
					Namespace: a2aServer.Namespace,
				},
			}); err != nil {
				log.Error(err, "Failed to delete agent", "agent", agentName, "a2aServer", a2aServer.Name, "namespace", a2aServer.Namespace)
				r.Eventing.A2aRecorder().AgentDeletionFailed(ctx, a2aServer, fmt.Sprintf("Failed to delete obsolete agent %s: %v", agentName, err))
				return false, err
			}
			log.Info("agent deleted", "agent", agentName, "a2aServer", a2aServer.Name, "namespace", a2aServer.Namespace)
			anyChange = true
		}
	}

	return anyChange, nil
}

func (r *A2AServerReconciler) buildAgentWithSkills(a2aServer *arkv1prealpha1.A2AServer, agentCard *genai.A2AAgentCard, agentName string) *arkv1alpha1.Agent {
	// Build skills annotation JSON
	skillsJSON, _ := json.Marshal(agentCard.Skills)

	agentAnnotations := map[string]string{
		annotations.A2AServerName:    a2aServer.Name,
		annotations.A2AServerAddress: a2aServer.Status.LastResolvedAddress,
		annotations.A2AServerSkills:  string(skillsJSON),
	}

	// Inherit ark.mckinsey.com annotations from A2AServer to Agent
	// AAS-2657: Will replace with more idiomatic K8s spec.template pattern
	for key, value := range a2aServer.Annotations {
		if strings.HasPrefix(key, annotations.ARKPrefix) {
			agentAnnotations[key] = value
		}
	}

	agent := &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{
			Name:      agentName,
			Namespace: a2aServer.Namespace,
			Labels: map[string]string{
				labels.A2AServerLabel: a2aServer.Name,
			},
			Annotations: agentAnnotations,
		},
		Spec: arkv1alpha1.AgentSpec{
			Description: agentCard.Description,
			Prompt:      fmt.Sprintf("You are %s. %s", agentCard.Name, agentCard.Description),
			ExecutionEngine: &arkv1alpha1.ExecutionEngineRef{
				Name: genai.ExecutionEngineA2A,
			},
		},
	}

	_ = controllerutil.SetOwnerReference(a2aServer, agent, r.Scheme)
	return agent
}

func (r *A2AServerReconciler) createOrUpdateAgent(ctx context.Context, agent *arkv1alpha1.Agent, agentName, a2aServerName string) (changed bool, err error) {
	log := logf.FromContext(ctx)
	existingAgent := &arkv1alpha1.Agent{}
	getErr := r.Get(ctx, client.ObjectKey{Name: agentName, Namespace: agent.Namespace}, existingAgent)

	if errors.IsNotFound(getErr) {
		if err := r.Create(ctx, agent); err != nil {
			log.Error(err, "Failed to create A2A agent", "agent", agentName, "a2aServer", a2aServerName)
			return false, fmt.Errorf("failed to create agent %s: %w", agentName, err)
		}
		log.Info("a2a agent created", "agent", agentName, "a2aServer", a2aServerName, "namespace", agent.Namespace)
		return true, nil
	}

	if getErr != nil {
		log.Error(getErr, "Failed to get existing A2A agent", "agent", agentName, "a2aServer", a2aServerName)
		return false, fmt.Errorf("failed to get agent %s: %w", agentName, getErr)
	}

	// Only update if skills annotation has changed
	if existingAgent.Annotations[annotations.A2AServerSkills] != agent.Annotations[annotations.A2AServerSkills] {
		existingAgent.Spec = agent.Spec
		existingAgent.Annotations = agent.Annotations
		if err := r.Update(ctx, existingAgent); err != nil {
			log.Error(err, "Failed to update A2A agent", "agent", agentName, "a2aServer", a2aServerName)
			return false, fmt.Errorf("failed to update agent %s: %w", agentName, err)
		}
		log.Info("a2a agent updated", "agent", agentName, "a2aServer", a2aServerName, "namespace", existingAgent.Namespace)
		return true, nil
	}

	return false, nil
}

func (r *A2AServerReconciler) finalizeA2AServerProcessing(ctx context.Context, a2aServer arkv1prealpha1.A2AServer, agentsChanged bool) (ctrl.Result, error) {
	readyCondition := meta.FindStatusCondition(a2aServer.Status.Conditions, A2AServerReady)
	if readyCondition != nil && readyCondition.Status == metav1.ConditionTrue && readyCondition.Reason == "AgentDiscovered" && !agentsChanged {
		// Already ready and no changes - skip event emission
		return ctrl.Result{RequeueAfter: a2aServer.Spec.PollInterval.Duration}, nil
	}

	if err := r.reconcileConditionsReady(ctx, &a2aServer, agentsChanged); err != nil {
		return ctrl.Result{}, err
	}

	return ctrl.Result{RequeueAfter: a2aServer.Spec.PollInterval.Duration}, nil
}

func (r *A2AServerReconciler) sanitizeAgentName(name string) string {
	// Sanitize agent name to comply with Kubernetes RFC 1123 subdomain rules:
	// - Only lowercase alphanumeric characters, '-' or '.'
	// - Must start and end with alphanumeric character
	sanitized := strings.ReplaceAll(name, "_", "-")
	sanitized = strings.ReplaceAll(sanitized, " ", "-")
	sanitized = strings.ToLower(sanitized)
	return sanitized
}

func (r *A2AServerReconciler) listAgentByA2AServer(ctx context.Context, a2aServerNamespace, a2aServerName string) (*arkv1alpha1.AgentList, error) {
	agentList := &arkv1alpha1.AgentList{}
	listOpts := []client.ListOption{
		client.InNamespace(a2aServerNamespace),
		client.MatchingLabels{labels.A2AServerLabel: a2aServerName},
	}
	err := r.List(ctx, agentList, listOpts...)
	return agentList, err
}

func (r *A2AServerReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&arkv1prealpha1.A2AServer{}).
		Named("a2aserver").
		Complete(r)
}
