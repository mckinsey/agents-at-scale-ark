/* Copyright 2025. McKinsey & Company */

package genai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	a2aclient "trpc.group/trpc-go/trpc-a2a-go/client"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	arkann "mckinsey.com/ark/internal/annotations"
	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/telemetry"
)

const (
	// AgentCardPathVersion2 is the A2A protocol 0.2.x agent card path
	AgentCardPathVersion2 = "/.well-known/agent.json"
	// AgentCardPathVersion3 is the A2A protocol 0.3.x agent card path
	AgentCardPathVersion3      = "/.well-known/agent-card.json"
	a2aHistoryExtensionKey     = "https://ark.mckinsey.com/extensions/history/v1"
	a2aPermissionsExtensionKey = "https://ark.mckinsey.com/extensions/permissions/v1"
	a2aExtensionsHeader        = "A2A-Extensions"
)

type A2AResponse struct {
	Content   string
	ContextID string
	TaskID    string
	Partial   bool
	Message   *protocol.Message   `json:"-"`
	Artifacts []protocol.Artifact `json:"-"`
}

type A2APermissions struct {
	Subject    string                 `json:"subject,omitempty"`
	Scopes     []string               `json:"scopes,omitempty"`
	Claims     map[string]interface{} `json:"claims,omitempty"`
	Issuer     string                 `json:"issuer,omitempty"`
	Audience   []string               `json:"audience,omitempty"`
	IssuedAt   string                 `json:"issuedAt,omitempty"`
	ExpiresAt  string                 `json:"expiresAt,omitempty"`
	Token      string                 `json:"token,omitempty"`
	TokenType  string                 `json:"tokenType,omitempty"`
	Delegation *A2ADelegation         `json:"delegation,omitempty"`
}

type A2ADelegation struct {
	Subject string             `json:"subject,omitempty"`
	Chain   []A2ADelegationHop `json:"chain,omitempty"`
}

type A2ADelegationHop struct {
	Agent     string `json:"agent"`
	Namespace string `json:"namespace,omitempty"`
	Timestamp string `json:"timestamp,omitempty"`
	Action    string `json:"action,omitempty"`
}

type A2AAuditEntry struct {
	Agent     string `json:"agent"`
	Namespace string `json:"namespace,omitempty"`
	Action    string `json:"action"`
	Timestamp string `json:"timestamp"`
	TaskID    string `json:"taskId,omitempty"`
	ContextID string `json:"contextId,omitempty"`
}

const (
	TokenTypeJWT = "jwt"
	TokenTypeJWS = "jws"
)

func isA2AStreamingSupported(agentAnnotations map[string]string) bool {
	if agentAnnotations == nil {
		return false
	}
	return agentAnnotations[arkann.A2AStreamingSupported] == TrueString
}

func shouldIncludeA2AHistory(agentAnnotations map[string]string, defaultValue bool) bool {
	if agentAnnotations == nil {
		return defaultValue
	}
	if value, ok := agentAnnotations[arkann.A2AHistoryEnabled]; ok {
		return value == TrueString
	}
	return defaultValue
}

func getA2AHistoryLimit(agentAnnotations map[string]string) int {
	if agentAnnotations == nil {
		return 0
	}
	value := agentAnnotations[arkann.A2AHistoryLimit]
	if value == "" {
		return 0
	}
	limit, err := strconv.Atoi(value)
	if err != nil {
		return 0
	}
	if limit < 0 {
		return 0
	}
	return limit
}

func getA2ASupportedExtensions(agentAnnotations map[string]string) map[string]struct{} {
	if agentAnnotations == nil {
		return nil
	}
	raw := agentAnnotations[arkann.A2ASupportedExtensions]
	if raw == "" {
		return nil
	}
	var values []string
	if err := json.Unmarshal([]byte(raw), &values); err != nil {
		return nil
	}
	if len(values) == 0 {
		return nil
	}
	result := make(map[string]struct{}, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			result[value] = struct{}{}
		}
	}
	if len(result) == 0 {
		return nil
	}
	return result
}

type a2aExtensionPolicy struct {
	URI              string
	AllowedByDefault bool
}

var a2aExtensionPolicies = []a2aExtensionPolicy{
	{URI: a2aHistoryExtensionKey, AllowedByDefault: true},
	{URI: a2aPermissionsExtensionKey, AllowedByDefault: false},
}

