package genai

import (
	"context"
	"errors"

	"github.com/openai/openai-go"
)

type (
	Message          = openai.ChatCompletionMessageParamUnion
	ToolCall         = openai.ChatCompletionMessageToolCall
	UserMessage      = openai.ChatCompletionUserMessageParam
	AssistantMessage = openai.ChatCompletionAssistantMessageParam
	SystemMessage    = openai.ChatCompletionSystemMessageParam
)

func NewSystemMessage(content string) Message {
	return openai.SystemMessage(content)
}

func NewUserMessage(content string) Message {
	return openai.UserMessage(content)
}

func NewAssistantMessage(content string) Message {
	return openai.AssistantMessage(content)
}

func ToolMessage[T string | []openai.ChatCompletionContentPartTextParam](content T, toolCallID string) Message {
	return openai.ToolMessage(content, toolCallID)
}

type TeamMember interface {
	Execute(ctx context.Context, userInput Message, history []Message, memory MemoryInterface, eventStream EventStreamInterface) (*ExecutionResult, error)
	GetName() string
	GetType() string
	GetDescription() string
}

type ToolResult struct {
	ID       string                 `json:"id"`
	Name     string                 `json:"name"`
	Content  string                 `json:"content,omitempty"`
	Error    string                 `json:"error,omitempty"`
	Metadata map[string]interface{} `json:"metadata,omitempty"`
}

type ToolExecutor interface {
	Execute(ctx context.Context, call ToolCall) (ToolResult, error)
}

type TerminateTeam struct{}

func (e *TerminateTeam) Error() string {
	return "TerminateTeam"
}

func IsTerminateTeam(err error) bool {
	if err == nil {
		return false
	}
	var terminateErr *TerminateTeam
	return errors.As(err, &terminateErr)
}
