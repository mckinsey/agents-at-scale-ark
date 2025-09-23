package genai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"

	"github.com/openai/openai-go"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
)

// Simple message structure for fallback parsing
type simpleMessage struct {
	Role    string `json:"role"`
	Content string `json:"content,omitempty"`
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

// HTTPMemoryAndStreaming handles both memory operations and streaming for ARK queries
type HTTPMemoryAndStreaming struct {
	client           client.Client
	memoryHttpClient *http.Client // For memory operations (with timeout)
	streamHttpClient *http.Client // For streaming operations (no timeout)
	baseURL          string
	sessionId        string
	queryName        string
	name             string
	namespace        string
	recorder         EventEmitter

	// Persistent streaming connection
	streamWriter io.WriteCloser
	streamMutex  sync.Mutex
}

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

	// Create memory HTTP client with timeout for regular operations
	memoryHttpClient := common.NewHTTPClientWithLogging(ctx)
	if config.Timeout > 0 {
		memoryHttpClient.Timeout = config.Timeout
	}

	// Create streaming HTTP client without timeout for long-lived connections
	streamHttpClient := common.NewHTTPClientWithLogging(ctx)
	// No timeout for streaming connections - they need to stay open indefinitely

	return &HTTPMemoryAndStreaming{
		client:           k8sClient,
		memoryHttpClient: memoryHttpClient,
		streamHttpClient: streamHttpClient,
		baseURL:          strings.TrimSuffix(*memory.Status.LastResolvedAddress, "/"),
		sessionId:        sessionId,
		queryName:        config.QueryName,
		name:             memoryName,
		namespace:        namespace,
		recorder:         recorder,
	}, nil
}