func isA2AExtensionAllowed(uri string, supported map[string]struct{}) bool {
	if uri == "" {
		return false
	}
	if supported == nil {
		for _, p := range a2aExtensionPolicies {
			if p.URI == uri {
				return p.AllowedByDefault
			}
		}
		return false
	}
	_, ok := supported[uri]
	return ok
}

func supportsA2AExtension(agentAnnotations map[string]string, extension string) bool {
	supported := getA2ASupportedExtensions(agentAnnotations)
	return isA2AExtensionAllowed(extension, supported)
}

func supportsA2AHistoryExtension(agentAnnotations map[string]string) bool {
	supported := getA2ASupportedExtensions(agentAnnotations)
	return isA2AExtensionAllowed(a2aHistoryExtensionKey, supported)
}

func parseA2APermissions(raw string) (map[string]interface{}, error) {
	if raw == "" {
		return nil, nil
	}
	permissions, err := decodeA2APermissions(raw)
	if err != nil {
		return nil, err
	}
	if err := validateA2APermissions(permissions); err != nil {
		return nil, err
	}
	return encodeA2APermissions(permissions)
}

func buildA2AMetadata(agentAnnotations map[string]string, history []protocol.Message, includeHistory bool) (map[string]interface{}, error) {
	supported := getA2ASupportedExtensions(agentAnnotations)
	supportsPermissions := isA2AExtensionAllowed(a2aPermissionsExtensionKey, supported)
	supportsHistory := isA2AExtensionAllowed(a2aHistoryExtensionKey, supported)
	metadata, err := parseA2AExtensionsMetadata(agentAnnotations)
	if err != nil {
		return nil, err
	}
	metadata = filterUnsupportedA2AExtensions(metadata, supported)

	metadata, err = addA2APermissionsMetadata(metadata, agentAnnotations, supportsPermissions)
	if err != nil {
		return nil, err
	}
	metadata = addA2AHistoryMetadata(metadata, history, includeHistory && supportsHistory, agentAnnotations)

	if len(metadata) == 0 {
		return nil, nil
	}
	return metadata, nil
}

func decodeA2APermissions(raw string) (A2APermissions, error) {
	var permissions A2APermissions
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&permissions); err != nil {
		return A2APermissions{}, fmt.Errorf("failed to parse A2A permissions: %w", err)
	}
	return permissions, nil
}

func validateA2APermissions(permissions A2APermissions) error {
	if permissions.Subject == "" && permissions.Token == "" {
		return fmt.Errorf("A2A permissions must include subject or token")
	}
	if permissions.Token != "" && permissions.TokenType == "" {
		return fmt.Errorf("A2A permissions tokenType is required when token is provided")
	}
	if permissions.Delegation != nil && permissions.Delegation.Subject == "" {
		return fmt.Errorf("A2A permissions delegation subject is required")
	}
	return validateA2APermissionsTimestamps(permissions.IssuedAt, permissions.ExpiresAt)
}

func validateA2APermissionsTimestamps(issuedAtRaw, expiresAtRaw string) error {
	issuedAt, err := parseOptionalRFC3339(issuedAtRaw, "issuedAt")
	if err != nil {
		return err
	}
	expiresAt, err := parseOptionalRFC3339(expiresAtRaw, "expiresAt")
	if err != nil {
		return err
	}
	if !issuedAt.IsZero() && !expiresAt.IsZero() && expiresAt.Before(issuedAt) {
		return fmt.Errorf("A2A permissions expiresAt must be after issuedAt")
	}
	return nil
}

func parseOptionalRFC3339(raw, field string) (time.Time, error) {
	if raw == "" {
		return time.Time{}, nil
	}
	parsed, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return time.Time{}, fmt.Errorf("A2A permissions %s must be RFC3339: %w", field, err)
	}
	return parsed, nil
}

func encodeA2APermissions(permissions A2APermissions) (map[string]interface{}, error) {
	data, err := json.Marshal(permissions)
	if err != nil {
		return nil, fmt.Errorf("failed to encode A2A permissions: %w", err)
	}
	var parsed map[string]interface{}
	if err := json.Unmarshal(data, &parsed); err != nil {
		return nil, fmt.Errorf("failed to parse A2A permissions: %w", err)
	}
	if len(parsed) == 0 {
		return nil, nil
	}
	return parsed, nil
}

func parseA2AExtensionsMetadata(agentAnnotations map[string]string) (map[string]interface{}, error) {
	if agentAnnotations == nil {
		return nil, nil
	}
	raw := agentAnnotations[arkann.A2AExtensions]
	if raw == "" {
		return nil, nil
	}
	var metadata map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &metadata); err != nil {
		return nil, fmt.Errorf("failed to parse A2A extensions: %w", err)
	}
	return metadata, nil
}

