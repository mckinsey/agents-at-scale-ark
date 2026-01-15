package genai

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/openai/openai-go"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/eventing"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
)

const (
	DefaultTimeoutSeconds = 30 // Default timeout in seconds
	ContentTypeJSON       = "application/json"
	MessagesEndpoint      = "/messages"
	ConversationsEndpoint = "/conversations"
	CompletionEndpoint    = "/stream/%s/complete"
	MaxRetries            = 3
	RetryDelay            = 100 * time.Millisecond
	UserAgent             = "ark-memory-client/1.0"
)

// getMemoryTimeout reads ARK_MEMORY_HTTP_TIMEOUT_SECONDS env var or returns default
func getMemoryTimeout() time.Duration {
	if timeoutStr := os.Getenv("ARK_MEMORY_HTTP_TIMEOUT_SECONDS"); timeoutStr != "" {
		if timeoutSec, err := strconv.Atoi(timeoutStr); err == nil && timeoutSec > 0 {
			logf.Log.V(1).Info("Using custom memory HTTP timeout", "seconds", timeoutSec)
			return time.Duration(timeoutSec) * time.Second
		}
	}
	return DefaultTimeoutSeconds * time.Second
}

type MemoryInterface interface {
	AddMessages(ctx context.Context, queryID string, messages []Message) error
	GetMessages(ctx context.Context) ([]Message, error)
	Close() error
}

type Config struct {
	Timeout        time.Duration
	MaxRetries     int
	RetryDelay     time.Duration
	ConversationId string
	QueryName      string
}

type MessagesRequest struct {
	ConversationID string                                   `json:"conversation_id,omitempty"`
	QueryID        string                                   `json:"query_id"`
	Messages       []openai.ChatCompletionMessageParamUnion `json:"messages"`
}

type MessageRecord struct {
	ID             int64           `json:"id"`
	ConversationID string          `json:"conversation_id"`
	QueryID        string          `json:"query_id"`
	Message        json.RawMessage `json:"message"`
	CreatedAt      string          `json:"created_at"`
}

type MessagesResponse struct {
	Messages []MessageRecord `json:"messages"`
	Total    int             `json:"total"`
	Limit    int             `json:"limit"`
	Offset   int             `json:"offset"`
}

func DefaultConfig() Config {
	return Config{
		Timeout:    getMemoryTimeout(),
		MaxRetries: MaxRetries,
		RetryDelay: RetryDelay,
	}
}

func NewMemory(ctx context.Context, k8sClient client.Client, memoryName, namespace string, memoryRecorder eventing.MemoryRecorder) (MemoryInterface, error) {
	return NewMemoryWithConfig(ctx, k8sClient, memoryName, namespace, DefaultConfig(), memoryRecorder)
}

func NewMemoryWithConfig(ctx context.Context, k8sClient client.Client, memoryName, namespace string, config Config, memoryRecorder eventing.MemoryRecorder) (MemoryInterface, error) {
	return NewHTTPMemory(ctx, k8sClient, memoryName, namespace, config, memoryRecorder)
}

func NewMemoryForQuery(ctx context.Context, k8sClient client.Client, memoryRef *arkv1alpha1.MemoryRef, namespace, conversationId, queryName string, memoryRecorder eventing.MemoryRecorder) (MemoryInterface, error) {
	config := DefaultConfig()
	config.ConversationId = conversationId
	config.QueryName = queryName

	var memoryName, memoryNamespace string

	if memoryRef == nil {
		// Try to load "default" memory from the same namespace
		_, err := getMemoryResource(ctx, k8sClient, "default", namespace)
		if err != nil {
			// If default memory doesn't exist, use noop memory
			return NewNoopMemory(), nil
		}
		memoryName, memoryNamespace = "default", namespace //nolint:goconst // "default" here is memory name, not model
	} else {
		memoryName = memoryRef.Name
		memoryNamespace = resolveNamespace(memoryRef.Namespace, namespace)
	}

	memory, err := NewMemoryWithConfig(ctx, k8sClient, memoryName, memoryNamespace, config, memoryRecorder)
	if err != nil {
		return nil, err
	}

	return memory, nil
}

func getMemoryResource(ctx context.Context, k8sClient client.Client, name, namespace string) (*arkv1alpha1.Memory, error) {
	var memory arkv1alpha1.Memory
	key := client.ObjectKey{Name: name, Namespace: namespace}

	if err := k8sClient.Get(ctx, key, &memory); err != nil {
		if client.IgnoreNotFound(err) == nil {
			return nil, fmt.Errorf("memory not found: %s/%s", namespace, name)
		}
		return nil, fmt.Errorf("failed to get memory resource %s/%s: %w", namespace, name, err)
	}

	return &memory, nil
}

func resolveNamespace(refNamespace, defaultNamespace string) string {
	if refNamespace != "" {
		return refNamespace
	}
	return defaultNamespace
}
