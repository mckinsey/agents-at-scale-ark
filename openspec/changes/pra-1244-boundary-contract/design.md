# PR-A Boundary Contract Design

## Decision

Introduce a generic multi-extension API following A2A Protocol Specification v1.0 (Section 4.6.2) and a versioned protocol-native response field at the handler/controller boundary while maintaining backward compatibility with legacy OpenAI-shaped metadata. The controller uses three-tier extraction precedence to support mixed-engine environments.

## A2A Spec Alignment

- **Section 4.1.4 (Message)**: `extensions` is an array of URI strings declaring which extensions "are present or contributed to this Message". `metadata` is a key-value map where extension URIs serve as keys and strongly-typed payloads as values.
- **Section 4.6.2 (Extension Points)**: Messages carry extension data via `extensions` (URI declaration) + `metadata[extensionURI]` (payload).
- **Section 4.6.3 (Extension Versioning)**: Extensions SHOULD include version info in their URI. A new URI MUST be created for breaking changes.

**Critical distinction**: Only spec-compliant A2A extensions belong in `Message.extensions`. The legacy `ArkMetadataKey` (`ark.mckinsey.com/execution-engine`) is NOT an extension -- it is bare metadata that predates the extension pattern. It is set via `SetMetadata` (metadata only) and MUST NOT appear in `Message.extensions`.

## Generic Extension Helpers

New file `ark/internal/a2a/extensions.go` with:

```go
func SetExtension(m *protocol.Message, uri string, payload any)
func SetMetadata(m *protocol.Message, key string, value any)
func GetExtension(m protocol.Message, uri string) (any, bool)
func GetExtensionAs[T any](m protocol.Message, uri string) (T, error)
func HasExtension(m protocol.Message, uri string) bool
func GetMetadata(m protocol.Message, key string) (any, bool)
```

`SetExtension` follows the spec: adds URI to `m.Extensions` (deduped) AND sets `m.Metadata[uri] = payload`.
`SetMetadata` sets only `m.Metadata[key]` without touching `m.Extensions` -- for non-extension metadata like the legacy `ArkMetadataKey`.

Typed convenience wrappers for known Ark extensions:

```go
func SetExecutionContextExtension(m *protocol.Message, payload ExecutionResponsePayload)
func GetExecutionContextExtension(m protocol.Message) (*ExecutionResponsePayload, error)
```

## Types

Add to `ark/internal/a2a/a2a_types.go`:

```go
const (
    ExecutionContextExtensionURI = "ark.mckinsey.com/extensions/execution-context/v1"
    ExecutionTraceExtensionURI   = "ark.mckinsey.com/extensions/execution-trace/v1"
)

type ExecutionResponsePayload struct {
    TokenUsage         *ResponseTokenUsage `json:"tokenUsage,omitempty"`
    ConversationId     string              `json:"conversationId,omitempty"`
    Messages           any                 `json:"messages,omitempty"`
    ResponseMessagesV1 json.RawMessage     `json:"responseMessagesV1,omitempty"`
}

type ResponseTokenUsage struct {
    PromptTokens     int64 `json:"prompt_tokens"`
    CompletionTokens int64 `json:"completion_tokens"`
    TotalTokens      int64 `json:"total_tokens"`
}
```

`ResponseMessagesV1` contains `json.Marshal([]protocol.Message)` -- the protocol-native message sequence. `Messages` retains the legacy OpenAI-shaped JSON for backward compatibility.

## Handler Response Path

`buildA2AResponse()` uses the extension helpers:

1. Build `ExecutionResponsePayload` with both `responseMessagesV1` (protocol-native) and `messages` (legacy).
2. Call `arka2a.SetExecutionContextExtension(responseMsg, extensionPayload)` -- adds URI to `extensions` + payload to `metadata`.
3. Call `arka2a.SetMetadata(responseMsg, arka2a.ArkMetadataKey, legacyMeta)` -- legacy metadata only, NOT added to `extensions`.