func filterUnsupportedA2AExtensions(metadata map[string]interface{}, supported map[string]struct{}) map[string]interface{} {
	if metadata == nil {
		return nil
	}
	for key := range metadata {
		if !isA2AExtensionURI(key) {
			continue
		}
		if !isA2AExtensionAllowed(key, supported) {
			delete(metadata, key)
		}
	}
	if len(metadata) == 0 {
		return nil
	}
	return metadata
}

func addA2APermissionsMetadata(metadata map[string]interface{}, agentAnnotations map[string]string, supported bool) (map[string]interface{}, error) {
	if !supported || agentAnnotations == nil {
		return metadata, nil
	}
	permissionsValue, err := parseA2APermissions(agentAnnotations[arkann.A2APermissions])
	if err != nil {
		return nil, err
	}
	if permissionsValue == nil {
		return metadata, nil
	}
	metadata = ensureA2AMetadata(metadata)
	metadata[a2aPermissionsExtensionKey] = permissionsValue
	return metadata, nil
}

func AppendDelegationHop(permissions *A2APermissions, agentName, namespace, action string) {
	if permissions == nil {
		return
	}
	if permissions.Delegation == nil {
		permissions.Delegation = &A2ADelegation{Subject: permissions.Subject}
	}
	permissions.Delegation.Chain = append(permissions.Delegation.Chain, A2ADelegationHop{
		Agent:     agentName,
		Namespace: namespace,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Action:    action,
	})
}

func ValidateTokenType(permissions A2APermissions) error {
	if permissions.Token == "" {
		return nil
	}
	switch permissions.TokenType {
	case TokenTypeJWT, TokenTypeJWS:
		return nil
	case "bearer":
		return nil
	case "":
		return fmt.Errorf("tokenType is required when token is provided")
	default:
		return fmt.Errorf("unsupported tokenType %q; supported: jwt, jws, bearer", permissions.TokenType)
	}
}

func addA2AHistoryMetadata(metadata map[string]interface{}, history []protocol.Message, include bool, agentAnnotations map[string]string) map[string]interface{} {
	if !include || len(history) == 0 {
		return metadata
	}
	limit := getA2AHistoryLimit(agentAnnotations)
	truncated := false
	if limit > 0 && len(history) > limit {
		history = history[len(history)-limit:]
		truncated = true
	}
	converted := convertToA2AHistory(history)
	metadata = ensureA2AMetadata(metadata)
	metadata[a2aHistoryExtensionKey] = HistoryExtensionV1{
		Messages:  converted,
		Truncated: truncated,
		MaxWindow: limit,
	}
	return metadata
}

func ensureA2AMetadata(metadata map[string]interface{}) map[string]interface{} {
	if metadata != nil {
		return metadata
	}
	return map[string]interface{}{}
}

func buildA2ASendMessageParams(userInput protocol.Message, contextID string, metadata map[string]interface{}, blocking bool) protocol.SendMessageParams {
	message := userInput
	message.Role = protocol.MessageRoleUser
	// A2A requires message.messageId on Message payloads.
	// Ensure the field is always populated before dispatch.
	if message.MessageID == "" {
		message.MessageID = protocol.GenerateRPCID()
	}
	if contextID != "" {
		message.ContextID = &contextID
	}
	params := protocol.SendMessageParams{
		RPCID:   protocol.GenerateRPCID(),
		Message: message,
		Configuration: &protocol.SendMessageConfiguration{
			Blocking: &blocking,
		},
	}
	seen := make(map[string]struct{})
	extensions := make([]string, 0, len(message.Extensions)+len(metadata))
	for _, extension := range message.Extensions {
		trimmed := strings.TrimSpace(extension)
		if trimmed == "" {
			continue
		}
		if _, exists := seen[trimmed]; exists {
			continue
		}
		extensions = append(extensions, trimmed)
		seen[trimmed] = struct{}{}
	}
	if len(metadata) > 0 {
		for key := range metadata {
			if !isA2AExtensionURI(key) {
				continue
			}
			if _, exists := seen[key]; exists {
				continue
			}
			extensions = append(extensions, key)
			seen[key] = struct{}{}
		}
		params.Metadata = metadata
	}
	if len(extensions) > 0 {
		sort.Strings(extensions)
		params.Message.Extensions = extensions
	}
	return params
}

