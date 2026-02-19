package genai

import (
	"testing"

	"github.com/openai/openai-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBedrockConvertMessagesExperimentalIncludesImageURLParts(t *testing.T) {
	model := &BedrockModel{}
	messages := []openai.ChatCompletionMessageParamUnion{
		openai.UserMessage([]openai.ChatCompletionContentPartUnionParam{
			openai.TextContentPart("describe"),
			openai.ImageContentPart(openai.ChatCompletionContentPartImageImageURLParam{
				URL: "https://example.com/image.png",
			}),
		}),
	}

	bedrockMessages, systemPrompt := model.convertMessages(messages, true)
	require.Empty(t, systemPrompt)
	require.Len(t, bedrockMessages, 1)
	assert.Equal(t, RoleUser, bedrockMessages[0].Role)
	assert.Equal(t, "describe\nhttps://example.com/image.png", bedrockMessages[0].Content)
}

func TestBedrockConvertMessagesDefaultPathUnchangedForArrayContent(t *testing.T) {
	model := &BedrockModel{}
	messages := []openai.ChatCompletionMessageParamUnion{
		openai.UserMessage([]openai.ChatCompletionContentPartUnionParam{
			openai.TextContentPart("describe"),
			openai.ImageContentPart(openai.ChatCompletionContentPartImageImageURLParam{
				URL: "https://example.com/image.png",
			}),
		}),
	}

	bedrockMessages, systemPrompt := model.convertMessages(messages, false)
	require.Empty(t, systemPrompt)
	assert.Len(t, bedrockMessages, 0)
}
