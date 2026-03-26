package completions

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

	anthropicMessages, systemPrompt := convertMessagesToAnthropic(messages)
	anthropicTools := convertToolsToAnthropic(toolsParam)

	request := buildAnthropicRequest(anthropicMessages, systemPrompt, anthropicTools, bm.Properties)

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

	var response anthropicResponse
	if err := json.Unmarshal(result.Body, &response); err != nil {
		return nil, err
	}

	return convertAnthropicResponse(response), nil
}

func (bm *BedrockModel) ChatCompletionWithSchema(ctx context.Context, messages []Message, outputSchema *runtime.RawExtension, schemaName string, tools []openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	return bm.ChatCompletion(ctx, messages, 1, tools)
}

func (bm *BedrockModel) ChatCompletionStream(ctx context.Context, messages []Message, n int64, streamFunc func(*openai.ChatCompletionChunk) error, tools ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	completion, err := bm.ChatCompletion(ctx, messages, n, tools...)
	if err != nil {
		return nil, err
	}
	if err := streamCompletionAsChunks(completion, streamFunc); err != nil {
		return nil, err
	}
	return completion, nil
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

func (bm *BedrockModel) HealthCheck(ctx context.Context) error {
	return bm.initClient(ctx)
}