## Handler Extraction Path

`extractArkMetadata()` uses:
1. `arka2a.GetExtension(msg, ExecutionContextExtensionURI)` as primary lookup.
2. Falls back to `arka2a.GetMetadata(msg, ArkMetadataKey)` for legacy messages.

## Controller Request Path

`executeViaEngine()` uses:
1. `arka2a.SetExtension(msg, ExecutionContextExtensionURI, arkMetadata)` for the spec-compliant extension.
2. `arka2a.SetMetadata(msg, ArkMetadataKey, arkMetadata)` for legacy backward compat.

## DataPart Helpers

New helpers in `ark/internal/a2a/extensions.go` for consuming structured protocol data:

```go
func ExtractDataParts(parts []protocol.Part) []protocol.DataPart
func DataPartType(dp protocol.DataPart) string
func DataPartField(dp protocol.DataPart, key string) string
func DataPartMap(dp protocol.DataPart, key string) map[string]any
```

## Full-Fidelity Protocol Conversion

`openAIToProtocolResponseMessages()` maps each OpenAI message to a `protocol.Message` with DataParts:

| OpenAI type | Protocol representation |
|---|---|
| `OfAssistant` (text only) | `role: agent`, `TextPart` |
| `OfAssistant` (with tool calls) | `role: agent`, `TextPart` + `DataPart` per call (`{type:tool_call, id, function:{name, arguments}}`) |
| `OfUser` | `role: user`, `TextPart` |
| `OfTool` | `role: agent`, `DataPart{type:tool_result, tool_call_id, content}` |
| `OfSystem` | `role: agent`, `DataPart{type:system, content}` |
| `OfFunction` | `role: agent`, `DataPart{type:function_result, name, content}` |

## Controller Extraction Path

`extractEngineResponseMeta()` protocol-first precedence:

1. `arka2a.GetExtension(msg, ExecutionContextExtensionURI)` as primary, falls back to `arka2a.GetMetadata(msg, ArkMetadataKey)`.
2. Within the metadata map, prefer `responseMessagesV1` -- if present, unmarshal as `[]protocol.Message` and convert to `response.raw` compatible JSON via `protocolMessagesToRawJSON`.
3. If `responseMessagesV1` is absent, fall back to legacy `messages` field.
4. If neither is present, caller constructs a single assistant message from response text.

## Protocol-to-Raw Conversion

`protocolMessagesToRawJSON()` reconstructs full OpenAI-compatible JSON from DataParts:

| DataPart type | Reconstructed JSON |
|---|---|
| (text only, no DataParts) | `{"role":"assistant\|user","content":"..."}` |
| `tool_call` | `{"role":"assistant","content":"...","tool_calls":[{"id":"...","type":"function","function":{"name":"...","arguments":"..."}}]}` |
| `tool_result` | `{"role":"tool","tool_call_id":"...","content":"..."}` |
| `system` | `{"role":"system","content":"..."}` |
| `function_result` | `{"role":"function","name":"...","content":"..."}` |

## Wire Format Example

Per A2A spec Section 4.6.2:

```json
{
  "role": "ROLE_AGENT",
  "parts": [{"text": "..."}],
  "extensions": ["ark.mckinsey.com/extensions/execution-context/v1"],
  "metadata": {
    "ark.mckinsey.com/extensions/execution-context/v1": { "tokenUsage": {...}, "responseMessagesV1": [...] },
    "ark.mckinsey.com/execution-engine": { "conversationId": "...", "messages": [...] }
  }
}
```

Only the first key appears in `extensions`. The second is plain metadata, never declared in `extensions`.

## Compatibility

- Legacy engines that only write `ArkMetadataKey` continue to work via `GetMetadata` fallback.
- Dashboard parsing of `response.raw` is unchanged -- the controller produces the same output shape.
- New engines can write `responseMessagesV1` without needing OpenAI union knowledge.
- Third-party extensions use the same `SetExtension`/`GetExtension` API with their own URIs.
