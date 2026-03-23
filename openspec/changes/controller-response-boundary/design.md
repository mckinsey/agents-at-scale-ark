## Context

The controller currently imports OpenAI types and uses them to reconstruct `response.raw` from protocol messages. This creates a tight coupling where any OpenAI format change requires controller changes. The A2A protocol already provides structured data via extensions and DataParts; the controller should act as a protocol client, not a format translator.

## Goals / Non-Goals

**Goals:**
- Controller processes responses without importing OpenAI types or understanding provider-specific message shapes
- Executor-produced `messages` (legacy OpenAI JSON) passes through to `response.raw` as opaque bytes
- Protocol-native `responseMessagesV1` tracked and surfaced without conversion
- Metadata merged from both legacy and extension-based sources transparently

**Non-Goals:**
- Dropping `response.raw` from the API (backward compatibility required)
- Changing how the completions handler internally builds responses

## Decisions

### 1. Opaque pass-through for `response.raw`

**Decision**: The controller reads executor-produced `messages` from the A2A response metadata as `json.RawMessage` and writes it directly to `response.raw` without parsing.

**Rationale**: The controller's only job is to store what the executor produced. Parsing and reconstructing introduces fragile format coupling.

### 2. `buildFallbackRaw` replaces `serializeMessages`

**Decision**: When `messages` metadata is absent, the controller builds a minimal fallback JSON from protocol message text parts using only `json.RawMessage`. No OpenAI types are used.

**Rationale**: The fallback path must also be provider-independent. A simple JSON structure `[{"role":"assistant","content":"..."}]` covers the fallback without needing OpenAI type definitions.

### 3. Full-fidelity OpenAI-to-protocol conversion in handler

**Decision**: `openAIToProtocolResponseMessages` lives in `completions/handler.go`, converting OpenAI response messages to protocol `Message` objects with DataParts for tool calls and structured content.

**Rationale**: The completions handler already imports OpenAI types. Placing the conversion here confines provider-specific knowledge to the engine boundary.

### 4. Metadata merge strategy

**Decision**: `extractArkPayloadMap` merges metadata from both `QueryExtensionMetadataKey` (legacy) and `ExecutionContextExtensionURI` (A2A extension), with extension data taking precedence on conflict.

**Rationale**: During migration, executors may populate either or both metadata sources. Merging ensures no data loss regardless of which path an executor uses.

### 5. Deterministic precedence and conflict observability

**Decision**: Metadata merge uses an explicit precedence table and records conflict telemetry containing key, winner source, loser source, and query context.

**Rationale**: Without deterministic precedence and observability, mixed deployments can produce silent semantic drift and block compatibility retirement decisions.
This mitigates the `Metadata conflict` risk via deterministic precedence and mandatory conflict telemetry.

### 6. Controller-adjacent capability verification integration

**Decision**: Controller response boundary docs include integration points for a controller-adjacent module that verifies discovered Agent Card extension declarations before dispatch.

**Rationale**: Capability verification belongs with controller A2A-client behavior and provides the declaration context needed to interpret extension-sourced metadata paths consistently.

### 7. Soft-fail declaration mismatch policy

**Decision**: Missing extension declarations are handled as `soft_fail_warn` during mixed deployments: emit structured warning telemetry and continue dispatch/response processing.

**Rationale**: This preserves compatibility while producing measurable signals for future hard-enforcement and retirement decisions.
This mitigates the `Capability declaration mismatch drift` risk with deterministic warning behavior and governance visibility.

## Risks

**[Fallback fidelity]** — `buildFallbackRaw` produces simpler JSON than the original reconstruction. Mitigation: this path only activates when the executor does not provide `messages` metadata, which is the exceptional case.

**[Metadata conflict]** — Conflicting values between legacy and extension metadata. Mitigation: explicit precedence table plus structured conflict telemetry and alert thresholds.
