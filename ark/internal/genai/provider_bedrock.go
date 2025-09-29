package genai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/bedrockruntime"
	"github.com/openai/openai-go"
	"k8s.io/apimachinery/pkg/runtime"
)

type BedrockModel struct {
	Model           string
	Region          string
	BaseURL         string
	AccessKeyID     string
	SecretAccessKey string
	SessionToken    string
	ModelArn        string
	Properties      map[string]string
	client          *bedrockruntime.Client
	outputSchema    *runtime.RawExtension
	schemaName      string
}

type bedrockMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type bedrockRequest struct {
	Messages         []bedrockMessage `json:"messages"`
	MaxTokens        int              `json:"max_tokens"`
	Temperature      float64          `json:"temperature"`
	SystemPrompt     string           `json:"system,omitempty"`
	AnthropicVersion string           `json:"anthropic_version,omitempty"`
	Tools            []bedrockTool    `json:"tools,omitempty"`
}

type bedrockTool struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	InputSchema map[string]interface{} `json:"input_schema"`
}

type bedrockResponse struct {
	Content    []bedrockContent `json:"content"`
	ID         string           `json:"id"`
	Model      string           `json:"model"`
	StopReason string           `json:"stop_reason"`
	Usage      struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
}

type bedrockContent struct {
	Text  string                 `json:"text,omitempty"`
	Type  string                 `json:"type"`
	ID    string                 `json:"id,omitempty"`
	Name  string                 `json:"name,omitempty"`
	Input map[string]interface{} `json:"input,omitempty"`
}

func NewBedrockModel(model, region, baseURL, accessKeyID, secretAccessKey, sessionToken, modelArn string, properties map[string]string) *BedrockModel {
	return &BedrockModel{
		Model:           model,
		Region:          region,
		BaseURL:         baseURL,
		AccessKeyID:     accessKeyID,
		SecretAccessKey: secretAccessKey,
		SessionToken:    sessionToken,
		ModelArn:        modelArn,
		Properties:      properties,
	}
}

func (bm *BedrockModel) initClient(ctx context.Context) error {
	if bm.client != nil {
		return nil
	}

	var cfg aws.Config
	var err error

	if bm.AccessKeyID != "" && bm.SecretAccessKey != "" {
		creds := credentials.NewStaticCredentialsProvider(bm.AccessKeyID, bm.SecretAccessKey, bm.SessionToken)
		cfg, err = config.LoadDefaultConfig(ctx, config.WithRegion(bm.Region), config.WithCredentialsProvider(creds))
	} else {
		cfg, err = config.LoadDefaultConfig(ctx, config.WithRegion(bm.Region))
	}

	if err != nil {
		return fmt.Errorf("failed to load AWS config: %w", err)
	}

	// If BaseURL is provided, use it as custom endpoint
	if bm.BaseURL != "" {
		cfg.BaseEndpoint = aws.String(bm.BaseURL)
	}

	bm.client = bedrockruntime.NewFromConfig(cfg)
	return nil
}

func (bm *BedrockModel) SetOutputSchema(schema *runtime.RawExtension, schemaName string) {
	bm.outputSchema = schema
	bm.schemaName = schemaName
}

func (bm *BedrockModel) ChatCompletion(ctx context.Context, messages []Message, n int64, tools ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	var toolsParam []openai.ChatCompletionToolParam
	if len(tools) > 0 {
		toolsParam = tools[0]
	}
	if err := bm.initClient(ctx); err != nil {
		return nil, err
	}

	bedrockMessages, systemPrompt := bm.convertMessages(messages)
	bedrockTools := bm.convertTools(toolsParam)

	request := bm.buildRequest(bedrockMessages, systemPrompt, bedrockTools)

	if strings.Contains(strings.ToLower(bm.Model), "claude") {
		request.AnthropicVersion = "bedrock-2023-05-31"
	}

	requestBody, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}

	modelID := bm.Model
	if bm.ModelArn != "" {
		modelID = bm.ModelArn
	}

	input := &bedrockruntime.InvokeModelInput{
		ModelId:     aws.String(modelID),
		Body:        requestBody,
		ContentType: aws.String("application/json"),
		Accept:      aws.String("application/json"),
	}

	result, err := bm.client.InvokeModel(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("failed to invoke Bedrock model: %w", err)
	}

	var response bedrockResponse
	if err := json.Unmarshal(result.Body, &response); err != nil {
		return nil, err
	}

	return bm.convertResponse(response), nil
}

func (bm *BedrockModel) ChatCompletionWithSchema(ctx context.Context, messages []Message, outputSchema *runtime.RawExtension, schemaName string, tools []openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	return bm.ChatCompletion(ctx, messages, 1, tools)
}

func (bm *BedrockModel) ChatCompletionStream(ctx context.Context, messages []Message, n int64, streamFunc func(*openai.ChatCompletionChunk) error, tools ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	// Per OpenAI spec, when streaming is requested for a model that doesn't support it,
	// return the complete response as a single chunk
	completion, err := bm.ChatCompletion(ctx, messages, n, tools...)
	if err != nil {
		return nil, err
	}

	// Convert the completion to a single streaming chunk
	// We send the full content in one chunk as per the OpenAI fallback spec
	for _, choice := range completion.Choices {
		chunk := &openai.ChatCompletionChunk{
			ID:      completion.ID,
			Object:  "chat.completion.chunk",
			Created: completion.Created,
			Model:   completion.Model,
			Choices: []openai.ChatCompletionChunkChoice{
				{
					Index: choice.Index,
					Delta: openai.ChatCompletionChunkChoiceDelta{
						Content: choice.Message.Content,
						Role:    "assistant",
					},
					FinishReason: choice.FinishReason,
				},
			},
		}

		// Send the chunk via the stream callback
		if err := streamFunc(chunk); err != nil {
			return nil, err
		}
	}

	// Return the original completion
	return completion, nil
}

