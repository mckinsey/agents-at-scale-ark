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
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
)

// HTTPMemory handles memory operations for ARK queries
type HTTPMemory struct {
	client     client.Client
	httpClient *http.Client
	baseURL    string
	sessionId  string
	name       string
	namespace  string
	recorder   EventEmitter
}

// NewHTTPMemory creates a new HTTP-based memory implementation
func NewHTTPMemory(ctx context.Context, k8sClient client.Client, memoryName, namespace string, recorder EventEmitter, config Config) (MemoryInterface, error) {
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

	sessionId := config.SessionId
	if sessionId == "" {
		sessionId = string(memory.UID)
	}

	// Create HTTP client with timeout for memory operations
	httpClient := common.NewHTTPClientWithLogging(ctx)
	if config.Timeout > 0 {
		httpClient.Timeout = config.Timeout
	}

	return &HTTPMemory{
		client:     k8sClient,
		httpClient: httpClient,
		baseURL:    strings.TrimSuffix(*memory.Status.LastResolvedAddress, "/"),
		sessionId:  sessionId,
		name:       memoryName,
		namespace:  namespace,
		recorder:   recorder,
	}, nil
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
	return nil
}

// AddMessages stores messages to the memory backend
func (m *HTTPMemory) AddMessages(ctx context.Context, queryID string, messages []Message) error {
	if len(messages) == 0 {
		return nil
	}

	// Resolve address dynamically
	if err := m.resolveAndUpdateAddress(ctx); err != nil {
		return err
	}

	tracker := NewOperationTracker(m.recorder, ctx, "MemoryAddMessages", m.name, map[string]string{
		"namespace": m.namespace,
		"sessionId": m.sessionId,
		"queryId":   queryID,
		"messages":  fmt.Sprintf("%d", len(messages)),
	})

	// Convert messages to the request format
	openaiMessages := make([]openai.ChatCompletionMessageParamUnion, len(messages))
	for i, msg := range messages {
		openaiMessages[i] = openai.ChatCompletionMessageParamUnion(msg)
	}

	reqBody, err := json.Marshal(MessagesRequest{
		SessionID: m.sessionId,
		QueryID:   queryID,
		Messages:  openaiMessages,
	})
	if err != nil {
		tracker.Fail(fmt.Errorf("failed to serialize messages: %w", err))
		return fmt.Errorf("failed to serialize messages: %w", err)
	}

	requestURL := fmt.Sprintf("%s%s", m.baseURL, MessagesEndpoint)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, bytes.NewReader(reqBody))
	if err != nil {
		tracker.Fail(fmt.Errorf("failed to create request: %w", err))
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", ContentTypeJSON)
	req.Header.Set("User-Agent", UserAgent)

	resp, err := m.httpClient.Do(req)
	if err != nil {
		tracker.Fail(fmt.Errorf("HTTP request failed: %w", err))
		return fmt.Errorf("HTTP request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		err := fmt.Errorf("HTTP status %d", resp.StatusCode)
		tracker.Fail(err)
		return err
	}

	tracker.Complete("messages added")
	return nil
}

// GetMessages retrieves messages from the memory backend
func (m *HTTPMemory) GetMessages(ctx context.Context) ([]Message, error) {
	// Resolve address dynamically
	if err := m.resolveAndUpdateAddress(ctx); err != nil {
		return nil, err
	}

	tracker := NewOperationTracker(m.recorder, ctx, "MemoryGetMessages", m.name, map[string]string{
		"namespace": m.namespace,
		"sessionId": m.sessionId,
	})

	requestURL := fmt.Sprintf("%s%s?session_id=%s", m.baseURL, MessagesEndpoint, url.QueryEscape(m.sessionId))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		tracker.Fail(fmt.Errorf("failed to create request: %w", err))
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Accept", ContentTypeJSON)
	req.Header.Set("User-Agent", UserAgent)

	resp, err := m.httpClient.Do(req)
	if err != nil {
		tracker.Fail(fmt.Errorf("HTTP request failed: %w", err))
		return nil, fmt.Errorf("HTTP request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		err := fmt.Errorf("HTTP status %d", resp.StatusCode)
		tracker.Fail(err)
		return nil, err
	}

	var response MessagesResponse
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		tracker.Fail(fmt.Errorf("failed to decode response: %w", err))
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	messages := make([]Message, 0, len(response.Messages))
	for i, record := range response.Messages {
		openaiMessage, err := unmarshalMessageRobust(record.Message)
		if err != nil {
			err := fmt.Errorf("failed to unmarshal message at index %d: %w", i, err)
			tracker.Fail(err)
			return nil, err
		}
		messages = append(messages, Message(openaiMessage))
	}

	// Update metadata with message count
	tracker.metadata["messages"] = fmt.Sprintf("%d", len(messages))
	tracker.Complete("retrieved")
	return messages, nil
}

// Close closes the HTTP client connections
func (m *HTTPMemory) Close() error {
	if m.httpClient != nil {
		m.httpClient.CloseIdleConnections()
	}
	return nil
}

// unmarshalMessageRobust tries discriminated union first, then falls back to simple role/content extraction
func unmarshalMessageRobust(rawJSON json.RawMessage) (openai.ChatCompletionMessageParamUnion, error) {
	// Step 1: Try discriminated union first (the normal case)
	var openaiMessage openai.ChatCompletionMessageParamUnion
	if err := json.Unmarshal(rawJSON, &openaiMessage); err == nil {
		return openaiMessage, nil
	}

	// Step 2: Fallback - try to extract role/content from simple format
	var simple simpleMessage
	if err := json.Unmarshal(rawJSON, &simple); err != nil {
		return openai.ChatCompletionMessageParamUnion{}, fmt.Errorf("malformed JSON: %v", err)
	}

	// Step 3: Validate role is present (any role is acceptable for future compatibility)
	if simple.Role == "" {
		return openai.ChatCompletionMessageParamUnion{}, fmt.Errorf("missing required 'role' field")
	}

	// Step 4: Convert simple format to proper OpenAI message based on known roles
	// For unknown roles, try user message as fallback (most permissive)
	switch simple.Role {
	case RoleUser:
		return openai.UserMessage(simple.Content), nil
	case RoleAssistant:
		return openai.AssistantMessage(simple.Content), nil
	case RoleSystem:
		return openai.SystemMessage(simple.Content), nil
	default:
		// Future-proof: accept any role by treating as user message
		// The OpenAI SDK will handle validation of the actual role
		return openai.UserMessage(simple.Content), nil
	}
}

// Simple message structure for fallback parsing
type simpleMessage struct {
	Role    string `json:"role"`
	Content string `json:"content,omitempty"`
}