// DiscoverA2AAgents discovers agents from an A2A server using simplified HTTP approach
func DiscoverA2AAgents(ctx context.Context, k8sClient client.Client, address string, headers []arkv1prealpha1.Header, namespace string) (*A2AAgentCard, error) {
	return DiscoverA2AAgentsWithRecorder(ctx, k8sClient, address, headers, namespace, nil, nil)
}

// DiscoverA2AAgentsWithRecorder discovers agents with optional K8s event recording
// Tries both A2A protocol versions: 0.3.x (agent-card.json) and 0.2.x (agent.json)
// Note: protocol.AgentCardPath is version 0.2.x (agent.json) at time of writing
func DiscoverA2AAgentsWithRecorder(ctx context.Context, k8sClient client.Client, address string, headers []arkv1prealpha1.Header, namespace string, a2aRecorder eventing.A2aRecorder, obj client.Object) (*A2AAgentCard, error) {
	baseURL := strings.TrimSuffix(address, "/")

	endpoints := []struct {
		url     string
		version string
	}{
		{baseURL + AgentCardPathVersion3, "protocol version 0.3.x"},
		{baseURL + AgentCardPathVersion2, "protocol version 0.2.x"},
	}

	var lastErr error
	for _, endpoint := range endpoints {
		req, err := createA2ARequest(ctx, endpoint.url, headers, k8sClient, namespace)
		if err != nil {
			lastErr = err
			continue
		}

		agentCard, err := executeA2ARequest(ctx, req, a2aRecorder)
		if err == nil {
			return agentCard, nil
		}

		lastErr = err
	}

	return nil, fmt.Errorf("failed to discover agent from all endpoints (%s, %s): %w",
		AgentCardPathVersion3, AgentCardPathVersion2, lastErr)
}

// ExecuteA2AAgent executes a task on an A2A agent with optional K8s event recording and query context
func ExecuteA2AAgent(ctx context.Context, k8sClient client.Client, address string, headers []arkv1prealpha1.Header, namespace string, userInput protocol.Message, metadata map[string]interface{}, agentName, queryName, contextID string, a2aRecorder eventing.A2aRecorder, obj client.Object) (*A2AResponse, error) {
	rpcURL := strings.TrimSuffix(address, "/")

	// Create and configure A2A client
	a2aClient, err := CreateA2AClient(ctx, k8sClient, rpcURL, headers, namespace, agentName, a2aRecorder)
	if err != nil {
		return nil, err
	}

	// Execute agent and get response
	return executeA2AAgentMessage(ctx, k8sClient, a2aClient, userInput, metadata, agentName, namespace, queryName, contextID, obj, a2aRecorder, true)
}

func StreamA2AAgent(ctx context.Context, k8sClient client.Client, address string, headers []arkv1prealpha1.Header, namespace string, userInput protocol.Message, metadata map[string]interface{}, agentName, contextID string, a2aRecorder eventing.A2aRecorder) (<-chan protocol.StreamingMessageEvent, error) {
	rpcURL := strings.TrimSuffix(address, "/")
	a2aClient, err := CreateA2AClient(ctx, k8sClient, rpcURL, headers, namespace, agentName, a2aRecorder)
	if err != nil {
		return nil, err
	}
	params := buildA2ASendMessageParams(userInput, contextID, metadata, false)
	events, streamErr := a2aClient.StreamMessage(ctx, params)
	if streamErr == nil {
		return events, nil
	}

	log := logf.FromContext(ctx)
	log.V(1).Info("A2A message/stream failed, falling back to message/send", "agent", agentName, "error", streamErr)

	result, sendErr := a2aClient.SendMessage(ctx, params)
	if sendErr != nil {
		return nil, fmt.Errorf("A2A streaming failed (%w) and blocking fallback also failed: %w", streamErr, sendErr)
	}
	if result == nil || result.Result == nil {
		return nil, fmt.Errorf("A2A streaming response is nil")
	}
	switch r := result.Result.(type) {
	case *protocol.Message:
		out := make(chan protocol.StreamingMessageEvent, 1)
		out <- protocol.StreamingMessageEvent{Result: r}
		close(out)
		return out, nil
	case *protocol.Task:
		resubscribe, resubscribeErr := a2aClient.ResubscribeTask(ctx, protocol.TaskIDParams{
			RPCID: protocol.GenerateRPCID(),
			ID:    r.ID,
		})
		if resubscribeErr != nil {
			return nil, resubscribeErr
		}
		out := make(chan protocol.StreamingMessageEvent, 1)
		go func() {
			defer close(out)
			select {
			case out <- protocol.StreamingMessageEvent{Result: r}:
			case <-ctx.Done():
				return
			}
			for event := range resubscribe {
				select {
				case out <- event:
				case <-ctx.Done():
					return
				}
			}
		}()
		return out, nil
	default:
		return nil, fmt.Errorf("unexpected A2A streaming result type: %T", result.Result)
	}
}

