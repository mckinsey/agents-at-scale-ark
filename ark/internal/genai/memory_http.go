package genai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/openai/openai-go"
	"mckinsey.com/ark/internal/common"
	"mckinsey.com/ark/internal/eventing"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

// HTTPMemory handles memory operations for ARK queries
type HTTPMemory struct {
	client           client.Client
	httpClient       *http.Client
	baseURL          string
	conversationId   string
	name             string
	namespace        string
	headers          map[string]string
	eventingRecorder eventing.MemoryRecorder
}

// NewHTTPMemory creates a new HTTP-based memory implementation
func NewHTTPMemory(ctx context.Context, k8sClient client.Client, memoryName, namespace string, config Config, memoryRecorder eventing.MemoryRecorder) (MemoryInterface, error) {
	if k8sClient == nil || memoryName == "" || namespace == "" {
		return nil, fmt.Errorf("invalid parameters")
	}

	memory, err := getMemoryResource(ctx, k8sClient, memoryName, namespace)
	if err != nil {
		return nil, err
	}

	// Use the lastResolvedAddress as our initial baseline
	if memory.Status.LastResolvedAddress == nil || *memory.Status.LastResolvedAddress == "" {
		return nil, fmt.Errorf("memory has no lastResolvedAddress in status")
	}

	// Create HTTP client with timeout for memory operations
	httpClient := common.NewHTTPClientWithLogging(ctx)
	if config.Timeout > 0 {
		httpClient.Timeout = config.Timeout
	}

	// Resolve headers on-demand (query context is extracted internally if needed for queryParameterRef)
	headers, err := ResolveHeaders(ctx, k8sClient, memory.Spec.Headers, namespace)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve headers: %w", err)
	}

	baseURL := strings.TrimSuffix(*memory.Status.LastResolvedAddress, "/")

	// Create conversation or use provided ID
	conversationId, err := createConversation(ctx, httpClient, baseURL, config.ConversationId)
	if err != nil {
		return nil, fmt.Errorf("failed to create conversation: %w", err)
	}

	return &HTTPMemory{
		client:           k8sClient,
		httpClient:       httpClient,
		baseURL:          baseURL,
		conversationId:   conversationId,
		name:             memoryName,
		namespace:        namespace,
		headers:          headers,
		eventingRecorder: memoryRecorder,
	}, nil
}

// createConversation calls broker to create a new conversation and get its ID.
// If conversationID is already provided (non-empty), it returns that ID without making an HTTP call.
func createConversation(ctx context.Context, httpClient *http.Client, baseURL, conversationID string) (string, error) {
	if conversationID != "" {
		return conversationID, nil
	}

	type createResponse struct {
		ConversationID string `json:"conversation_id"`
	}

	requestURL := fmt.Sprintf("%s/conversations", baseURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", ContentTypeJSON)
	req.Header.Set("User-Agent", UserAgent)

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("HTTP request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("HTTP status %d", resp.StatusCode)
	}

	var response createResponse
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return "", fmt.Errorf("failed to decode response: %w", err)
	}

	return response.ConversationID, nil
}

// resolveAndUpdateAddress dynamically resolves the memory address and updates the status if it changed
func (m *HTTPMemory) resolveAndUpdateAddress(ctx context.Context) error {
	memory, err := getMemoryResource(ctx, m.client, m.name, m.namespace)
	if err != nil {
		return fmt.Errorf("failed to get memory resource: %w", err)
	}

	// Resolve the address using ValueSourceResolver
	resolver := common.NewValueSourceResolver(m.client)
	resolvedAddress, err := resolver.ResolveValueSource(ctx, memory.Spec.Address, m.namespace)
	if err != nil {
		return fmt.Errorf("failed to resolve memory address: %w", err)
	}

	// Check if address changed from current baseURL
	newBaseURL := strings.TrimSuffix(resolvedAddress, "/")
	if m.baseURL != newBaseURL {
		// Update the Memory status with new address
		memory.Status.LastResolvedAddress = &resolvedAddress
		memory.Status.Message = fmt.Sprintf("Address dynamically resolved to: %s", resolvedAddress)

		// Update the status in Kubernetes
		if err := m.client.Status().Update(ctx, memory); err != nil {
			// Log error but don't fail the request
			logCtx := logf.FromContext(ctx)
			logCtx.Error(err, "failed to update Memory status with new address",
				"memory", m.name, "namespace", m.namespace, "newAddress", resolvedAddress)
		}
	}

	// Update the baseURL
	m.baseURL = strings.TrimSuffix(resolvedAddress, "/")

	// Resolve headers on-demand (query context is extracted internally if needed for queryParameterRef)
	headers, err := ResolveHeaders(ctx, m.client, memory.Spec.Headers, m.namespace)
	if err != nil {
		return fmt.Errorf("failed to resolve headers: %w", err)
	}
	m.headers = headers

	return nil
}

