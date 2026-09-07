package completions

import (
	"context"
	"testing"

	"github.com/openai/openai-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/runtime"
	eventingnoop "mckinsey.com/ark/internal/eventing/noop"
	telemetrynoop "mckinsey.com/ark/internal/telemetry/noop"
)

const testImageBytes = 100

func historyWithImages(turns int) []Message {
	messages := make([]Message, 0, turns*2)
	for range turns {
		messages = append(messages,
			NewUserMessage("read it"),
			NewUserImageMessage("Image returned by the read tool.",
				[]ToolResultImage{newToolResultImage("image/png", make([]byte, testImageBytes))}))
	}
	return messages
}

func totalImageBytes(t *testing.T, messages []Message) int {
	t.Helper()
	total := 0
	for _, msg := range messages {
		_, images, _ := extractMessageParts(msg)
		for _, image := range images {
			total += image.Bytes
		}
	}
	return total
}

func TestApplyImageRequestBudget(t *testing.T) {
	t.Run("a history within the budget is returned untouched", func(t *testing.T) {
		messages := historyWithImages(3)
		got := applyImageRequestBudget(messages, 1000)

		assert.Equal(t, messages, got)
		assert.Equal(t, 300, totalImageBytes(t, got))
	})

	t.Run("a text-only history is returned untouched", func(t *testing.T) {
		messages := []Message{NewUserMessage("hello"), NewUserMessage("again")}
		assert.Equal(t, messages, applyImageRequestBudget(messages, 10))
	})

	t.Run("the oldest images are dropped once the budget is exceeded", func(t *testing.T) {
		messages := historyWithImages(5)
		got := applyImageRequestBudget(messages, 250)

		require.Len(t, got, len(messages))
		assert.Equal(t, 200, totalImageBytes(t, got), "two of the five images fit")

		_, newest, _ := extractMessageParts(got[len(got)-1])
		assert.Len(t, newest, 1, "the newest image is the one the model is being asked about")

		_, oldest, _ := extractMessageParts(got[1])
		assert.Empty(t, oldest, "the oldest image is dropped first")
	})

	t.Run("a dropped image leaves a breadcrumb, not a silent gap", func(t *testing.T) {
		got := applyImageRequestBudget(historyWithImages(2), 100)

		text, images, _ := extractMessageParts(got[1])
		assert.Empty(t, images)
		assert.Contains(t, text, "100 bytes")
		assert.Contains(t, text, "the 100 byte image budget for this request is exhausted")
		assert.Contains(t, text, "not shown to the model")
		assert.Contains(t, text, "Image returned by the read tool.", "the caption survives")
	})

	t.Run("the input is not mutated", func(t *testing.T) {
		messages := historyWithImages(3)
		applyImageRequestBudget(messages, 100)

		assert.Equal(t, 300, totalImageBytes(t, messages),
			"history handed to memory must not be trimmed in place")
	})

	t.Run("a non-positive budget disables the pass", func(t *testing.T) {
		messages := historyWithImages(2)
		assert.Equal(t, messages, applyImageRequestBudget(messages, 0))
	})
}

func TestModelChatCompletionAppliesTheRequestBudget(t *testing.T) {
	provider := &capturingProvider{response: &openai.ChatCompletion{
		Choices: []openai.ChatCompletionChoice{{}},
	}}

	model := &Model{
		Model:             "test-model",
		Provider:          provider,
		telemetryRecorder: telemetrynoop.NewProvider().ModelRecorder(),
		eventingRecorder:  eventingnoop.NewProvider().ModelRecorder(),
		ImagePolicy: newImagePolicy(toolImageLimits{
			MaxBytes:           defaultToolImageMaxBytes,
			MaxPerToolCall:     defaultToolImageMaxPerToolCall,
			MaxBytesPerTurn:    defaultToolImageMaxBytesPerTurn,
			MaxBytesPerRequest: 250,
		}),
	}

	_, err := model.ChatCompletion(context.Background(), historyWithImages(5), nil, 1, nil, ToolChoice(""))
	require.NoError(t, err)

	assert.Equal(t, 200, totalImageBytes(t, provider.captured),
		"the provider must never see more image bytes than the request budget allows")
}

type capturingProvider struct {
	response *openai.ChatCompletion
	captured []Message
}

func (c *capturingProvider) ChatCompletion(_ context.Context, messages []Message, _ int64, _ []openai.ChatCompletionToolParam, _ ToolChoice) (*openai.ChatCompletion, error) {
	c.captured = messages
	return c.response, nil
}

func (c *capturingProvider) ChatCompletionStream(_ context.Context, messages []Message, _ int64, _ func(*openai.ChatCompletionChunk) error, _ []openai.ChatCompletionToolParam, _ ToolChoice) (*openai.ChatCompletion, error) {
	c.captured = messages
	return c.response, nil
}

func (c *capturingProvider) SetOutputSchema(_ *runtime.RawExtension, _ string) {}