// CreateA2AClient creates and configures A2A client with header resolution and injection
func CreateA2AClient(ctx context.Context, k8sClient client.Client, rpcURL string, headers []arkv1prealpha1.Header, namespace, agentName string, a2aRecorder eventing.A2aRecorder) (*a2aclient.A2AClient, error) {
	// Use context deadline if available, otherwise default
	timeout := 5 * time.Minute
	if deadline, ok := ctx.Deadline(); ok {
		timeout = time.Until(deadline)
	}

	var clientOptions []a2aclient.Option
	if len(headers) > 0 {
		resolvedHeaders, err := resolveA2AHeaders(ctx, k8sClient, headers, namespace)
		if err != nil {
			if a2aRecorder != nil {
				a2aRecorder.A2AHeaderResolutionFailed(ctx, fmt.Sprintf("failed to resolve A2A headers: %v", err))
			}
			return nil, err
		}

		httpClient := &http.Client{Timeout: timeout}
		clientOptions = append(clientOptions, a2aclient.WithHTTPClient(httpClient))
		clientOptions = append(clientOptions, a2aclient.WithHTTPReqHandler(&customA2ARequestHandler{
			headers: resolvedHeaders,
		}))
	} else {
		// No headers, but still need to set timeout via client options
		clientOptions = append(clientOptions, a2aclient.WithTimeout(timeout))
	}

	a2aClient, err := a2aclient.NewA2AClient(rpcURL, clientOptions...)
	if err != nil {
		return nil, fmt.Errorf("failed to create A2A client: %w", err)
	}
	return a2aClient, nil
}

// executeA2AAgentMessage sends message to A2A agent and processes response
func executeA2AAgentMessage(ctx context.Context, k8sClient client.Client, a2aClient *a2aclient.A2AClient, userInput protocol.Message, metadata map[string]interface{}, agentName, namespace, queryName, contextID string, obj client.Object, a2aRecorder eventing.A2aRecorder, blocking bool) (*A2AResponse, error) {
	params := buildA2ASendMessageParams(userInput, contextID, metadata, blocking)
	result, err := a2aClient.SendMessage(ctx, params)
	if err != nil {
		if a2aRecorder != nil {
			a2aRecorder.A2AMessageFailed(ctx, fmt.Sprintf("A2A SendMessage failed: %v", err))
		}
		return nil, fmt.Errorf("A2A server call failed: %w", err)
	}

	response, err := extractResponseFromMessageResult(ctx, k8sClient, result, agentName, namespace, queryName, obj)
	if err != nil {
		if a2aRecorder != nil {
			a2aRecorder.A2AResponseParseError(ctx, fmt.Sprintf("Failed to parse A2A response: %v", err))
		}
		return nil, err
	}

	return response, nil
}

// customA2ARequestHandler handles adding custom headers and OTEL tracing to A2A requests
type customA2ARequestHandler struct {
	headers map[string]string
}

// Handle implements the HTTPReqHandler interface
func (h *customA2ARequestHandler) Handle(ctx context.Context, httpClient *http.Client, req *http.Request) (*http.Response, error) {
	// Add custom headers
	for name, value := range h.headers {
		req.Header.Set(name, value)
	}
	if extensionHeader := extractA2AExtensionsHeader(req); extensionHeader != "" {
		req.Header.Set(a2aExtensionsHeader, extensionHeader)
	}

	// Inject OTEL trace context and session headers
	headerMap := make(map[string]string)
	telemetry.InjectOTELHeaders(ctx, headerMap)
	for name, value := range headerMap {
		req.Header.Set(name, value)
	}

	// Perform the request
	return httpClient.Do(req)
}

func extractA2AExtensionsHeader(req *http.Request) string {
	if req == nil {
		return ""
	}
	existingHeader := req.Header.Get(a2aExtensionsHeader)
	if req.Body == nil {
		return existingHeader
	}

	bodyBytes, err := io.ReadAll(req.Body)
	if err != nil {
		return existingHeader
	}
	req.Body = io.NopCloser(bytes.NewReader(bodyBytes))
	req.ContentLength = int64(len(bodyBytes))
	req.GetBody = func() (io.ReadCloser, error) {
		return io.NopCloser(bytes.NewReader(bodyBytes)), nil
	}

	if len(bytes.TrimSpace(bodyBytes)) == 0 {
		return existingHeader
	}

	var payload struct {
		Params struct {
			Message struct {
				Extensions []string `json:"extensions"`
			} `json:"message"`
		} `json:"params"`
	}
	if err := json.Unmarshal(bodyBytes, &payload); err != nil {
		return existingHeader
	}
	if len(payload.Params.Message.Extensions) == 0 {
		return existingHeader
	}
	return mergeA2AExtensions(existingHeader, payload.Params.Message.Extensions)
}