// resolveAndUpdateAddress dynamically resolves the memory address and updates the status if it changed
func (m *HTTPMemoryAndStreaming) resolveAndUpdateAddress(ctx context.Context) error {
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

func (m *HTTPMemoryAndStreaming) AddMessages(ctx context.Context, queryID string, messages []Message) error {
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

	resp, err := m.memoryHttpClient.Do(req)
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

func (m *HTTPMemoryAndStreaming) GetMessages(ctx context.Context) ([]Message, error) {
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

	resp, err := m.memoryHttpClient.Do(req)
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

func (m *HTTPMemoryAndStreaming) NotifyCompletion(ctx context.Context) error {
	// Check if streaming is enabled via annotation
	streamingEnabled, err := m.isStreamingEnabled(ctx)
	if err != nil {
		logf.FromContext(ctx).V(1).Info("Failed to check streaming annotation", "error", err)
		return nil // Don't fail the operation
	}

	if !streamingEnabled {
		logf.FromContext(ctx).V(2).Info("Memory streaming disabled - skipping completion notification",
			"memory", fmt.Sprintf("%s/%s", m.namespace, m.name))
		return nil
	}

	logf.FromContext(ctx).V(1).Info("Memory streaming enabled - sending completion notification",
		"memory", fmt.Sprintf("%s/%s", m.namespace, m.name))

	if err := m.resolveAndUpdateAddress(ctx); err != nil {
		return err
	}

	tracker := NewOperationTracker(m.recorder, ctx, "MemoryNotifyCompletion", m.name, map[string]string{
		"namespace": m.namespace,
		"sessionId": m.sessionId,
	})

	requestURL := fmt.Sprintf("%s"+CompletionEndpoint, m.baseURL, url.QueryEscape(m.queryName))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, nil)
	if err != nil {
		tracker.Fail(fmt.Errorf("failed to create request: %w", err))
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", ContentTypeJSON)
	req.Header.Set("User-Agent", UserAgent)

	resp, err := m.memoryHttpClient.Do(req)
	if err != nil {
		tracker.Fail(fmt.Errorf("HTTP request failed: %w", err))
		return fmt.Errorf("HTTP request failed: %w", err)
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil {
			logf.FromContext(ctx).V(1).Info("Error closing response body", "error", closeErr)
		}
	}()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		tracker.Fail(fmt.Errorf("HTTP %d: completion notification failed", resp.StatusCode))
		return fmt.Errorf("HTTP %d: completion notification failed", resp.StatusCode)
	}

	// Close the streaming connection cleanly after completion notification
	m.closeStreamConnection(ctx)

	tracker.Complete("completion notified")
	return nil
}

func (m *HTTPMemoryAndStreaming) isStreamingEnabled(ctx context.Context) (bool, error) {
	var memory arkv1alpha1.Memory
	key := client.ObjectKey{Name: m.name, Namespace: m.namespace}

	if err := m.client.Get(ctx, key, &memory); err != nil {
		return false, fmt.Errorf("failed to get memory resource %s/%s: %w", m.namespace, m.name, err)
	}

	annotations := memory.GetAnnotations()
	if annotations == nil {
		return false, nil
	}

	enabled := annotations["ark.mckinsey.com/memory-event-stream-enabled"]
	return enabled == TrueString, nil
}

func (m *HTTPMemoryAndStreaming) StreamChunk(ctx context.Context, chunk interface{}) error {
	m.streamMutex.Lock()
	defer m.streamMutex.Unlock()

	// Establish connection on first chunk
	if m.streamWriter == nil {
		if err := m.establishStreamConnection(ctx); err != nil {
			logf.FromContext(ctx).Error(err, "Failed to establish persistent stream connection", "sessionId", m.sessionId)
			return fmt.Errorf("failed to establish stream connection: %w", err)
		}
	}

	// Forward the chunk as-is (already in OpenAI format)
	// The chunk is already an *openai.ChatCompletionChunk which marshals correctly
	jsonData, err := json.Marshal(chunk)
	if err != nil {
		return fmt.Errorf("failed to marshal stream chunk: %w", err)
	}

	// Write JSON + newline to the stream
	if _, err := m.streamWriter.Write(append(jsonData, '\n')); err != nil {
		return fmt.Errorf("failed to write stream chunk: %w", err)
	}

	return nil
}

// establishStreamConnection creates a persistent streaming connection to memory service
func (m *HTTPMemoryAndStreaming) establishStreamConnection(ctx context.Context) error {
	if err := m.resolveAndUpdateAddress(ctx); err != nil {
		return err
	}

	// Create a pipe for streaming data
	pr, pw := io.Pipe()

	requestURL := fmt.Sprintf("%s/stream/%s", m.baseURL, url.QueryEscape(m.queryName))
	// Use context.Background() instead of the query context for the streaming HTTP request.
	// This allows the HTTP POST to complete gracefully when NotifyCompletion is called.
	// The streaming lifecycle is managed by closing the pipe writer in NotifyCompletion,
	// which causes the HTTP request to finish sending all data and complete normally.
	// Using the query context would cause "context canceled" errors when the query completes.
	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, requestURL, pr)
	if err != nil {
		return fmt.Errorf("failed to create stream request: %w", err)
	}

	req.Header.Set("Content-Type", "application/x-ndjson") // Newline-delimited JSON
	req.Header.Set("User-Agent", UserAgent)
	req.Header.Set("Connection", "keep-alive")

	// Start the HTTP request in background goroutine
	go func() {
		defer func() {
			if closeErr := pr.Close(); closeErr != nil {
				logf.FromContext(ctx).V(1).Info("Error closing pipe reader", "error", closeErr)
			}
		}()
		// Use the streaming HTTP client (no timeout) for long-lived connections
		resp, err := m.streamHttpClient.Do(req)
		if err != nil {
			logf.FromContext(ctx).Error(err, "Failed to establish stream connection")
			return
		}
		defer func() {
			if closeErr := resp.Body.Close(); closeErr != nil {
				logf.FromContext(ctx).V(1).Info("Error closing response body", "error", closeErr)
			}
		}()

		// Read and discard response body (memory service will respond when done)
		if _, copyErr := io.Copy(io.Discard, resp.Body); copyErr != nil {
			logf.FromContext(ctx).V(1).Info("Error copying response body", "error", copyErr)
		}
		logf.FromContext(ctx).Info("Stream connection closed", "sessionId", m.sessionId)
	}()

	// Store the write end of the pipe
	m.streamWriter = pw

	logf.FromContext(ctx).Info("Established persistent streaming connection", "sessionId", m.sessionId)
	return nil
}

// closeStreamConnection cleanly closes the streaming connection
// GetStreamingURL returns the streaming endpoint URL for this query
func (m *HTTPMemoryAndStreaming) GetStreamingURL() string {
	return fmt.Sprintf("%s/stream/%s", m.baseURL, url.QueryEscape(m.queryName))
}

func (m *HTTPMemoryAndStreaming) closeStreamConnection(ctx context.Context) {
	m.streamMutex.Lock()
	defer m.streamMutex.Unlock()

	if m.streamWriter != nil {
		logf.FromContext(ctx).Info("Closing streaming connection", "sessionId", m.sessionId)
		if err := m.streamWriter.Close(); err != nil {
			logf.FromContext(ctx).V(1).Info("Error closing stream writer", "error", err, "sessionId", m.sessionId)
		}
		m.streamWriter = nil
	}
}

func (m *HTTPMemoryAndStreaming) Close() error {
	m.streamMutex.Lock()
	defer m.streamMutex.Unlock()

	// Close streaming writer if it exists
	if m.streamWriter != nil {
		_ = m.streamWriter.Close() // Ignore error during cleanup
		m.streamWriter = nil
	}

	// Close both HTTP clients
	if m.memoryHttpClient != nil {
		m.memoryHttpClient.CloseIdleConnections()
	}
	if m.streamHttpClient != nil {
		m.streamHttpClient.CloseIdleConnections()
	}
	return nil
}
