package completions

import (
	"context"
	"errors"
	"fmt"

	"github.com/openai/openai-go"
)

type (
	Message          openai.ChatCompletionMessageParamUnion
	ToolCall         openai.ChatCompletionMessageToolCall
	UserMessage      openai.ChatCompletionUserMessageParam
	AssistantMessage openai.ChatCompletionAssistantMessageParam
	SystemMessage    openai.ChatCompletionSystemMessageParam
)

func NewSystemMessage(content string) Message {
	return Message(openai.SystemMessage(content))
}

func NewUserMessage(content string) Message {
	return Message(openai.UserMessage(content))
}

func NewAssistantMessage(content string) Message {
	return Message(openai.AssistantMessage(content))
}

func ToolMessage[T string | []openai.ChatCompletionContentPartTextParam](content T, toolCallID string) Message {
	return Message(openai.ToolMessage(content, toolCallID))
}

type TeamMember interface {
	Execute(ctx context.Context, userInput Message, history []Message, memory MemoryInterface, eventStream EventStreamInterface) (*ExecutionResult, error)
	GetName() string
	GetType() string
	GetDescription() string
}

type ToolResult struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Content string `json:"content,omitempty"`
	Error   string `json:"error,omitempty"`
}

type ToolExecutor interface {
	Execute(ctx context.Context, call ToolCall) (ToolResult, error)
}

const terminateTeamMessage = "TerminateTeam"

type TerminateTeam struct{}

func (e *TerminateTeam) Error() string {
	return terminateTeamMessage
}

func IsTerminateTeam(err error) bool {
	if err == nil {
		return false
	}
	var terminateErr *TerminateTeam
	return errors.As(err, &terminateErr)
}

// TerminateTeamWithReason wraps TerminateTeam with additional context
// This allows programmatic termination without using the terminate tool
type TerminateTeamWithReason struct {
	Reason string
	base   TerminateTeam
}

func (e *TerminateTeamWithReason) Error() string {
	if e.Reason != "" {
		return fmt.Sprintf("%s: %s", terminateTeamMessage, e.Reason)
	}
	return terminateTeamMessage
}

// Unwrap returns the wrapped TerminateTeam error
// This makes IsTerminateTeam() return true for TerminateTeamWithReason
func (e *TerminateTeamWithReason) Unwrap() error {
	return &e.base
}

// NewTerminateTeamWithReason creates a new termination error with context
func NewTerminateTeamWithReason(reason string) error {
	return &TerminateTeamWithReason{
		Reason: reason,
	}
}

// TerminateTeamWithResponse wraps TerminateTeam with a user-facing response message
// from the terminate tool's response parameter.
type TerminateTeamWithResponse struct {
	Response string
	Messages []Message
	base     TerminateTeam
}

func (e *TerminateTeamWithResponse) Error() string {
	return terminateTeamMessage
}

func (e *TerminateTeamWithResponse) Unwrap() error {
	return &e.base
}