func mergeA2AExtensions(existing string, discovered []string) string {
	unique := make(map[string]struct{})
	for _, entry := range strings.Split(existing, ",") {
		trimmed := strings.TrimSpace(entry)
		if trimmed != "" {
			unique[trimmed] = struct{}{}
		}
	}
	for _, entry := range discovered {
		trimmed := strings.TrimSpace(entry)
		if trimmed != "" {
			unique[trimmed] = struct{}{}
		}
	}
	if len(unique) == 0 {
		return ""
	}

	extensions := make([]string, 0, len(unique))
	for extension := range unique {
		extensions = append(extensions, extension)
	}
	sort.Strings(extensions)
	return strings.Join(extensions, ", ")
}

// extractResponseFromMessageResult extracts response from MessageResult and handles both messages and tasks
func extractResponseFromMessageResult(ctx context.Context, k8sClient client.Client, result *protocol.MessageResult, agentName, namespace, queryName string, obj client.Object) (*A2AResponse, error) {
	log := logf.FromContext(ctx)
	if result == nil {
		return nil, fmt.Errorf("result is nil")
	}

	switch r := result.Result.(type) {
	case *protocol.Message:
		text := extractTextFromParts(r.Parts)
		response := &A2AResponse{
			Content: text,
			Message: r,
		}
		if r.ContextID != nil && *r.ContextID != "" {
			response.ContextID = *r.ContextID
		}
		if r.TaskID != nil && *r.TaskID != "" {
			response.TaskID = *r.TaskID
		}
		return response, nil
	case *protocol.Task:
		text, err := extractTextFromTask(r)
		if err != nil {
			log.Error(err, "failed to extract text from task", "taskId", r.ID, "state", r.Status.State)
			return nil, err
		}

		err = handleA2ATaskResponse(ctx, k8sClient, r, agentName, namespace, queryName, obj)
		if err != nil {
			log.Error(err, "failed to create A2ATask resource", "taskId", r.ID, "agent", agentName)
			return nil, fmt.Errorf("failed to handle A2A task response: %w", err)
		}

		response := &A2AResponse{
			Content:   text,
			ContextID: r.ContextID,
			TaskID:    r.ID,
			Message:   extractLatestAgentMessageFromTask(r),
			Artifacts: r.Artifacts,
		}
		return response, nil
	default:
		log.Error(nil, "unexpected A2A result type", "type", fmt.Sprintf("%T", result.Result), "agent", agentName)
		return nil, fmt.Errorf("unexpected result type: %T", result.Result)
	}
}

//nolint:gocognit // Extracts text from task status message, artifacts, and history; cohesive extraction logic
func extractTextFromTask(task *protocol.Task) (string, error) {
	if task.Status.State == "" {
		return "", fmt.Errorf("task has no status state")
	}

	switch task.Status.State {
	case TaskStateCompleted:
		var text strings.Builder
		for _, msg := range task.History {
			if msg.Role == protocol.MessageRoleAgent && len(msg.Parts) > 0 {
				msgText := extractTextFromParts(msg.Parts)
				if msgText != "" {
					if text.Len() > 0 {
						text.WriteString("\n")
					}
					text.WriteString(msgText)
				}
			}
		}
		if text.Len() > 0 {
			return text.String(), nil
		}

		if task.Status.Message != nil && len(task.Status.Message.Parts) > 0 {
			if statusText := extractTextFromParts(task.Status.Message.Parts); statusText != "" {
				return statusText, nil
			}
		}

		return "", nil

	case TaskStateFailed:
		// Extract error message from status.message
		errorMsg := "task failed"
		if task.Status.Message != nil && len(task.Status.Message.Parts) > 0 {
			errorMsg = extractTextFromParts(task.Status.Message.Parts)
		}
		return "", fmt.Errorf("%s", errorMsg)

	default:
		return "", fmt.Errorf("task in state '%s' (expected %s or %s)", task.Status.State, TaskStateCompleted, TaskStateFailed)
	}
}

