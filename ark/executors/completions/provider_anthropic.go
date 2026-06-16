package completions

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/openai/openai-go"
	"k8s.io/apimachinery/pkg/runtime"
	"mckinsey.com/ark/internal/common"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
)

const defaultAnthropicVersion = "2023-06-01"

var anthropicHTTPClient = &http.Client{
	Timeout:   60 * time.Second,
	Transport: common.NewSharedTransport(),
}

type AnthropicProvider struct {
	Model      string
	BaseURL    string
	APIKey     string
	Version    string
	Headers    map[string]string
	Properties map[string]string

	outputSchema *runtime.RawExtension
	schemaName   string
}

func (ap *AnthropicProvider) SetOutputSchema(schema *runtime.RawExtension, schemaName string) {
	ap.outputSchema = schema
	ap.schemaName = schemaName
}

func (ap *AnthropicProvider) ChatCompletion(ctx context.Context, messages []Message, n int64, tools []openai.ChatCompletionToolParam, toolChoice ToolChoice) (*openai.ChatCompletion, error) {
	anthropicMessages, systemPrompt := convertMessagesToAnthropic(messages)
	anthropicTools := convertToolsToAnthropic(tools)

	request := buildAnthropicRequest(anthropicMessages, systemPrompt, anthropicTools, toolChoice, ap.Properties)
	request.Model = ap.Model

	version := ap.Version
	if version == "" {
		version = defaultAnthropicVersion
	}

	requestBody, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal Anthropic request: %w", err)
	}

	url := ap.BaseURL + "/v1/messages"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(requestBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create Anthropic HTTP request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", ap.APIKey)
	httpReq.Header.Set("anthropic-version", version)

	for k, v := range ap.Headers {
		httpReq.Header.Set(k, v)
	}

	resp, err := anthropicHTTPClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("anthropic API request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		return nil, fmt.Errorf("failed to read Anthropic response: %w", err)
	}
	if len(body) == 10<<20 {
		logf.FromContext(ctx).Info("Anthropic response may have been truncated", "limit", "10MB")
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("anthropic API returned status %d: %s", resp.StatusCode, string(body))
	}

	var response anthropicResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, fmt.Errorf("failed to unmarshal Anthropic response: %w", err)
	}

	return convertAnthropicResponse(response), nil
}

func (ap *AnthropicProvider) ChatCompletionStream(ctx context.Context, messages []Message, n int64, streamFunc func(*openai.ChatCompletionChunk) error, tools []openai.ChatCompletionToolParam, toolChoice ToolChoice) (*openai.ChatCompletion, error) {
	completion, err := ap.ChatCompletion(ctx, messages, n, tools, toolChoice)
	if err != nil {
		return nil, err
	}
	if err := streamCompletionAsChunks(completion, streamFunc); err != nil {
		return nil, err
	}
	return completion, nil
}

func (ap *AnthropicProvider) BuildConfig() map[string]any {
	cfg := map[string]any{
		"baseUrl": ap.BaseURL,
	}

	if ap.Version != "" {
		cfg["version"] = ap.Version
	}

	for key, value := range ap.Properties {
		cfg[key] = value
	}

	return cfg
}

func (ap *AnthropicProvider) HealthCheck(ctx context.Context) error {
	testMessages := []Message{NewUserMessage("Hello")}
	_, err := ap.ChatCompletion(ctx, testMessages, 1, nil, ToolChoiceUnset)
	return err
}
