## Context

The controller calls `completions.GetQueryInputMessages(ctx, query, k8sClient)` to extract user text for the query status. This function lives in the completions engine package and uses OpenAI message types internally. The controller only needs the text string, not the parsed message structures.

## Goals / Non-Goals

**Goals:**
- Controller has zero import dependency on `ark/executors/completions` for input extraction
- Shared resolver handles `user` type (string + parameter templates) and `messages` type (extract first user text from JSON array)
- ConfigMap/Secret resolution logic shared between controller and completions paths

**Non-Goals:**
- Removing `GetQueryInputMessages` from completions (still needed for engine-internal message parsing)
- Changing query input wire format

## Decisions

### 1. Shared resolver in `ark/internal/resolution`

**Decision**: Create a new `resolution` package under `ark/internal/` with `ResolveQueryInputText` as the entry point.

**Rationale**: The `internal/` directory is already used for controller and shared utilities. A `resolution` package clearly communicates its purpose and can be imported by both the controller and completions engine.

### 2. JSON-only message parsing

**Decision**: `ExtractFirstUserText` parses `json.RawMessage` directly to find the first user message text, without importing OpenAI types.

**Rationale**: The controller only needs a text string for display. Parsing the raw JSON for `role: "user"` and extracting the `content` field avoids any provider type dependency.

### 3. Delegate ConfigMap/Secret resolution

**Decision**: `ResolveFromConfigMap` and `ResolveFromSecret` are shared helpers called by both the new resolver and the existing completions `resolveValueFrom`.

**Rationale**: Both paths need identical K8s resource resolution. Sharing the code eliminates duplication without changing behavior.

## Risks

**[Parsing divergence]** — The JSON-only parser could miss edge cases that the OpenAI-typed parser handles. Mitigation: comprehensive unit tests covering all content formats (string, array of parts, mixed).
