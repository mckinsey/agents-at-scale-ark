package genai

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/openai/openai-go"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"sigs.k8s.io/controller-runtime/pkg/client"
)

const (
	DefaultTimeout   = 30 * time.Second
	ContentTypeJSON  = "application/json"
	MessagesEndpoint = "/messages"
	MaxRetries       = 3
	RetryDelay       = 100 * time.Millisecond
	UserAgent        = "ark-memory-client/1.0"
)

type MemoryInterface interface {
	AddMessages(ctx context.Context, queryID string, messages []Message) error
	GetMessages(ctx context.Context) ([]Message, error)
	Close() error
}

type Config struct {
	Timeout    time.Duration
	MaxRetries int
	RetryDelay time.Duration
	SessionId  string
}

type MessagesRequest struct {
	SessionID string                                   `json:"session_id"`
	QueryID   string                                   `json:"query_id"`
	Messages  []openai.ChatCompletionMessageParamUnion `json:"messages"`
}

type MessageRecord struct {
	ID        int64           `json:"id"`
	SessionID string          `json:"session_id"`
	QueryID   string          `json:"query_id"`
	Message   json.RawMessage `json:"message"`
	CreatedAt string          `json:"created_at"`
}

type MessagesResponse struct {
	Messages []MessageRecord `json:"messages"`
	Total    int             `json:"total"`
	Limit    int             `json:"limit"`
	Offset   int             `json:"offset"`
}

func DefaultConfig() Config {
	return Config{
		Timeout:    DefaultTimeout,
		MaxRetries: MaxRetries,
		RetryDelay: RetryDelay,
	}
}

func NewMemory(ctx context.Context, k8sClient client.Client, memoryName, namespace string, recorder EventEmitter) (MemoryInterface, error) {
	return NewMemoryWithConfig(ctx, k8sClient, memoryName, namespace, recorder, DefaultConfig())
}

func NewMemoryWithConfig(ctx context.Context, k8sClient client.Client, memoryName, namespace string, recorder EventEmitter, config Config) (MemoryInterface, error) {
	return NewHTTPMemory(ctx, k8sClient, memoryName, namespace, recorder, config)
}

func NewMemoryForQuery(ctx context.Context, k8sClient client.Client, memoryRef *arkv1alpha1.MemoryRef, namespace string, recorder EventEmitter, sessionId string) (MemoryInterface, error) {
	config := DefaultConfig()
	config.SessionId = sessionId

	if memoryRef == nil {
		// Try to load "default" memory from the same namespace
		_, err := getMemoryResource(ctx, k8sClient, "default", namespace)
		if err != nil {
			// If default memory doesn't exist, use noop memory
			return NewNoopMemory(), nil
		}
		return NewMemoryWithConfig(ctx, k8sClient, "default", namespace, recorder, config)
	}

	memoryNamespace := resolveNamespace(memoryRef.Namespace, namespace)
	return NewMemoryWithConfig(ctx, k8sClient, memoryRef.Name, memoryNamespace, recorder, config)
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
