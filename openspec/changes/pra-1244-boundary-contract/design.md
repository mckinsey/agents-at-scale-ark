# PR-A Boundary Contract Design

## Decision

Introduce a versioned protocol-native response field at the handler/controller boundary while maintaining backward compatibility with legacy OpenAI-shaped metadata. The controller uses three-tier extraction precedence to support mixed-engine environments.

## Types

Add to `ark/internal/a2a/a2a_types.go`:

```go
const ExecutionContextExtensionURI = "ark.mckinsey.com/extensions/execution-context/v1"

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

`ResponseMessagesV1` contains `json.Marshal([]protocol.Message)` — the protocol-native message sequence. `Messages` retains the legacy OpenAI-shaped JSON for backward compatibility.

## Handler Response Path

`buildA2AResponse()` writes both representations:

1. Serialize response messages as `[]protocol.Message` JSON into `responseMessagesV1`.
2. Serialize response messages as OpenAI union JSON into `messages` (legacy).
3. Set `Message.Extensions = []string{ExecutionContextExtensionURI}`.
4. Write the `ExecutionResponsePayload` under `Message.Metadata[ExecutionContextExtensionURI]`.
5. Write a legacy copy under `Message.Metadata[ArkMetadataKey]` for backward compatibility.

## Handler Extraction Path

`extractArkMetadata()` reads from `ExecutionContextExtensionURI` first, falls back to `ArkMetadataKey`.

## Controller Request Path

`executeViaEngine()` sets `Message.Extensions = []string{ExecutionContextExtensionURI}` and writes metadata under both keys.

## Controller Extraction Path

`extractEngineResponseMeta()` three-tier precedence:

1. Check `ExecutionContextExtensionURI` key, then `ArkMetadataKey` key for the metadata map.
2. Within the metadata map, check for `responseMessagesV1` — if present, unmarshal as `[]protocol.Message` and convert to `response.raw` compatible JSON.
3. If `responseMessagesV1` is absent, fall back to legacy `messages` field.
4. If neither is present, caller constructs a single assistant message from response text.

## Protocol-to-Raw Conversion

A new helper converts `[]protocol.Message` to the JSON shape expected by `response.raw` (and the dashboard). For each protocol message, extract `role` and text content from parts to produce `[{"role":"assistant","content":"..."}]` compatible JSON.

## Compatibility

- Legacy engines that only write `ArkMetadataKey` continue to work via fallback.
- Dashboard parsing of `response.raw` is unchanged — the controller produces the same output shape.
- New engines can write `responseMessagesV1` without needing OpenAI union knowledge.