func extractLatestAgentMessageFromTask(task *protocol.Task) *protocol.Message {
	if task == nil {
		return nil
	}
	if task.Status.Message != nil && task.Status.Message.Role == protocol.MessageRoleAgent && len(task.Status.Message.Parts) > 0 {
		return task.Status.Message
	}
	for i := len(task.History) - 1; i >= 0; i-- {
		message := task.History[i]
		if message.Role == protocol.MessageRoleAgent && len(message.Parts) > 0 {
			copyMessage := message
			return &copyMessage
		}
	}
	return nil
}

// extractTextFromParts extracts text from message parts in a type-safe way
func extractTextFromParts(parts []protocol.Part) string {
	var text strings.Builder
	for _, part := range parts {
		switch p := part.(type) {
		case protocol.TextPart:
			text.WriteString(p.Text)
		case *protocol.TextPart:
			text.WriteString(p.Text)
		case protocol.DataPart:
			// Data parts carry structured payloads and should not be concatenated into user-facing text.
			continue
		case *protocol.DataPart:
			// Data parts carry structured payloads and should not be concatenated into user-facing text.
			continue
		case protocol.FilePart:
			text.WriteString(extractFilePartText(p.File))
		case *protocol.FilePart:
			text.WriteString(extractFilePartText(p.File))
		}
	}
	return text.String()
}

func extractFilePartText(file interface{}) string {
	switch f := file.(type) {
	case *protocol.FileWithURI:
		return f.URI
	case *protocol.FileWithBytes:
		if f.Name != nil && *f.Name != "" {
			return *f.Name
		}
		return "file-bytes"
	default:
		return ""
	}
}

func convertToA2AHistory(history []protocol.Message) []protocol.Message {
	results := make([]protocol.Message, 0, len(history))
	for _, msg := range history {
		if msg.Role == "" {
			continue
		}
		results = append(results, msg)
	}
	return results
}

// createA2ARequest creates and configures HTTP request for A2A discovery
func createA2ARequest(ctx context.Context, agentCardURL string, headers []arkv1prealpha1.Header, k8sClient client.Client, namespace string) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, agentCardURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Add resolved headers if specified
	if len(headers) > 0 {
		resolvedHeaders, err := resolveA2AHeaders(ctx, k8sClient, headers, namespace)
		if err != nil {
			return nil, err
		}
		for name, value := range resolvedHeaders {
			req.Header.Set(name, value)
		}
	}

	// Inject OTEL headers
	headerMap := make(map[string]string)
	telemetry.InjectOTELHeaders(ctx, headerMap)
	for name, value := range headerMap {
		req.Header.Set(name, value)
	}

	return req, nil
}

// executeA2ARequest executes HTTP request and parses agent card response
func executeA2ARequest(ctx context.Context, req *http.Request, a2aRecorder eventing.A2aRecorder) (*A2AAgentCard, error) {
	httpClient := &http.Client{Timeout: 30 * time.Second}
	resp, err := httpClient.Do(req)
	if err != nil {
		if a2aRecorder != nil {
			a2aRecorder.A2AConnectionFailed(ctx, fmt.Sprintf("failed to connect to A2A server: %v", err))
		}
		return nil, fmt.Errorf("failed to connect to A2A server: %w", err)
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil {
			logf.FromContext(ctx).Error(closeErr, "failed to close response body")
		}
	}()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("A2A server returned status %d", resp.StatusCode)
	}

	var agentCard A2AAgentCard
	if err := json.NewDecoder(resp.Body).Decode(&agentCard); err != nil {
		return nil, fmt.Errorf("failed to parse agent card: %w", err)
	}

	return &agentCard, nil
}

// resolveA2AHeaders resolves header values from ValueSources
func resolveA2AHeaders(ctx context.Context, k8sClient client.Client, headers []arkv1prealpha1.Header, namespace string) (map[string]string, error) {
	resolvedHeaders := make(map[string]string)
	for _, header := range headers {
		headerValue, err := ResolveHeaderValueV1PreAlpha1(ctx, k8sClient, header, namespace)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve header %s: %v", header.Name, err)
		}
		resolvedHeaders[header.Name] = headerValue
	}
	logf.FromContext(ctx).Info("a2a headers resolved", "headers_count", len(resolvedHeaders))
	return resolvedHeaders, nil
}

