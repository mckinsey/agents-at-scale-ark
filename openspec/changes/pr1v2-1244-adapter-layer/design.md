# PR1-v2 Adapter Layer Design

## Decision

Create a single adapter module (`protocol_messages.go`) that consolidates both conversion directions between OpenAI unions and protocol messages. Move PR-A's `openAIToProtocolResponseMessages` (and helpers) into this module. Add the reverse `Protocol→OpenAI` direction using PR-A's DataPart helpers.

## Prerequisites

PR-A provides:
- `arka2a.SetExtension(m, uri, payload)` / `arka2a.SetMetadata(m, key, value)` for spec-compliant extension and metadata assignment
- `arka2a.GetExtensionAs[T](m, uri)` for typed extension retrieval
- `arka2a.ExecutionContextExtensionURI` and `arka2a.ExecutionTraceExtensionURI` constants
- `arka2a.ExtractDataParts(parts)`, `arka2a.DataPartType(dp)`, `arka2a.DataPartField(dp, key)`, `arka2a.DataPartMap(dp, key)` for DataPart consumption
- Full-fidelity `openAIToProtocolResponseMessages` with `convertAssistantMessage`, `convertToolMessage`, `convertSystemMessage`, `convertFunctionMessage`
- `protocolMessagesToRawJSON` with `protocolMessageToRawCompat` and its helpers for JSON reconstruction

## Conversion: OpenAI -> Protocol (relocate from handler.go)

Already implemented in PR-A. Each OpenAI message becomes one `protocol.Message` with DataParts:

| OpenAI type | Protocol role | Parts |
|---|---|---|
| `assistant` (text only) | `agent` | TextPart |
| `assistant` (tool calls) | `agent` | TextPart + DataPart per call (`{type:tool_call, id, function:{name, arguments}}`) |
| `tool` | `agent` | DataPart (`{type:tool_result, tool_call_id, content}`) |
| `user` | `user` | TextPart |
| `system` | `agent` | DataPart (`{type:system, content}`) |
| `function` | `agent` | DataPart (`{type:function_result, name, content}`) |

## Conversion: Protocol -> OpenAI (new in PR1-v2)

Uses PR-A's DataPart helpers to reconstruct typed OpenAI unions:

| Protocol role + parts | OpenAI type |
|---|---|
| `agent` + TextPart only | `assistant` (text only) |
| `agent` + DataPart `type=tool_call` | `assistant` with `ToolCalls` array |
| `agent` + DataPart `type=tool_result` | `tool` with `ToolCallID` |
| `agent` + DataPart `type=system` | `system` |
| `agent` + DataPart `type=function_result` | `function` |
| `user` + TextPart | `user` |

## Round-Trip Guarantee

For any sequence of OpenAI messages:
```
OpenAI → Protocol (DataParts) → OpenAI = semantically identical
```

Tests verify that tool call IDs, function names, arguments, tool result content, system content, and function names survive the round-trip without loss.

## Extension Handling During Conversion

When converting OpenAI -> Protocol, the adapter attaches extension metadata using PR-A helpers:
- `arka2a.SetExtension(&msg, arka2a.ExecutionTraceExtensionURI, tracePayload)` for execution trace attribution
- This ensures `ExecutionTraceExtensionURI` is listed in `msg.Extensions` per A2A spec Section 4.6.2

## Public API

```go
func ProtocolMessagesFromOpenAI(messages []Message) []protocol.Message
func OpenAIMessagesFromProtocol(messages []protocol.Message) []Message
func ProtocolAssistantMessage(content, name string) protocol.Message
func ProtocolUserMessage(content string) protocol.Message
func ProtocolSystemMessage(content string) protocol.Message
func ProtocolToolMessage(content, toolCallID string) protocol.Message
func ProtocolMessageText(msg protocol.Message) string
func ExtractLastProtocolAssistantMessageContent(msgs []protocol.Message) string
```