// AddMessages stores messages to the memory backend in OpenAI format.
func (m *HTTPMemory) AddMessages(ctx context.Context, queryID string, messages []Message) error {
	if len(messages) == 0 {
		return nil
	}

	ctx = m.eventingRecorder.Start(ctx, "MemoryAddMessages", "Adding messages to memory", nil)

	// Resolve address dynamically
	if err := m.resolveAndUpdateAddress(ctx); err != nil {
		operationData := map[string]string{"result": fmt.Sprintf("Failed to resolve memory address: %v", err)}
		m.eventingRecorder.Fail(ctx, "MemoryAddMessages", operationData["result"], err, operationData)
		return err
	}

	var reqBody []byte
	var err error
	reqBody, err = json.Marshal(struct {
		ConversationID string                                   `json:"conversation_id,omitempty"`
		QueryID        string                                   `json:"query_id"`
		Messages       []openai.ChatCompletionMessageParamUnion `json:"messages"`
	}{
		ConversationID: m.conversationId,
		QueryID:        queryID,
		Messages:       messages,
	})
	if err != nil {
		operationData := map[string]string{"result": fmt.Sprintf("Failed to serialize messages: %v", err)}
		m.eventingRecorder.Fail(ctx, "MemoryAddMessages", operationData["result"], err, operationData)
		return fmt.Errorf("failed to serialize messages: %w", err)
	}

	requestURL := fmt.Sprintf("%s%s", m.baseURL, MessagesEndpoint)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, bytes.NewReader(reqBody))
	if err != nil {
		operationData := map[string]string{"result": fmt.Sprintf("Failed to create request: %v", err)}
		m.eventingRecorder.Fail(ctx, "MemoryAddMessages", operationData["result"], err, operationData)
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", ContentTypeJSON)
	req.Header.Set("User-Agent", UserAgent)

	// Apply resolved headers
	for name, value := range m.headers {
		req.Header.Set(name, value)
	}

	resp, err := m.httpClient.Do(req)
	if err != nil {
		operationData := map[string]string{"result": fmt.Sprintf("HTTP request failed: %v", err)}
		m.eventingRecorder.Fail(ctx, "MemoryAddMessages", operationData["result"], err, operationData)
		return fmt.Errorf("HTTP request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		err := fmt.Errorf("HTTP status %d", resp.StatusCode)
		operationData := map[string]string{"result": err.Error()}
		m.eventingRecorder.Fail(ctx, "MemoryAddMessages", operationData["result"], err, operationData)
		return err
	}

	operationData := map[string]string{
		"messages":       fmt.Sprintf("%d", len(messages)),
		"conversationId": m.conversationId,
		"result":         "Memory add messages completed successfully",
	}
	m.eventingRecorder.Complete(ctx, "MemoryAddMessages", operationData["result"], operationData)
	return nil
}

// GetMessages retrieves messages from the memory backend as OpenAI types.
func (m *HTTPMemory) GetMessages(ctx context.Context) ([]Message, error) {
	records, err := m.fetchMessageRecords(ctx)
	if err != nil {
		return nil, err
	}

	messages := make([]Message, 0, len(records))
	for i, record := range records {
		a2aMessage, err := unmarshalMessageRobust(record.Message)
		if err != nil {
			return nil, fmt.Errorf("failed to unmarshal message at index %d: %w", i, err)
		}
		openaiMessage, convErr := A2AToOpenAIMessage(a2aMessage)
		if convErr != nil {
			return nil, fmt.Errorf("failed to convert message at index %d: %w", i, convErr)
		}
		messages = append(messages, openaiMessage)
	}
	return messages, nil
}

func (m *HTTPMemory) AddA2AMessages(ctx context.Context, queryID string, messages []protocol.Message) error {
	if len(messages) == 0 {
		return nil
	}

	ctx = m.eventingRecorder.Start(ctx, "MemoryAddMessages", "Adding messages to memory", nil)

	if err := m.resolveAndUpdateAddress(ctx); err != nil {
		operationData := map[string]string{"result": fmt.Sprintf("Failed to resolve memory address: %v", err)}
		m.eventingRecorder.Fail(ctx, "MemoryAddMessages", operationData["result"], err, operationData)
		return err
	}

	reqBody, err := json.Marshal(struct {
		ConversationID string             `json:"conversation_id,omitempty"`
		QueryID        string             `json:"query_id"`
		Messages       []protocol.Message `json:"messages"`
	}{
		ConversationID: m.conversationId,
		QueryID:        queryID,
		Messages:       messages,
	})
	if err != nil {
		operationData := map[string]string{"result": fmt.Sprintf("Failed to serialize messages: %v", err)}
		m.eventingRecorder.Fail(ctx, "MemoryAddMessages", operationData["result"], err, operationData)
		return fmt.Errorf("failed to serialize messages: %w", err)
	}

	requestURL := fmt.Sprintf("%s%s", m.baseURL, MessagesEndpoint)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, bytes.NewReader(reqBody))
	if err != nil {
		operationData := map[string]string{"result": fmt.Sprintf("Failed to create request: %v", err)}
		m.eventingRecorder.Fail(ctx, "MemoryAddMessages", operationData["result"], err, operationData)
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", ContentTypeJSON)
	req.Header.Set("User-Agent", UserAgent)

	for name, value := range m.headers {
		req.Header.Set(name, value)
	}

	resp, err := m.httpClient.Do(req)
	if err != nil {
		operationData := map[string]string{"result": fmt.Sprintf("HTTP request failed: %v", err)}
		m.eventingRecorder.Fail(ctx, "MemoryAddMessages", operationData["result"], err, operationData)
		return fmt.Errorf("HTTP request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		err := fmt.Errorf("HTTP status %d", resp.StatusCode)
		operationData := map[string]string{"result": err.Error()}
		m.eventingRecorder.Fail(ctx, "MemoryAddMessages", operationData["result"], err, operationData)
		return err
	}

	operationData := map[string]string{
		"messages":       fmt.Sprintf("%d", len(messages)),
		"conversationId": m.conversationId,
		"result":         "Memory add messages completed successfully",
	}
	m.eventingRecorder.Complete(ctx, "MemoryAddMessages", operationData["result"], operationData)
	return nil
}

func (m *HTTPMemory) GetA2AMessages(ctx context.Context) ([]protocol.Message, error) {
	records, err := m.fetchMessageRecords(ctx)
	if err != nil {
		return nil, err
	}

	messages := make([]protocol.Message, 0, len(records))
	for i, record := range records {
		a2aMessage, err := unmarshalMessageRobust(record.Message)
		if err != nil {
			return nil, fmt.Errorf("failed to unmarshal message at index %d: %w", i, err)
		}
		messages = append(messages, a2aMessage)
	}
	return messages, nil
}

func (m *HTTPMemory) fetchMessageRecords(ctx context.Context) ([]MessageRecord, error) {
	ctx = m.eventingRecorder.Start(ctx, "MemoryGetMessages", "Getting messages from memory", nil)

	if err := m.resolveAndUpdateAddress(ctx); err != nil {
		operationData := map[string]string{"result": fmt.Sprintf("Failed to resolve memory address: %v", err)}
		m.eventingRecorder.Fail(ctx, "MemoryGetMessages", operationData["result"], err, operationData)
		return nil, err
	}

	requestURL := fmt.Sprintf("%s%s?conversation_id=%s", m.baseURL, MessagesEndpoint, url.QueryEscape(m.conversationId))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		operationData := map[string]string{"result": fmt.Sprintf("Failed to create request: %v", err)}
		m.eventingRecorder.Fail(ctx, "MemoryGetMessages", operationData["result"], err, operationData)
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Accept", ContentTypeJSON)
	req.Header.Set("User-Agent", UserAgent)

	for name, value := range m.headers {
		req.Header.Set(name, value)
	}

	resp, err := m.httpClient.Do(req)
	if err != nil {
		operationData := map[string]string{"result": fmt.Sprintf("HTTP request failed: %v", err)}
		m.eventingRecorder.Fail(ctx, "MemoryGetMessages", operationData["result"], err, operationData)
		return nil, fmt.Errorf("HTTP request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		err := fmt.Errorf("HTTP status %d", resp.StatusCode)
		operationData := map[string]string{"result": err.Error()}
		m.eventingRecorder.Fail(ctx, "MemoryGetMessages", operationData["result"], err, operationData)
		return nil, err
	}

	var response MessagesResponse
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		operationData := map[string]string{"result": fmt.Sprintf("Failed to decode response: %v", err)}
		m.eventingRecorder.Fail(ctx, "MemoryGetMessages", operationData["result"], err, operationData)
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	operationData := map[string]string{
		"messages": fmt.Sprintf("%d", len(response.Items)),
		"result":   "Memory get messages completed successfully",
	}
	m.eventingRecorder.Complete(ctx, "MemoryGetMessages", operationData["result"], operationData)
	return response.Items, nil
}

// GetConversationID returns the current conversation ID
func (m *HTTPMemory) GetConversationID() string {
	return m.conversationId
}

// GetBaseURL returns the memory service base URL for trace routing
func (m *HTTPMemory) GetBaseURL() string {
	return m.baseURL
}

// GetName returns the memory resource name
func (m *HTTPMemory) GetName() string {
	return m.name
}

// Close closes the HTTP client connections
func (m *HTTPMemory) Close() error {
	if m.httpClient != nil {
		m.httpClient.CloseIdleConnections()
	}
	return nil
}

// unmarshalMessageRobust prefers native A2A payloads, then OpenAI payloads, then simple role/content fallback.
func unmarshalMessageRobust(rawJSON json.RawMessage) (protocol.Message, error) {
	if len(rawJSON) == 0 {
		return protocol.Message{}, fmt.Errorf("empty message payload")
	}
	trimmed := strings.TrimSpace(string(rawJSON))
	if trimmed == "" || trimmed == "null" {
		return protocol.Message{}, fmt.Errorf("empty message payload")
	}
	var message protocol.Message
	if err := json.Unmarshal(rawJSON, &message); err == nil && message.Role != "" && len(message.Parts) > 0 {
		return message, nil
	}

	var openAIMessage Message
	if err := json.Unmarshal(rawJSON, &openAIMessage); err == nil {
		converted, convErr := OpenAIToA2AMessage(openAIMessage)
		if convErr == nil && converted.Role != "" && len(converted.Parts) > 0 {
			return converted, nil
		}
	}

	var simple simpleMessage
	if err := json.Unmarshal(rawJSON, &simple); err != nil {
		return protocol.Message{}, fmt.Errorf("malformed JSON: %v", err)
	}

	if simple.Role == "" {
		return protocol.Message{}, fmt.Errorf("missing required 'role' field")
	}

	role := protocol.MessageRoleAgent
	switch simple.Role {
	case RoleUser:
		role = protocol.MessageRoleUser
	case RoleAssistant, RoleSystem, RoleTool:
		role = protocol.MessageRoleAgent
	}

	message = protocol.NewMessage(role, []protocol.Part{
		protocol.NewTextPart(simple.Content),
	})
	switch simple.Role {
	case RoleUser:
		return message, nil
	case RoleAssistant:
		return message, nil
	case RoleSystem:
		message.Metadata = map[string]interface{}{
			MetadataRoleKey: RoleSystem,
		}
		return message, nil
	case RoleTool:
		message.Metadata = map[string]interface{}{
			MetadataRoleKey: RoleTool,
		}
		return message, nil
	default:
		return message, nil
	}
}

// Simple message structure for fallback parsing
type simpleMessage struct {
	Role    string `json:"role"`
	Content string `json:"content,omitempty"`
}
