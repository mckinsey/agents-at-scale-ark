/* Copyright 2025. McKinsey & Company */

package genai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sync"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"sigs.k8s.io/yaml"

	"github.com/openai/openai-go"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
)

// StreamMetadata contains ARK-specific metadata for streaming chunks
type StreamMetadata struct {
	Query          string             `json:"query,omitempty"`
	Session        string             `json:"session,omitempty"`
	Target         string             `json:"target,omitempty"`
	Team           string             `json:"team,omitempty"`
	Agent          string             `json:"agent,omitempty"`
	Model          string             `json:"model,omitempty"`
	CompletedQuery *arkv1alpha1.Query `json:"completedQuery,omitempty"`
}

// ChunkWithMetadata wraps an OpenAI chunk with ARK metadata
type ChunkWithMetadata struct {
	*openai.ChatCompletionChunk
	Ark *StreamMetadata `json:"ark,omitempty"`
}

func NewContentChunk(id, model, content string) *openai.ChatCompletionChunk {
	return &openai.ChatCompletionChunk{
		ID:      id,
		Object:  "chat.completion.chunk",
		Created: time.Now().Unix(),
		Model:   model,
		Choices: []openai.ChatCompletionChunkChoice{
			{
				Index: 0,
				Delta: openai.ChatCompletionChunkChoiceDelta{
					Content: content,
				},
			},
		},
	}
}

// StreamingError represents an OpenAI-compatible error format for streaming
type StreamingError struct {
	Error struct {
		Message string `json:"message"`
		Type    string `json:"type"`
		Code    string `json:"code,omitempty"`
	} `json:"error"`
}

// ErrorWithMetadata wraps a streaming error with ARK metadata
type ErrorWithMetadata struct {
	*StreamingError
	Ark *StreamMetadata `json:"ark,omitempty"`
}

// buildMetadata builds StreamMetadata from context
func buildMetadata(ctx context.Context, modelName string) *StreamMetadata {
	metadata := &StreamMetadata{}

	// Get execution metadata from context
	execMeta := GetExecutionMetadata(ctx)
	if target, ok := execMeta["target"].(string); ok {
		metadata.Target = target
	}
	if team, ok := execMeta["team"].(string); ok {
		metadata.Team = team
	}
	if agent, ok := execMeta["agent"].(string); ok {
		metadata.Agent = agent
	}
	if model, ok := execMeta["model"].(string); ok {
		metadata.Model = model
	} else if modelName != "" {
		metadata.Model = modelName
	}

	// Add query and session IDs
	if queryID := getQueryID(ctx); queryID != "" {
		metadata.Query = queryID
	}
	if sessionID := getSessionID(ctx); sessionID != "" {
		metadata.Session = sessionID
	}

	return metadata
}

// WrapErrorWithMetadata wraps a streaming error with ARK metadata
func WrapErrorWithMetadata(ctx context.Context, streamingError *StreamingError, modelName string) interface{} {
	metadata := buildMetadata(ctx, modelName)

	return ErrorWithMetadata{
		StreamingError: streamingError,
		Ark:            metadata,
	}
}

// StreamError streams an error to the event stream if available.
// This is a helper function to avoid code duplication when streaming errors.
func StreamError(ctx context.Context, eventStream EventStreamInterface, err error, errorCode, modelName string) {
	if eventStream == nil {
		return
	}
	errorChunk := StreamingError{}
	errorChunk.Error.Message = err.Error()
	errorChunk.Error.Type = "server_error"
	errorChunk.Error.Code = errorCode
	errorChunkWithMeta := WrapErrorWithMetadata(ctx, &errorChunk, modelName)
	if streamErr := eventStream.StreamChunk(ctx, errorChunkWithMeta); streamErr != nil {
		logf.FromContext(ctx).Error(streamErr, "failed to send error chunk to event stream")
	}
}

// WrapChunkWithMetadata adds ARK metadata to a streaming chunk
// If query is provided, includes complete query object in metadata (for final chunk only)
func WrapChunkWithMetadata(ctx context.Context, chunk *openai.ChatCompletionChunk, modelName string, query *arkv1alpha1.Query) interface{} {
	metadata := buildMetadata(ctx, modelName)

	if query != nil {
		metadata.CompletedQuery = query
	}

	return ChunkWithMetadata{
		ChatCompletionChunk: chunk,
		Ark:                 metadata,
	}
}

