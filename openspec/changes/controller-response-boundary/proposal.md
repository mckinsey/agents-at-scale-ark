## Why

The controller reconstructs OpenAI-compatible JSON from `protocol.Message` objects when building `response.raw`. This requires the controller to understand OpenAI message shapes (roles, content structure, tool calls) — knowledge that belongs exclusively in the execution engine. Any change to OpenAI response formats forces controller changes.

## What Changes

- Remove OpenAI response reconstruction functions from the controller (`protocolMessagesToRawJSON`, `serializeMessages`, and related helpers)
- Rewrite `extractResponseMessages` to pass executor-produced `messages` (legacy OpenAI JSON) as opaque bytes for `response.raw`
- Replace `serializeMessages` with `buildFallbackRaw` — a minimal, OpenAI-independent JSON fallback using only `json.RawMessage`
- Track `responseMessagesV1` presence for protocol-native clients without converting or inspecting its contents
- Move OpenAI-to-protocol conversion (`openAIToProtocolResponseMessages`) into the completions handler, where provider types are in scope
- Implement metadata merge strategy in `extractArkPayloadMap` to combine information from both `QueryExtensionMetadataKey` and `ExecutionContextExtensionURI`

## Non-goals

- Changing the A2A wire format between executor and controller
- Removing `response.raw` from the query status (needed for backward compatibility)
- Forcing clients to use `responseMessagesV1`

## Compatibility Contract

- `response.raw` continues to contain executor-produced OpenAI-compatible JSON for existing clients
- `responseMessagesV1` is added alongside `response.raw` as a protocol-native alternative
- Both paths are populated (dual-write) so consumers can migrate at their own pace
- Metadata from both legacy and extension-based sources is merged, preserving all existing metadata fields
- Mixed deployments unaffected — the controller accepts both metadata formats

## Impact

- `ark/internal/controller/query_controller.go` (major refactor: ~7 functions removed, 2 rewritten)
- `ark/internal/a2a/extensions.go` (generic extension helpers)
- `ark/executors/completions/handler.go` (OpenAI-to-protocol conversion added here)
