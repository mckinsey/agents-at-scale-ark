## Context

The controller imports `completions.Message` types in its response handling path. The actual coupling is narrow: `serializeMessages` (at `query_controller.go:407`) switches on `completions.Message` union variants, and the fallback at line 378 calls `completions.NewAssistantMessage`. The controller already reads pre-serialized `MessagesRaw` from A2A metadata via `extractEngineResponseMeta` (line 462) using `QueryExtensionMetadataKey` (defined in `a2a.go:43`). The completions types are only needed when `MessagesRaw` is empty.

## Goals / Non-Goals

**Goals:**
- Controller processes responses without importing `completions.Message` types
- Fallback path produces OpenAI-compatible JSON without provider type dependency
- Completions handler reliably populates `messages` metadata to minimize fallback usage

**Non-Goals:**
- Dropping `response.raw` from the API (backward compatibility required)
- Changing how the completions handler internally builds responses
- Adding new metadata sources or extension URIs beyond `QueryExtensionMetadataKey`

## Decisions

### 1. Opaque pass-through for `response.raw`

**Decision**: The controller reads `MessagesRaw` from `extractEngineResponseMeta` (already extracted from `QueryExtensionMetadataKey` at line 477) and writes it directly to `response.raw`. No change to the happy path — this already works.

**Rationale**: The existing metadata pass-through is correct. The fix focuses on the fallback path.

### 2. `buildFallbackRaw` replaces `serializeMessages`

**Decision**: When `MessagesRaw` is empty, the controller builds a minimal fallback JSON using `json.Marshal` on a simple struct: `[{"role":"assistant","content":"<responseText>"}]`. No `completions.Message` types involved.

**Rationale**: The fallback only needs to produce a single assistant message from the extracted response text. A simple anonymous struct achieves this without any provider type dependency.

### 3. Handler reliability

**Decision**: Ensure `completions/handler.go` `buildA2AResponse` always includes serialized `messages` in the A2A metadata under `QueryExtensionMetadataKey`, making the controller fallback path exceptional rather than routine.

**Rationale**: If the executor reliably provides `MessagesRaw`, the controller's fallback becomes a safety net for edge cases (e.g., non-completions executors that don't populate this field), not a primary code path.

## Risks

**[Fallback fidelity]** — `buildFallbackRaw` produces simpler JSON than `serializeMessages` (single assistant message vs full conversation). Mitigation: this path only activates when the executor does not provide `MessagesRaw`, which is already the exceptional case and will become rarer after handler reliability improvements.
