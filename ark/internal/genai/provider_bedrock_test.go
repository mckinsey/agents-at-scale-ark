package genai

import (
	"testing"

	"github.com/openai/openai-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBedrockConvertMessagesIncludesImageURLParts(t *testing.T) {
	model := &BedrockModel{}
	messages := []openai.ChatCompletionMessageParamUnion{
		openai.UserMessage([]openai.ChatCompletionContentPartUnionParam{
			openai.TextContentPart("describe"),
			openai.ImageContentPart(openai.ChatCompletionContentPartImageImageURLParam{
				URL: "https://example.com/image.png",
			}),
		}),
	}

	bedrockMessages, systemPrompt := model.convertMessages(messages)
	require.Empty(t, systemPrompt)
	require.Len(t, bedrockMessages, 1)
	assert.Equal(t, RoleUser, bedrockMessages[0].Role)
	assert.Equal(t, "describe\nhttps://example.com/image.png", bedrockMessages[0].Content)
}
