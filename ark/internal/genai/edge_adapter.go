package genai

import (
	"fmt"

	"github.com/openai/openai-go"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

type EdgeAdapter interface {
	ToA2A(input interface{}) (protocol.Message, error)
	FromA2A(msg protocol.Message) (interface{}, error)
	Name() string
}

type ChatCompletionsAdapter struct{}

func (a *ChatCompletionsAdapter) ToA2A(input interface{}) (protocol.Message, error) {
	msg, ok := input.(openai.ChatCompletionMessageParamUnion)
	if !ok {
		return protocol.Message{}, fmt.Errorf("ChatCompletionsAdapter.ToA2A: expected openai.ChatCompletionMessageParamUnion, got %T", input)
	}
	return OpenAIToA2AMessage(msg)
}

func (a *ChatCompletionsAdapter) FromA2A(msg protocol.Message) (interface{}, error) {
	return A2AToOpenAIMessage(msg)
}

func (a *ChatCompletionsAdapter) Name() string {
	return "chat-completions"
}

type ResponseAPIAdapter struct{}

func (a *ResponseAPIAdapter) ToA2A(input interface{}) (protocol.Message, error) {
	text, ok := input.(string)
	if !ok {
		return protocol.Message{}, fmt.Errorf("ResponseAPIAdapter.ToA2A: expected string input, got %T", input)
	}
	return protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart(text),
	}), nil
}

func (a *ResponseAPIAdapter) FromA2A(msg protocol.Message) (interface{}, error) {
	text := extractTextFromParts(msg.Parts)
	responseItem := ResponseAPIItem{
		Type:    "message",
		Role:    mapA2ARoleToResponseAPI(msg.Role),
		Content: []ResponseAPIContent{{Type: "output_text", Text: text}},
	}
	if msg.TaskID != nil {
		responseItem.ID = *msg.TaskID
	}
	return responseItem, nil
}

func (a *ResponseAPIAdapter) Name() string {
	return "response-api"
}

type ResponseAPIItem struct {
	ID      string               `json:"id,omitempty"`
	Type    string               `json:"type"`
	Role    string               `json:"role"`
	Content []ResponseAPIContent `json:"content"`
	Status  string               `json:"status,omitempty"`
}

type ResponseAPIContent struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
}

func mapA2ARoleToResponseAPI(role protocol.MessageRole) string {
	switch role {
	case protocol.MessageRoleAgent:
		return "assistant"
	case protocol.MessageRoleUser:
		return "user"
	default:
		return "assistant"
	}
}

func GetEdgeAdapter(name string) (EdgeAdapter, error) {
	switch name {
	case "chat-completions":
		return &ChatCompletionsAdapter{}, nil
	case "response-api":
		return &ResponseAPIAdapter{}, nil
	default:
		return nil, fmt.Errorf("unknown edge adapter: %s", name)
	}
}