func (bm *BedrockModel) buildRequest(messages []bedrockMessage, systemPrompt string, tools []bedrockTool) bedrockRequest {
	temperature := getFloatProperty(bm.Properties, "temperature", 1.0)
	maxTokens := getIntProperty(bm.Properties, "max_tokens", 4096)

	return bedrockRequest{
		Messages:     messages,
		MaxTokens:    maxTokens,
		Temperature:  temperature,
		SystemPrompt: systemPrompt,
		Tools:        tools,
	}
}

func (bm *BedrockModel) convertMessages(messages []Message) ([]bedrockMessage, string) {
	var bedrockMessages []bedrockMessage
	var systemPrompt string

	for _, msg := range messages {
		content, role := extractMessageContent(msg)
		if content == "" {
			continue
		}

		switch role {
		case RoleSystem:
			systemPrompt = content
		case RoleUser, RoleAssistant, RoleTool:
			msgRole := role
			if role == RoleTool {
				msgRole = RoleUser
			}
			bedrockMessages = append(bedrockMessages, bedrockMessage{
				Role:    msgRole,
				Content: content,
			})
		}
	}

	return bedrockMessages, systemPrompt
}

func (bm *BedrockModel) convertResponse(response bedrockResponse) *openai.ChatCompletion {
	var content string
	var toolCalls []openai.ChatCompletionMessageToolCall

	for _, c := range response.Content {
		switch c.Type {
		case "text":
			content = c.Text
		case "tool_use":
			toolCall := openai.ChatCompletionMessageToolCall{
				ID:   c.ID,
				Type: "function",
				Function: openai.ChatCompletionMessageToolCallFunction{
					Name:      c.Name,
					Arguments: mustMarshalJSON(c.Input),
				},
			}
			toolCalls = append(toolCalls, toolCall)
		}
	}

	finishReason := "stop"
	switch response.StopReason {
	case "max_tokens":
		finishReason = "length"
	case "tool_use":
		finishReason = "tool_calls"
	}

	message := openai.ChatCompletionMessage{
		Role:    "assistant",
		Content: content,
	}

	if len(toolCalls) > 0 {
		message.ToolCalls = toolCalls
	}

	return &openai.ChatCompletion{
		ID:     response.ID,
		Object: "chat.completion",
		Model:  response.Model,
		Choices: []openai.ChatCompletionChoice{
			{
				Index:        0,
				Message:      message,
				FinishReason: finishReason,
			},
		},
		Usage: openai.CompletionUsage{
			PromptTokens:     int64(response.Usage.InputTokens),
			CompletionTokens: int64(response.Usage.OutputTokens),
			TotalTokens:      int64(response.Usage.InputTokens + response.Usage.OutputTokens),
		},
	}
}

func mustMarshalJSON(v interface{}) string {
	if v == nil {
		return "{}"
	}
	data, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(data)
}

func (bm *BedrockModel) convertTools(tools []openai.ChatCompletionToolParam) []bedrockTool {
	var bedrockTools []bedrockTool

	for _, tool := range tools {
		if tool.Type == "function" {
			bedrockTool := bedrockTool{
				Name: tool.Function.Name,
			}

			if tool.Function.Description.Value != "" {
				bedrockTool.Description = tool.Function.Description.Value
			}

			if tool.Function.Parameters != nil {
				bedrockTool.InputSchema = map[string]interface{}(tool.Function.Parameters)
			}

			bedrockTools = append(bedrockTools, bedrockTool)
		}
	}

	return bedrockTools
}

func extractMessageContent(msg Message) (string, string) {
	openaiMsg := openai.ChatCompletionMessageParamUnion(msg)

	if systemMsg := openaiMsg.OfSystem; systemMsg != nil {
		if content := systemMsg.Content.OfString; content.Value != "" {
			return content.Value, "system"
		}
	}

	if userMsg := openaiMsg.OfUser; userMsg != nil {
		if content := userMsg.Content.OfString; content.Value != "" {
			return content.Value, RoleUser
		}
	}

	if assistantMsg := openaiMsg.OfAssistant; assistantMsg != nil {
		if content := assistantMsg.Content.OfString; content.Value != "" {
			return content.Value, "assistant"
		}
	}

	if toolMsg := openaiMsg.OfTool; toolMsg != nil {
		if content := toolMsg.Content.OfString; content.Value != "" {
			return content.Value, "tool"
		}
	}

	return "", ""
}

func (bm *BedrockModel) BuildConfig() map[string]any {
	cfg := map[string]any{}

	if bm.Region != "" {
		cfg["region"] = bm.Region
	}
	if bm.BaseURL != "" {
		cfg["baseUrl"] = bm.BaseURL
	}
	if bm.AccessKeyID != "" {
		cfg["accessKeyId"] = bm.AccessKeyID
	}
	if bm.SecretAccessKey != "" {
		cfg["secretAccessKey"] = bm.SecretAccessKey
	}
	if bm.SessionToken != "" {
		cfg["sessionToken"] = bm.SessionToken
	}
	if bm.ModelArn != "" {
		cfg["modelArn"] = bm.ModelArn
	}

	for key, value := range bm.Properties {
		cfg[key] = value
	}

	return cfg
}
