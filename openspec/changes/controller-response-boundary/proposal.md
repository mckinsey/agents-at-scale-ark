## Why

The controller uses `completions.Message` types when building `response.raw`. At `query_controller.go:378`, the fallback path calls `completions.NewAssistantMessage(responseText)` and passes the result to `serializeMessages` (line 407), which switches on `completions.Message` union variants (`OfAssistant`, `OfUser`, `OfSystem`, `OfTool`, `OfFunction`). This requires the controller to import the completions package for response handling — the same layering violation as the input path.

The controller already receives `MessagesRaw` via A2A metadata (extracted by `extractEngineResponseMeta` at line 462, read from `QueryExtensionMetadataKey`). When present, this is used directly (line 376). The completions import is only needed for the fallback when `MessagesRaw` is empty.

## What Changes

- Remove `serializeMessages` (line 407) and its dependency on `completions.Message` types
- Replace the fallback at line 376-379 with `buildFallbackRaw` — a minimal JSON builder using only `json.RawMessage` that produces `[{"role":"assistant","content":"..."}]` without OpenAI types
- Remove `completions.NewAssistantMessage` usage from the controller response path
- In `completions/handler.go`, ensure `buildA2AResponse` always populates `messages` metadata so the fallback path is the exception, not the rule

## Non-goals

- Changing the A2A wire format between executor and controller
- Removing `response.raw` from the query status (needed for backward compatibility)
- Adding new metadata sources or extension URIs (single source via `QueryExtensionMetadataKey` is sufficient)
- Agent Card capability verification (no current infrastructure for this)

## Compatibility Contract

- `response.raw` continues to contain OpenAI-compatible JSON for existing clients
- When executor provides `MessagesRaw` via metadata (the normal path), behavior is unchanged
- When executor does not provide `MessagesRaw` (fallback), output is structurally identical: `[{"role":"assistant","content":"<text>"}]`
- No wire format changes — this is a controller-internal refactor

## Impact

- `ark/internal/controller/query_controller.go` (remove `serializeMessages`, replace fallback)
- `ark/executors/completions/handler.go` (ensure `messages` metadata always populated)