// EventStreamInterface defines streaming capabilities for real-time event delivery
type EventStreamInterface interface {
	// StreamChunk sends a chunk of data to the event stream
	StreamChunk(ctx context.Context, chunk interface{}) error

	// NotifyCompletion signals that the stream has completed
	NotifyCompletion(ctx context.Context) error

	// Close closes the stream connection
	Close() error
}

// StreamingConfig represents the resolved streaming configuration
type StreamingConfig struct {
	Enabled    bool
	ServiceRef arkv1alpha1.ServiceReference
}

// GetStreamingConfig loads and validates the streaming configuration from ConfigMap
// Returns nil if no ConfigMap exists (not an error - streaming is not configured)
// Returns error if ConfigMap exists but has invalid structure
func GetStreamingConfig(ctx context.Context, k8sClient client.Client, namespace string) (*StreamingConfig, error) {
	log := logf.FromContext(ctx)

	// Try to get streaming ConfigMap
	cm := &corev1.ConfigMap{}
	err := k8sClient.Get(ctx, client.ObjectKey{
		Name:      "ark-config-streaming",
		Namespace: namespace,
	}, cm)
	if err != nil {
		if errors.IsNotFound(err) {
			// No ConfigMap = no streaming (not an error)
			return nil, nil
		}
		// Real error accessing ConfigMap
		return nil, fmt.Errorf("failed to get streaming ConfigMap: %w", err)
	}

	// Check if enabled
	enabledStr, ok := cm.Data["enabled"]
	if !ok {
		return nil, fmt.Errorf("streaming ConfigMap missing 'enabled' field")
	}

	config := &StreamingConfig{
		Enabled: enabledStr == TrueString,
	}

	// If not enabled, return early
	if !config.Enabled {
		log.V(1).Info("streaming is disabled in ConfigMap", "namespace", namespace)
		return config, nil
	}

	// Parse serviceRef
	serviceRefYAML, ok := cm.Data["serviceRef"]
	if !ok {
		return nil, fmt.Errorf("streaming ConfigMap missing 'serviceRef' field")
	}

	if err := yaml.Unmarshal([]byte(serviceRefYAML), &config.ServiceRef); err != nil {
		return nil, fmt.Errorf("failed to parse serviceRef: %w", err)
	}

	// Validate ServiceRef has at least a name
	if config.ServiceRef.Name == "" {
		return nil, fmt.Errorf("serviceRef must have a name")
	}

	return config, nil
}

// NewEventStreamForQuery creates an EventStreamInterface if streaming is configured and enabled
// Returns (nil, nil) if streaming is not configured or disabled
// Returns (nil, error) if configuration is invalid or service cannot be resolved
func NewEventStreamForQuery(ctx context.Context, k8sClient client.Client, namespace, sessionId, queryName string) (EventStreamInterface, error) {
	// Get streaming configuration
	config, err := GetStreamingConfig(ctx, k8sClient, namespace)
	if err != nil {
		return nil, fmt.Errorf("failed to load streaming configuration: %w", err)
	}

	// No config or not enabled - not an error
	if config == nil || !config.Enabled {
		return nil, nil
	}

	// Resolve service reference to URL
	baseURL, err := common.ResolveServiceReference(ctx, k8sClient, &config.ServiceRef, namespace)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve streaming service %s: %w", config.ServiceRef.Name, err)
	}

	// Create HTTP event stream client
	return &HTTPEventStream{
		baseURL:   baseURL,
		sessionId: sessionId,
		queryName: queryName,
		client:    common.NewHTTPClientWithoutTracing(),
	}, nil
}

// HTTPEventStream implements EventStreamInterface for HTTP-based streaming
type HTTPEventStream struct {
	baseURL   string
	sessionId string
	queryName string
	client    *http.Client

	// For persistent streaming connection
	streamWriter io.WriteCloser
	streamMutex  sync.Mutex
}

