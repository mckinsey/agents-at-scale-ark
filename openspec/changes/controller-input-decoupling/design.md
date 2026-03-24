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

**Decision**: Add `ResolveQueryInputText` to the existing `ark/internal/resolution` package (in a new `query_input.go` file alongside `headers.go`).

**Rationale**: The `resolution` package already provides `ResolveFromConfigMap` and `ResolveFromSecret` (used for header resolution). Adding query input resolution here extends the package's existing responsibility for K8s-aware value resolution.

### 2. JSON-only message parsing

**Decision**: `ExtractFirstUserText` parses `json.RawMessage` directly to find the first user message text, without importing OpenAI types.

**Rationale**: The controller only needs a text string for display. Parsing the raw JSON for `role: "user"` and extracting the `content` field avoids any provider type dependency.

### 3. Delegate ConfigMap/Secret resolution

**Decision**: Delegate completions' `resolveConfigMapKeyRef` and `resolveSecretKeyRef` (at `query_parameters.go:72` and `:85`) to the existing shared `resolution.ResolveFromConfigMap` and `resolution.ResolveFromSecret` helpers (at `headers.go:85` and `:66`).

**Rationale**: Both paths perform identical K8s resource lookups. The shared helpers already exist and are used by the A2A header resolution path. Deduplicating the completions copies eliminates drift without changing behavior.

## Risks

**[Parsing divergence]** — The JSON-only parser could miss edge cases that the OpenAI-typed parser handles. Mitigation: comprehensive unit tests covering all content formats (string, array of parts, mixed).
