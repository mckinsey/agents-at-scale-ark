package completions

import (
	"testing"

	"github.com/openai/openai-go"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

func TestProtocolMessageFromOpenAIUser(t *testing.T) {
	input := NewUserMessage("hello")
	msg := ProtocolMessageFromOpenAI(input)

	if msg.Role != protocol.MessageRoleUser {
		t.Fatalf("expected user role, got %s", msg.Role)
	}
	if ProtocolMessageText(msg) != "hello" {
		t.Fatalf("expected text hello, got %q", ProtocolMessageText(msg))
	}
}

func TestOpenAIMessageFromProtocolAssistantName(t *testing.T) {
	msg := ProtocolAssistantMessage("response", "planner")
	converted := OpenAIMessageFromProtocol(msg)
	if converted.OfAssistant == nil {
		t.Fatalf("expected assistant message")
	}
	if converted.OfAssistant.Content.OfString.Value != "response" {
		t.Fatalf("unexpected assistant content: %q", converted.OfAssistant.Content.OfString.Value)
	}
	if converted.OfAssistant.Name.Value != "planner" {
		t.Fatalf("unexpected assistant name: %q", converted.OfAssistant.Name.Value)
	}
}

func TestProtocolOpenAIRoundTripSystem(t *testing.T) {
	input := NewSystemMessage("sys")
	protocolMsg := ProtocolMessageFromOpenAI(input)
	output := OpenAIMessageFromProtocol(protocolMsg)

	if output.OfSystem == nil {
		t.Fatalf("expected system message")
	}
	if output.OfSystem.Content.OfString.Value != "sys" {
		t.Fatalf("unexpected system content: %q", output.OfSystem.Content.OfString.Value)
	}
}

func TestProtocolOpenAIRoundTripTool(t *testing.T) {
	input := ToolMessage("result", "call-1")
	protocolMsg := ProtocolMessageFromOpenAI(input)
	output := OpenAIMessageFromProtocol(protocolMsg)

	if output.OfTool == nil {
		t.Fatalf("expected tool message")
	}
	if output.OfTool.Content.OfString.Value != "result" {
		t.Fatalf("unexpected tool content: %q", output.OfTool.Content.OfString.Value)
	}
	if output.OfTool.ToolCallID != "call-1" {
		t.Fatalf("unexpected tool call id: %q", output.OfTool.ToolCallID)
	}
}

func TestOpenAIMessagesFromProtocolBatch(t *testing.T) {
	input := []ProtocolMessage{
		ProtocolUserMessage("u"),
		ProtocolAssistantMessage("a", ""),
		ProtocolSystemMessage("s"),
	}
	out := OpenAIMessagesFromProtocol(input)
	if len(out) != 3 {
		t.Fatalf("expected 3 messages, got %d", len(out))
	}
	if out[0].OfUser == nil || out[0].OfUser.Content.OfString.Value != "u" {
		t.Fatalf("unexpected first message")
	}
	if out[1].OfAssistant == nil || out[1].OfAssistant.Content.OfString.Value != "a" {
		t.Fatalf("unexpected second message")
	}
	if out[2].OfSystem == nil || out[2].OfSystem.Content.OfString.Value != "s" {
		t.Fatalf("unexpected third message")
	}
}

func TestProtocolMessagesFromOpenAIBatch(t *testing.T) {
	input := []Message{
		NewUserMessage("u"),
		NewAssistantMessage("a"),
		Message(openai.SystemMessage("s")),
	}
	out := ProtocolMessagesFromOpenAI(input)
	if len(out) != 3 {
		t.Fatalf("expected 3 messages, got %d", len(out))
	}
	if out[0].Role != protocol.MessageRoleUser || ProtocolMessageText(out[0]) != "u" {
		t.Fatalf("unexpected first protocol message")
	}
	if out[1].Role != protocol.MessageRoleAgent || ProtocolMessageText(out[1]) != "a" {
		t.Fatalf("unexpected second protocol message")
	}
	if out[2].Role != protocol.MessageRoleUser || ProtocolMessageText(out[2]) != "s" {
		t.Fatalf("unexpected third protocol message")
	}
}
