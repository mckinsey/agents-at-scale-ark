package genai

import (
	"context"
	"errors"

	"github.com/openai/openai-go"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

type (
	Message  = protocol.Message
	ToolCall = openai.ChatCompletionMessageToolCall
)

func NewSystemMessage(content string) Message {
	message := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart(content),
	})
	message.Metadata = map[string]interface{}{
		MetadataRoleKey: RoleSystem,
	}
	return message
}

func NewUserMessage(content string) Message {
	return protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart(content),
	})
}

func NewAssistantMessage(content string) Message {
	return protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart(content),
	})
}

func ToolMessage[T string | []openai.ChatCompletionContentPartTextParam](content T, toolCallID string) Message {
	text := ""
	switch value := any(content).(type) {
	case string:
		text = value
	case []openai.ChatCompletionContentPartTextParam:
		for _, part := range value {
			if part.Text != "" {
				text += part.Text
			}
		}
	}
	message := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart(text),
	})
	message.Metadata = map[string]interface{}{
		MetadataRoleKey:       RoleTool,
		MetadataToolCallIDKey: toolCallID,
	}
	return message
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