// StreamChunk sends a chunk to the event stream
func (h *HTTPEventStream) StreamChunk(ctx context.Context, chunk interface{}) error {
	h.streamMutex.Lock()
	defer h.streamMutex.Unlock()

	// If we don't have an active stream, start one
	if h.streamWriter == nil {
		if err := h.startStream(ctx); err != nil {
			return fmt.Errorf("failed to start stream: %w", err)
		}
	}

	// Write the chunk to the stream
	data, err := json.Marshal(chunk)
	if err != nil {
		return fmt.Errorf("failed to marshal chunk: %w", err)
	}

	// Write with newline delimiter for streaming
	if _, err := h.streamWriter.Write(append(data, '\n')); err != nil {
		// Stream broken, clear it
		_ = h.streamWriter.Close() // Ignore error - we're already in error state
		h.streamWriter = nil
		return fmt.Errorf("failed to write chunk to stream: %w", err)
	}

	return nil
}

// startStream initializes a persistent streaming connection
func (h *HTTPEventStream) startStream(ctx context.Context) error {
	log := logf.FromContext(ctx)

	// Create a pipe for streaming
	pipeReader, pipeWriter := io.Pipe()
	h.streamWriter = pipeWriter

	// Construct the streaming URL with proper escaping
	streamURL := fmt.Sprintf("%s/stream/%s", h.baseURL, url.QueryEscape(h.queryName))

	// CRITICAL: Use context.Background() instead of the query context for the streaming HTTP request.
	// This allows the HTTP POST to complete gracefully when NotifyCompletion is called.
	// The streaming lifecycle is managed by closing the pipe writer in NotifyCompletion,
	// which causes the HTTP request to finish sending all data and complete normally.
	// Using the query context would cause "context canceled" errors when the query completes.
	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, streamURL, pipeReader)
	if err != nil {
		return fmt.Errorf("failed to create streaming request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-ndjson")
	req.Header.Set("Transfer-Encoding", "chunked")

	// Start the request in a goroutine
	go func() {
		resp, err := h.client.Do(req)
		if err != nil {
			log.Error(err, "streaming request failed", "url", streamURL)
			if closeErr := pipeReader.Close(); closeErr != nil {
				log.Error(closeErr, "failed to close pipe reader after request failure")
			}
			return
		}
		defer func() {
			_ = resp.Body.Close() // Standard defer pattern - error rarely meaningful
		}()

		if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted {
			log.Error(nil, "streaming service returned error", "status", resp.StatusCode, "url", streamURL)
			if closeErr := pipeReader.Close(); closeErr != nil {
				log.Error(closeErr, "failed to close pipe reader after bad status")
			}
		}

		// Read response to complete the HTTP request/response cycle
		// (discarding the data as we don't need the response content)
		if _, err := io.Copy(io.Discard, resp.Body); err != nil {
			log.Error(err, "failed to drain response body")
		}
	}()

	return nil
}

// NotifyCompletion signals that the stream has completed
func (h *HTTPEventStream) NotifyCompletion(ctx context.Context) error {
	h.streamMutex.Lock()
	defer h.streamMutex.Unlock()

	// Close the streaming connection if open
	if h.streamWriter != nil {
		if err := h.streamWriter.Close(); err != nil {
			logf.FromContext(ctx).Error(err, "failed to close stream writer on completion")
		}
		h.streamWriter = nil
	}

	// Send completion signal
	completeURL := fmt.Sprintf("%s/stream/%s/complete", h.baseURL, url.QueryEscape(h.queryName))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, completeURL, bytes.NewReader([]byte("{}")))
	if err != nil {
		return fmt.Errorf("failed to create completion request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	// Use a client with timeout for completion
	completeClient := &http.Client{Timeout: 10 * time.Second}
	resp, err := completeClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send completion: %w", err)
	}
	defer func() {
		_ = resp.Body.Close() // Standard defer pattern - error rarely meaningful
	}()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted {
		return fmt.Errorf("streaming service returned status %d on completion", resp.StatusCode)
	}

	return nil
}

// Close closes any persistent connections
func (h *HTTPEventStream) Close() error {
	h.streamMutex.Lock()
	defer h.streamMutex.Unlock()

	if h.streamWriter != nil {
		err := h.streamWriter.Close()
		h.streamWriter = nil
		return err
	}
	return nil
}
