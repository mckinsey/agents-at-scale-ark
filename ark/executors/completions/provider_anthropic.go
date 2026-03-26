package completions

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/openai/openai-go"
	"k8s.io/apimachinery/pkg/runtime"
)

const defaultAnthropicVersion = "2023-06-01"

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

func (ap *AnthropicProvider) ChatCompletion(ctx context.Context, messages []Message, n int64, tools ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	var toolsParam []openai.ChatCompletionToolParam
	if len(tools) > 0 {
		toolsParam = tools[0]
	}

	anthropicMessages, systemPrompt := convertMessagesToAnthropic(messages)
	anthropicTools := convertToolsToAnthropic(toolsParam)

	request := buildAnthropicRequest(anthropicMessages, systemPrompt, anthropicTools, ap.Properties)
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

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("anthropic API request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read Anthropic response: %w", err)
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

func (ap *AnthropicProvider) ChatCompletionStream(ctx context.Context, messages []Message, n int64, streamFunc func(*openai.ChatCompletionChunk) error, tools ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	completion, err := ap.ChatCompletion(ctx, messages, n, tools...)
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
	_, err := ap.ChatCompletion(ctx, testMessages, 1)
	return err
}
