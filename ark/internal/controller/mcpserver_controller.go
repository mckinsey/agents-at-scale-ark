/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
	"mckinsey.com/ark/internal/common"
	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/labels"
	arkmcp "mckinsey.com/ark/internal/mcp"
	"mckinsey.com/ark/internal/resolution"
)

const (
	// Condition types
	MCPServerAvailable   = "Available"
	MCPServerDiscovering = "Discovering"

	// Condition reason used on the Available condition when the MCP
	// server has responded with HTTP 401 and OAuth discovery has
	// populated status.authorization. Distinct from ClientCreationFailed
	// so consumers can branch on auth state without string-matching the
	// error message.
	MCPServerReasonAuthorizationRequired = "AuthorizationRequired"

	// MCPServerReasonAuthorizationDiscoveryFailed is used when the server
	// returns HTTP 401 but fails to advertise OAuth metadata per
	// RFC 9728 — e.g. missing or malformed WWW-Authenticate header, or
	// the protected resource metadata endpoint is unreachable / returns
	// an invalid document. The dashboard cannot offer an authorize flow
	// in this state, so it is surfaced as a failure, not a success.
	MCPServerReasonAuthorizationDiscoveryFailed = "AuthorizationDiscoveryFailed"
)

type MCPServerReconciler struct {
	client.Client
	Scheme   *runtime.Scheme
	Eventing eventing.Provider
	resolver *common.ValueSourceResolver
}

// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=mcpservers,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=mcpservers/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=mcpservers/finalizers,verbs=update
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=tools,verbs=get;list;watch;create;update;patch;delete;deletecollection
// +kubebuilder:rbac:groups="",resources=events,verbs=create;patch
// +kubebuilder:rbac:groups="",resources=secrets,verbs=get;list;watch
// +kubebuilder:rbac:groups="",resources=configmaps,verbs=get;list;watch
// +kubebuilder:rbac:groups="",resources=services,verbs=get;list;watch

