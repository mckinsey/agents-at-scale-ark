# PR1-v2 Adapter Layer Design

## Decision

Create a single adapter module (`protocol_messages.go`) that owns all bidirectional conversion between OpenAI unions and protocol messages. All other code calls through this module instead of doing inline conversion.

## Conversion: OpenAI -> Protocol

Each OpenAI message becomes one `protocol.Message`:

| OpenAI type | Protocol role | Parts |
|-------------|---------------|-------|
| `assistant` (text only) | `agent` | TextPart |
| `assistant` (tool calls) | `agent` | DataPart per tool call (`type=tool_call`) |
| `tool` | `agent` | DataPart (`type=tool_result`) |
| `user` | `user` | TextPart |
| `system` | skipped | Agent-local config, not protocol messages |

## Conversion: Protocol -> OpenAI

| Protocol role + parts | OpenAI type |
|----------------------|-------------|
| `agent` + TextPart only | `assistant` |
| `agent` + DataPart `type=tool_call` | `assistant` with tool calls |
| `agent` + DataPart `type=tool_result` | `tool` message |
| `user` + TextPart | `user` |

## DataPart Schemas

Tool call DataPart:
```json
{"type": "tool_call", "id": "call-1", "name": "weather_api", "arguments": "{...}"}
```

Tool result DataPart:
```json
{"type": "tool_result", "id": "call-1", "name": "weather_api", "content": "72F sunny"}
```

## Public API

```go
func ProtocolMessagesFromOpenAI(messages []Message) []ProtocolMessage
func OpenAIMessagesFromProtocol(messages []ProtocolMessage) []Message
func ProtocolAssistantMessage(content, name string) ProtocolMessage
func ProtocolUserMessage(content string) ProtocolMessage
func ProtocolSystemMessage(content string) ProtocolMessage
func ProtocolToolMessage(content, toolCallID string) ProtocolMessage
func ProtocolMessageText(msg ProtocolMessage) string
func ExtractLastProtocolAssistantMessageContent(msgs []ProtocolMessage) string
```
