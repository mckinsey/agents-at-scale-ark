## Context

The Query CRD has two input types: `user` (string) and `messages` (OpenAI message array). The `messages` type was added before the broker provided session-based conversation history. Now that the broker is the default entry point and manages history, embedding full conversation arrays in the CRD is redundant.

Dave Kerr noted: "we would fairly quickly consider dropping query input types of convo i.e. where we embed the full convo completions style — given that people get the broker by default we can just send input."

Kristof confirmed: "the concept of broker and being able to send the query input as chain of messages are already redundant, we could clean this up nicely by a targeted fix that stretches across crd / controller / api / dashboard."

## Goals / Non-Goals

**Goals:**
- Remove OpenAI type dependency from the Query CRD API
- Simplify input handling to a single path (user text)
- Provide backwards-compatible migration via webhook during deprecation

**Non-Goals:**
- Changing the broker's session management
- Removing the ability for the completions engine to process multi-turn conversations internally (it gets history from memory/broker, not from the CRD input)

## Decisions

### 1. Deprecation via mutating webhook

**Decision**: Add a mutating webhook that converts `type: messages` to `type: user` by extracting the first user message text. Attach a migration warning annotation.

**Rationale**: Follows the established migration warning pattern used for model provider deprecation. Gives users a clear signal to update without breaking existing workflows.

### 2. Remove OpenAI types from CRD

**Decision**: Remove `GetInputMessages()`, `SetInputMessages()`, and the `openai-go` import from `query_types.go`.

**Rationale**: The CRD API should not depend on a specific LLM provider SDK. Input is opaque `runtime.RawExtension` — only the executor needs to know the format.

### 3. Phased rollout

**Decision**: Phase 1 adds the deprecation webhook and warning. Phase 2 (after one release cycle) removes `messages` support entirely.

**Rationale**: Avoids breaking existing deployments while giving users time to migrate.

## Risks

**[SDK/CLI consumers]** — External tools may rely on `type: messages`. Mitigation: SDK and CLI changes in the same release; migration docs published before enforcement.

**[Direct CRD users]** — Teams creating Query CRs directly with `type: messages`. Mitigation: webhook provides automatic migration with warning.