func (r *MCPServerReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	var mcpServer arkv1alpha1.MCPServer
	if err := r.Get(ctx, req.NamespacedName, &mcpServer); err != nil {
		if errors.IsNotFound(err) {
			// MCPServer was deleted, tools will be garbage collected due to owner references
			log.Info("MCPServer deleted, associated tools will be garbage collected", "server", req.Name)
			return ctrl.Result{}, nil
		}
		log.Error(err, "unable to fetch MCPServer")
		return ctrl.Result{}, err
	}

	if len(mcpServer.Status.Conditions) == 0 {
		if err := r.reconcileConditionsInitializing(ctx, &mcpServer); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	return r.processServer(ctx, mcpServer)
}

func (r *MCPServerReconciler) getResolver() *common.ValueSourceResolver {
	if r.resolver == nil {
		r.resolver = common.NewValueSourceResolver(r.Client)
	}
	return r.resolver
}

func (r *MCPServerReconciler) listAllMCPTools(ctx context.Context, mcpServerNamespace, mcpServerName string) ([]arkv1alpha1.Tool, error) {
	listOpts := []client.ListOption{
		client.InNamespace(mcpServerNamespace),
		client.MatchingLabels{labels.MCPServerLabel: mcpServerName},
	}

	var toolList arkv1alpha1.ToolList
	if err := r.List(ctx, &toolList, listOpts...); err != nil {
		return nil, err
	}
	return toolList.Items, nil
}

func (r *MCPServerReconciler) deleteAllMCPTools(ctx context.Context, mcpServerNamespace, mcpServerName string) error {
	deleteOpts := []client.DeleteAllOfOption{
		client.InNamespace(mcpServerNamespace),
		client.MatchingLabels{labels.MCPServerLabel: mcpServerName},
	}

	return r.DeleteAllOf(ctx, &arkv1alpha1.Tool{}, deleteOpts...)
}

func (r *MCPServerReconciler) processServer(ctx context.Context, mcpServer arkv1alpha1.MCPServer) (ctrl.Result, error) {
	resolver := r.getResolver()
	resolvedAddress, err := resolver.ResolveValueSource(ctx, mcpServer.Spec.Address, mcpServer.Namespace)
	if err != nil {
		if err := r.reconcileConditionsAddressResolutionFailed(ctx, &mcpServer, err); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{RequeueAfter: getPollInterval(mcpServer.Spec.PollInterval)}, nil
	}

	mcpServer.Status.ResolvedAddress = resolvedAddress
	mcpClient, err := r.createMCPClient(ctx, &mcpServer)
	if err != nil {
		return r.handleClientCreationError(ctx, &mcpServer, err)
	}

	// Previous reconcile may have left authorization status populated;
	// once the client connects successfully, clear it.
	if mcpServer.Status.Authorization != nil {
		mcpServer.Status.Authorization = nil
	}

	mcpTools, err := mcpClient.ListTools(ctx)
	if err != nil {
		if err := r.reconcileConditionsToolListingFailed(ctx, &mcpServer, err); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{RequeueAfter: getPollInterval(mcpServer.Spec.PollInterval)}, nil
	}

	toolsChanged, err := r.createTools(ctx, &mcpServer, mcpTools)
	if err != nil {
		if err := r.reconcileConditionsToolCreationFailed(ctx, &mcpServer, err); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{RequeueAfter: getPollInterval(mcpServer.Spec.PollInterval)}, nil
	}

	return r.finalizeMCPServerProcessing(ctx, mcpServer, len(mcpTools), toolsChanged)
}

// reconcileCondition updates a condition on the MCPServer
// Returns true if the condition changed, false otherwise
func (r *MCPServerReconciler) reconcileCondition(mcpServer *arkv1alpha1.MCPServer, conditionType string, status metav1.ConditionStatus, reason, message string) bool {
	return meta.SetStatusCondition(&mcpServer.Status.Conditions, metav1.Condition{
		Type:               conditionType,
		Status:             status,
		Reason:             reason,
		Message:            message,
		ObservedGeneration: mcpServer.Generation,
	})
}

// reconcileConditionsInitializing sets initial conditions for a new MCPServer
func (r *MCPServerReconciler) reconcileConditionsInitializing(ctx context.Context, mcpServer *arkv1alpha1.MCPServer) error {
	changed1 := r.reconcileCondition(mcpServer, MCPServerAvailable, metav1.ConditionUnknown, "Initializing", "MCPServer is being initialized")
	changed2 := r.reconcileCondition(mcpServer, MCPServerDiscovering, metav1.ConditionTrue, "Starting", "Starting tool discovery process")
	if changed1 || changed2 {
		return r.updateStatus(ctx, mcpServer)
	}
	return nil
}

// reconcileConditionsAddressResolutionFailed updates conditions when address resolution fails
func (r *MCPServerReconciler) reconcileConditionsAddressResolutionFailed(ctx context.Context, mcpServer *arkv1alpha1.MCPServer, err error) error {
	log := logf.FromContext(ctx)
	changed1 := r.reconcileCondition(mcpServer, MCPServerAvailable, metav1.ConditionFalse, "AddressResolutionFailed", "Server not ready due to address resolution failure")
	changed2 := r.reconcileCondition(mcpServer, MCPServerDiscovering, metav1.ConditionFalse, "AddressResolutionFailed", "Cannot attempt discovery due to address resolution failure")
	if changed1 || changed2 {
		log.Error(err, "failed to resolve MCPServer address", "server", mcpServer.Name)
		r.Eventing.MCPServerRecorder().AddressResolutionFailed(ctx, mcpServer, fmt.Sprintf("Failed to resolve address: %v", err))
		return r.updateStatus(ctx, mcpServer)
	}
	return nil
}

// reconcileConditionsClientCreationFailed updates conditions when client creation fails
func (r *MCPServerReconciler) reconcileConditionsClientCreationFailed(ctx context.Context, mcpServer *arkv1alpha1.MCPServer, err error) error {
	log := logf.FromContext(ctx)
	mcpServer.Status.ToolCount = 0
	changed1 := r.reconcileCondition(mcpServer, MCPServerAvailable, metav1.ConditionFalse, "ClientCreationFailed", "Server not ready due to client creation failure")
	changed2 := r.reconcileCondition(mcpServer, MCPServerDiscovering, metav1.ConditionFalse, "ClientCreationFailed", "Cannot attempt discovery due to client creation failure")
	if changed1 || changed2 {
		log.Error(err, "mcp client creation failed", "server", mcpServer.Name)
		r.Eventing.MCPServerRecorder().ClientCreationFailed(ctx, mcpServer, fmt.Sprintf("Failed to create MCP client: %v", err))
		return r.updateStatus(ctx, mcpServer)
	}
	return nil
}

// reconcileConditionsToolListingFailed updates conditions when tool listing fails
func (r *MCPServerReconciler) reconcileConditionsToolListingFailed(ctx context.Context, mcpServer *arkv1alpha1.MCPServer, err error) error {
	log := logf.FromContext(ctx)
	changed1 := r.reconcileCondition(mcpServer, MCPServerDiscovering, metav1.ConditionTrue, "ServerConnectedAndToolListingFailed", err.Error())
	changed2 := r.reconcileCondition(mcpServer, MCPServerAvailable, metav1.ConditionFalse, "ToolListingFailed", "Server not ready due to tool listing failure")
	if changed1 || changed2 {
		log.Error(err, "tool listing failed", "server", mcpServer.Name)
		r.Eventing.MCPServerRecorder().ToolListingFailed(ctx, mcpServer, fmt.Sprintf("Failed to list tools: %v", err))
		return r.updateStatus(ctx, mcpServer)
	}
	return nil
}

// reconcileConditionsToolCreationFailed updates conditions when tool creation fails
func (r *MCPServerReconciler) reconcileConditionsToolCreationFailed(ctx context.Context, mcpServer *arkv1alpha1.MCPServer, err error) error {
	log := logf.FromContext(ctx)
	errorMsg := fmt.Sprintf("Failed to create tools: %v", err)
	changed := r.reconcileCondition(mcpServer, MCPServerAvailable, metav1.ConditionFalse, "ToolCreationFailed", errorMsg)
	if changed {
		log.Error(err, "tool creation failed", "server", mcpServer.Name)
		r.Eventing.MCPServerRecorder().ToolCreationFailed(ctx, mcpServer, errorMsg)
		return r.updateStatus(ctx, mcpServer)
	}
	return nil
}

// handleClientCreationError dispatches failures from createMCPClient to
// the appropriate condition handler — the OAuth discovery path for a
// 401 response, the generic client-creation path otherwise — and
// cleans up any tools owned by the server.
func (r *MCPServerReconciler) handleClientCreationError(ctx context.Context, mcpServer *arkv1alpha1.MCPServer, err error) (ctrl.Result, error) {
	requeue := ctrl.Result{RequeueAfter: getPollInterval(mcpServer.Spec.PollInterval)}

	if ue, ok := arkmcp.IsUnauthorizedError(err); ok {
		if err := r.handleAuthorizationRequired(ctx, mcpServer, ue); err != nil {
			return ctrl.Result{}, err
		}
	} else if err := r.reconcileConditionsClientCreationFailed(ctx, mcpServer, err); err != nil {
		return ctrl.Result{}, err
	}

	if err := r.deleteAllMCPTools(ctx, mcpServer.Namespace, mcpServer.Name); err != nil {
		return ctrl.Result{}, err
	}
	return requeue, nil
}

// handleAuthorizationRequired runs RFC 9728 + RFC 8414 discovery using
// the WWW-Authenticate challenge captured by the MCP transport. On
// success it populates status.authorization and sets the
// AuthorizationRequired condition. On discovery failure (missing or
// malformed WWW-Authenticate, unreachable metadata endpoint, invalid
// metadata document) it sets the AuthorizationDiscoveryFailed condition
// instead — without a usable metadata document the dashboard cannot
// drive an OAuth flow, so the server is surfaced as failed rather than
// silently degraded.
func (r *MCPServerReconciler) handleAuthorizationRequired(ctx context.Context, mcpServer *arkv1alpha1.MCPServer, ue *arkmcp.UnauthorizedError) error {
	log := logf.FromContext(ctx)
	mcpServer.Status.ToolCount = 0

	timeout := parseTimeout(mcpServer.Spec.Timeout)

	metaURL, ok := arkmcp.ParseResourceMetadataURL(ue.WWWAuthenticate)
	if !ok {
		reason := fmt.Sprintf("server returned HTTP 401 but WWW-Authenticate header did not advertise RFC 9728 resource_metadata URL (header=%q)", ue.WWWAuthenticate)
		return r.reconcileConditionsAuthorizationDiscoveryFailed(ctx, mcpServer, reason)
	}

	rm, err := arkmcp.FetchProtectedResourceMetadata(ctx, metaURL, mcpServer.Status.ResolvedAddress, timeout)
	if err != nil {
		reason := fmt.Sprintf("failed to fetch protected resource metadata at %s: %v", metaURL, err)
		log.Error(err, "protected resource metadata fetch failed", "url", metaURL)
		return r.reconcileConditionsAuthorizationDiscoveryFailed(ctx, mcpServer, reason)
	}

	prev := mcpServer.Status.Authorization
	authStatus := &arkv1alpha1.MCPServerAuthorizationStatus{
		State:                arkv1alpha1.MCPServerAuthorizationStateRequired,
		Resource:             rm.Resource,
		ResourceMetadataURL:  metaURL,
		ResourceName:         rm.ResourceName,
		AuthorizationServers: rm.AuthorizationServers,
		ScopesSupported:      rm.ScopesSupported,
	}
	if authStatus.Resource == "" {
		authStatus.Resource = mcpServer.Status.ResolvedAddress
	}

	if len(rm.AuthorizationServers) > 0 {
		if as, err := arkmcp.FetchAuthorizationServerMetadata(ctx, rm.AuthorizationServers[0], timeout); err != nil {
			// RFC 8414 metadata is advisory for surfacing state; a failure
			// here is logged but does not invalidate the AuthorizationRequired
			// signal, because the resource metadata itself was valid.
			log.Info("authorization server metadata fetch failed, continuing with resource metadata only", "issuer", rm.AuthorizationServers[0], "error", err.Error())
		} else {
			authStatus.AuthorizationEndpoint = as.AuthorizationEndpoint
			authStatus.TokenEndpoint = as.TokenEndpoint
			authStatus.RegistrationEndpoint = as.RegistrationEndpoint
			authStatus.GrantTypesSupported = as.GrantTypesSupported
			if len(as.ScopesSupported) > 0 {
				authStatus.ScopesSupported = as.ScopesSupported
			}
		}
	}

	now := metav1.Now()
	authStatus.LastDiscovered = &now
	mcpServer.Status.Authorization = authStatus

	displayName := authStatus.ResourceName
	if displayName == "" {
		displayName = authStatus.Resource
	}
	message := fmt.Sprintf("OAuth authorization required for %s. Authorize via dashboard or CLI.", displayName)

	r.reconcileCondition(mcpServer, MCPServerAvailable, metav1.ConditionFalse, MCPServerReasonAuthorizationRequired, message)
	r.reconcileCondition(mcpServer, MCPServerDiscovering, metav1.ConditionFalse, MCPServerReasonAuthorizationRequired, "Cannot attempt tool discovery until authorization is complete")

	firstEntry := prev == nil || prev.State != arkv1alpha1.MCPServerAuthorizationStateRequired
	urlChanged := prev != nil && prev.ResourceMetadataURL != authStatus.ResourceMetadataURL
	if firstEntry || urlChanged {
		r.Eventing.MCPServerRecorder().AuthorizationRequired(ctx, mcpServer, message)
	}

	return r.updateStatus(ctx, mcpServer)
}

// reconcileConditionsAuthorizationDiscoveryFailed sets conditions when
// the server returned 401 but we could not extract a usable OAuth
// metadata document. status.authorization is populated with
// State=DiscoveryFailed only — metadata fields are left empty so the
// dashboard cannot mistakenly drive an OAuth flow without a valid
// authorization server.
func (r *MCPServerReconciler) reconcileConditionsAuthorizationDiscoveryFailed(ctx context.Context, mcpServer *arkv1alpha1.MCPServer, reason string) error {
	log := logf.FromContext(ctx)
	mcpServer.Status.ToolCount = 0

	now := metav1.Now()
	mcpServer.Status.Authorization = &arkv1alpha1.MCPServerAuthorizationStatus{
		State:          arkv1alpha1.MCPServerAuthorizationStateDiscoveryFailed,
		Resource:       mcpServer.Status.ResolvedAddress,
		LastDiscovered: &now,
	}

	message := fmt.Sprintf("Authorization required but discovery failed: %s", reason)
	changed1 := r.reconcileCondition(mcpServer, MCPServerAvailable, metav1.ConditionFalse, MCPServerReasonAuthorizationDiscoveryFailed, message)
	changed2 := r.reconcileCondition(mcpServer, MCPServerDiscovering, metav1.ConditionFalse, MCPServerReasonAuthorizationDiscoveryFailed, "Cannot attempt tool discovery until authorization metadata can be discovered")

	if changed1 || changed2 {
		log.Error(nil, "MCP authorization discovery failed", "server", mcpServer.Name, "reason", reason)
		r.Eventing.MCPServerRecorder().AuthorizationRequired(ctx, mcpServer, message)
		return r.updateStatus(ctx, mcpServer)
	}
	return nil
}

// reconcileConditionsReady updates conditions when MCPServer is ready
func (r *MCPServerReconciler) reconcileConditionsReady(ctx context.Context, mcpServer *arkv1alpha1.MCPServer, toolCount int, toolsChanged bool) error {
	mcpServer.Status.ToolCount = toolCount
	changed1 := r.reconcileCondition(mcpServer, MCPServerDiscovering, metav1.ConditionFalse, "DiscoveryComplete", "Tool discovery completed")
	changed2 := r.reconcileCondition(mcpServer, MCPServerAvailable, metav1.ConditionTrue, "ToolsDiscovered", fmt.Sprintf("Successfully discovered %d tools", toolCount))

	if changed1 || changed2 || toolsChanged {
		if changed1 || changed2 {
			if err := r.updateStatus(ctx, mcpServer); err != nil {
				return err
			}
		}
	}
	return nil
}

// updateStatus updates the MCPServer status
func (r *MCPServerReconciler) updateStatus(ctx context.Context, mcpServer *arkv1alpha1.MCPServer) error {
	if ctx.Err() != nil {
		return nil
	}
	err := r.Status().Update(ctx, mcpServer)
	if err != nil {
		if errors.IsNotFound(err) {
			return nil
		}
		logf.FromContext(ctx).Error(err, "failed to update MCPServer status")
	}
	return err
}

func (r *MCPServerReconciler) createMCPClient(ctx context.Context, mcpServer *arkv1alpha1.MCPServer) (*arkmcp.MCPClient, error) {
	mcpURL, err := arkmcp.BuildMCPServerURL(ctx, r.Client, mcpServer)
	if err != nil {
		return nil, fmt.Errorf("failed to build MCP server URL: %v", err)
	}

	headers := make(map[string]string)
	if len(mcpServer.Spec.Headers) > 0 {
		resolvedHeaders, err := r.resolveHeaders(ctx, mcpServer)
		if err != nil {
			return nil, err
		}
		headers = resolvedHeaders
	}

	timeout := parseTimeout(mcpServer.Spec.Timeout)

	// MCP settings are not needed for listing tools, etc.
	mcpClient, err := arkmcp.NewMCPClient(ctx, mcpURL, headers, mcpServer.Spec.Transport, timeout, arkmcp.MCPSettings{})
	if err != nil {
		return nil, fmt.Errorf("failed to create MCP client: %w", err)
	}
	return mcpClient, nil
}

func (r *MCPServerReconciler) resolveHeaders(ctx context.Context, mcpServer *arkv1alpha1.MCPServer) (map[string]string, error) {
	headers, err := resolution.ResolveHeaders(ctx, r.Client, mcpServer.Spec.Headers, mcpServer.Namespace)
	if err != nil {
		return nil, err
	}
	return headers, nil
}

func (r *MCPServerReconciler) finalizeMCPServerProcessing(ctx context.Context, mcpServer arkv1alpha1.MCPServer, toolCount int, toolsChanged bool) (ctrl.Result, error) {
	if err := r.reconcileConditionsReady(ctx, &mcpServer, toolCount, toolsChanged); err != nil {
		return ctrl.Result{}, err
	}

	// fetch tools according to polling interval or default interval
	return ctrl.Result{RequeueAfter: getPollInterval(mcpServer.Spec.PollInterval)}, nil
}

func (r *MCPServerReconciler) createTools(ctx context.Context, mcpServer *arkv1alpha1.MCPServer, mcpTools []*mcp.Tool) (bool, error) {
	log := logf.FromContext(ctx)
	changed := false

	existingTools, err := r.listAllMCPTools(ctx, mcpServer.Namespace, mcpServer.Name)
	if err != nil {
		return false, fmt.Errorf("failed to list tools for MCPServer %s: %w", mcpServer.Name, err)
	}

	toolMap := make(map[string]bool)
	for _, tool := range existingTools {
		toolMap[tool.Name] = false
	}

	for _, mcpTool := range mcpTools {
		toolName := r.generateToolName(mcpServer.Name, mcpTool.Name)
		tool := r.buildToolCRD(mcpServer, *mcpTool, toolName)
		toolMap[toolName] = true
		toolChanged, err := r.createOrUpdateSingleTool(ctx, tool, toolName, mcpServer.Name)
		if err != nil {
			log.Error(err, "Failed to create tool", "tool", toolName, "mcpServer", mcpServer.Name, "namespace", mcpServer.Namespace)
			return false, err
		}
		if toolChanged {
			changed = true
		}
	}

	// delete zombie tools
	for toolName, exists := range toolMap {
		if !exists {
			if err := r.Delete(ctx, &arkv1alpha1.Tool{
				ObjectMeta: metav1.ObjectMeta{
					Name:      toolName,
					Namespace: mcpServer.Namespace,
				},
			}); err != nil {
				log.Error(err, "Failed to delete tool", "tool", toolName, "mcpServer", mcpServer.Name, "namespace", mcpServer.Namespace)
				return false, err
			}
			log.Info("tool crd deleted", "tool", toolName, "mcpServer", mcpServer.Name, "namespace", mcpServer.Namespace)
			changed = true
		}
	}

	return changed, nil
}

func (r *MCPServerReconciler) buildToolCRD(mcpServer *arkv1alpha1.MCPServer, mcpTool mcp.Tool, toolName string) *arkv1alpha1.Tool {
	toolAnnotations := make(map[string]string)

	// Inherit ark.mckinsey.com annotations from MCPServer to Tool
	// AAS-2657: Will replace with more idiomatic K8s spec.template pattern
	for key, value := range mcpServer.Annotations {
		if strings.HasPrefix(key, annotations.ARKPrefix) {
			toolAnnotations[key] = value
		}
	}

	tool := &arkv1alpha1.Tool{
		ObjectMeta: metav1.ObjectMeta{
			Name:      toolName,
			Namespace: mcpServer.Namespace,
			Labels: map[string]string{
				labels.MCPServerLabel: mcpServer.Name,
			},
			Annotations: toolAnnotations,
		},
		Spec: arkv1alpha1.ToolSpec{
			Type:        "mcp",
			Description: mcpTool.Description,
			InputSchema: r.convertInputSchemaToRawExtension(mcpTool.InputSchema),
			MCP: &arkv1alpha1.MCPToolRef{
				MCPServerRef: arkv1alpha1.MCPServerRef{
					Name:      mcpServer.Name,
					Namespace: mcpServer.Namespace,
				},
				ToolName: mcpTool.Name,
			},
		},
	}

	_ = controllerutil.SetControllerReference(mcpServer, tool, r.Scheme)
	return tool
}

func (r *MCPServerReconciler) createOrUpdateSingleTool(ctx context.Context, tool *arkv1alpha1.Tool, toolName, mcpServerName string) (bool, error) {
	log := logf.FromContext(ctx)
	existingTool := &arkv1alpha1.Tool{}
	err := r.Get(ctx, client.ObjectKey{Name: toolName, Namespace: tool.Namespace}, existingTool)

	if errors.IsNotFound(err) {
		if err := r.Create(ctx, tool); err != nil {
			return false, fmt.Errorf("failed to create tool %s: %w", toolName, err)
		}
		log.Info("tool crd created", "tool", toolName, "mcpServer", mcpServerName, "namespace", tool.Namespace)
		return true, nil
	}

	if err != nil {
		return false, fmt.Errorf("failed to get tool %s: %w", toolName, err)
	}

	// Check if spec actually changed
	toolSpecJSON, _ := json.Marshal(tool.Spec)
	existingSpecJSON, _ := json.Marshal(existingTool.Spec)
	if string(toolSpecJSON) == string(existingSpecJSON) {
		return false, nil
	}

	existingTool.Spec = tool.Spec
	if err := r.Update(ctx, existingTool); err != nil {
		return false, fmt.Errorf("failed to update tool %s: %w", toolName, err)
	}
	log.Info("tool crd updated", "tool", toolName, "mcpServer", mcpServerName, "namespace", existingTool.Namespace)
	return true, nil
}

func (r *MCPServerReconciler) generateToolName(mcpServerName, toolName string) string {
	// Sanitize tool name to comply with Kubernetes RFC 1123 subdomain rules:
	// - Only lowercase alphanumeric characters, '-' or '.'
	// - Must start and end with alphanumeric character
	sanitizedToolName := strings.ReplaceAll(toolName, "_", "-")
	sanitizedToolName = strings.ToLower(sanitizedToolName)

	return fmt.Sprintf("%s-%s", mcpServerName, sanitizedToolName)
}

func (r *MCPServerReconciler) convertInputSchemaToRawExtension(schema any) *runtime.RawExtension {
	if schema == nil {
		return nil
	}
	bytes, err := json.Marshal(schema)
	if err != nil {
		logf.Log.Error(err, "failed to marshal input schema")
		return &runtime.RawExtension{Raw: json.RawMessage("{}")}
	}
	return &runtime.RawExtension{Raw: bytes}
}

func (r *MCPServerReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&arkv1alpha1.MCPServer{}).
		Named("mcpserver").
		Complete(r)
}

// parseTimeout returns the MCPServer spec timeout as a duration,
// defaulting to 30s when unset and ignoring parse errors (the webhook
// already validates the format; an invalid string at reconcile time is
// treated as "use the default" rather than failing the whole reconcile).
func parseTimeout(raw string) time.Duration {
	const defaultTimeout = 30 * time.Second
	if raw == "" {
		return defaultTimeout
	}
	t, err := time.ParseDuration(raw)
	if err != nil {
		return defaultTimeout
	}
	return t
}
