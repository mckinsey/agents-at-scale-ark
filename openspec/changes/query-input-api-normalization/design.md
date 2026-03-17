## Context

The Query CRD stores input messages as `runtime.RawExtension` — opaque JSON. The current `GetInputMessages` deserializes this into `[]openai.ChatCompletionMessageParamUnion`. Since the storage is already format-neutral, we can add a second accessor that deserializes into `[]protocol.Message` without touching the CRD schema.

## Goals / Non-Goals

**Goals:**
- Protocol-typed input accessors on `QuerySpec` that coexist with OpenAI-typed ones
- Completions engine can optionally consume protocol messages internally
- Round-trip fidelity between both accessor pairs

**Non-Goals:**
- Removing OpenAI-typed accessors
- CRD version bumps or migration

## Decisions

### 1. Dual accessor pair on `QuerySpec`

**Decision**: Add `GetProtocolInputMessages` / `SetProtocolInputMessages` alongside the existing pair.

**Rationale**: The CRD stores raw JSON. Multiple typed views over the same storage is a standard pattern. This allows engines to choose their preferred type without migration.

### 2. Conversion direction

**Decision**: `GetProtocolInputMessages` deserializes raw JSON into protocol messages using the same raw-JSON-to-protocol mapping established in step 1a's resolver.

**Rationale**: Reusing the same mapping logic ensures consistency between what the controller sees (via resolver) and what the engine sees (via accessor).

### 3. Soft deprecation of OpenAI accessors

**Decision**: Add deprecation doc comments to `GetInputMessages` / `SetInputMessages` pointing to the protocol-typed alternatives. No compile-time warnings or removal.

**Rationale**: Hard removal would break backward compatibility. Doc-level deprecation signals the migration direction without forcing changes.

## Risks

**[Conversion fidelity]** — Protocol messages may not capture all OpenAI-specific fields (e.g., `name`, `tool_call_id`). Mitigation: use DataParts and extensions to preserve structured content, with round-trip tests.