// handleA2ATaskResponse handles A2A task responses by creating A2ATask resources
func handleA2ATaskResponse(ctx context.Context, k8sClient client.Client, task *protocol.Task, agentName, namespace, queryName string, obj client.Object) error {
	log := logf.FromContext(ctx)

	if queryName == "" {
		return fmt.Errorf("unable to determine A2A Task originating query")
	}

	var a2aServerName string
	if a2aServer, ok := obj.(*arkv1prealpha1.A2AServer); ok {
		a2aServerName = a2aServer.Name
	}

	a2aTask := &arkv1alpha1.A2ATask{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("a2a-task-%s", task.ID),
			Namespace: namespace,
		},
		Spec: arkv1alpha1.A2ATaskSpec{
			TaskID:    task.ID,
			ContextID: task.ContextID,
			QueryRef: arkv1alpha1.QueryRef{
				Name:      queryName,
				Namespace: namespace,
			},
			A2AServerRef: arkv1alpha1.A2AServerRef{
				Name:      a2aServerName,
				Namespace: namespace,
			},
			AgentRef: arkv1alpha1.AgentRef{
				Name:      agentName,
				Namespace: namespace,
			},
		},
		Status: arkv1alpha1.A2ATaskStatus{
			Phase: ConvertA2AStateToPhase(string(task.Status.State)),
		},
	}

	// Populate A2A protocol fields into status
	PopulateA2ATaskStatusFromProtocol(&a2aTask.Status, task)

	// Set start time
	now := metav1.NewTime(time.Now())
	a2aTask.Status.StartTime = &now

	// Create the resource
	if err := k8sClient.Create(ctx, a2aTask); err != nil {
		log.Error(err, "failed to create A2ATask resource", "taskId", task.ID)
		return fmt.Errorf("failed to create A2ATask resource: %w", err)
	}

	return nil
}

func upsertA2ATaskFromTask(ctx context.Context, k8sClient client.Client, task *protocol.Task, agentName, namespace, queryName, a2aServerName string) error {
	if task == nil || queryName == "" || a2aServerName == "" {
		return nil
	}

	taskName := fmt.Sprintf("a2a-task-%s", task.ID)
	existing := &arkv1alpha1.A2ATask{}
	err := k8sClient.Get(ctx, client.ObjectKey{Name: taskName, Namespace: namespace}, existing)
	if err != nil {
		if apierrors.IsNotFound(err) {
			a2aTask := &arkv1alpha1.A2ATask{
				ObjectMeta: metav1.ObjectMeta{
					Name:      taskName,
					Namespace: namespace,
				},
				Spec: arkv1alpha1.A2ATaskSpec{
					TaskID:    task.ID,
					ContextID: task.ContextID,
					QueryRef: arkv1alpha1.QueryRef{
						Name:      queryName,
						Namespace: namespace,
					},
					A2AServerRef: arkv1alpha1.A2AServerRef{
						Name:      a2aServerName,
						Namespace: namespace,
					},
					AgentRef: arkv1alpha1.AgentRef{
						Name:      agentName,
						Namespace: namespace,
					},
				},
				Status: arkv1alpha1.A2ATaskStatus{
					Phase: ConvertA2AStateToPhase(string(task.Status.State)),
				},
			}
			PopulateA2ATaskStatusFromProtocol(&a2aTask.Status, task)
			now := metav1.NewTime(time.Now())
			a2aTask.Status.StartTime = &now
			return k8sClient.Create(ctx, a2aTask)
		}
		return err
	}

	UpdateA2ATaskStatus(&existing.Status, task)
	return k8sClient.Status().Update(ctx, existing)
}

func taskFromStatusUpdate(event *protocol.TaskStatusUpdateEvent) *protocol.Task {
	if event == nil {
		return nil
	}
	return &protocol.Task{
		ID:        event.TaskID,
		ContextID: event.ContextID,
		Kind:      protocol.KindTask,
		Status:    event.Status,
		Metadata:  event.Metadata,
	}
}

func taskFromArtifactUpdate(event *protocol.TaskArtifactUpdateEvent, status *protocol.TaskStatus) *protocol.Task {
	if event == nil {
		return nil
	}
	taskStatus := protocol.TaskStatus{}
	if status != nil {
		taskStatus = *status
	} else {
		taskStatus.State = protocol.TaskStateWorking
	}
	if taskStatus.State == "" {
		taskStatus.State = protocol.TaskStateWorking
	}
	return &protocol.Task{
		ID:        event.TaskID,
		ContextID: event.ContextID,
		Kind:      protocol.KindTask,
		Status:    taskStatus,
		Artifacts: []protocol.Artifact{event.Artifact},
		Metadata:  event.Metadata,
	}
}
