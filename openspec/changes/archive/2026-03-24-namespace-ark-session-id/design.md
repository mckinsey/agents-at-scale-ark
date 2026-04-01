## Context

Ark's controller sets `session.id` as an OTEL span attribute and W3C Baggage key when dispatching queries. Named executors with their own OTEL instrumentation (LangChain, LlamaIndex, etc.) independently set `session.id` using their own session identifiers. The broker stores both without deduplication. The dashboard groups traces by `session.id`, so when executor spans carry a different value than the controller's, a single query's trace tree gets split across multiple session groups.

The attribute name `session.id` is not an OTEL semantic convention — it's a custom attribute that both Ark and executor frameworks happen to use. Namespacing to `ark.session.id` gives Ark its own lane.

### Current flow

```
Controller sets:  span attr "session.id" = <query.spec.sessionId>
                  baggage    "session.id" = <query.spec.sessionId>
                         ↓
Executor sets:    span attr "session.id" = <langchain conversation id>  ← conflict
                         ↓
Broker stores:    both values, no merge
                         ↓
Dashboard groups: by first "session.id" found → fractured sessions
```

### After

```
Controller sets:  span attr "ark.session.id" = <query.spec.sessionId>
                  baggage    "ark.session.id" = <query.spec.sessionId>
                         ↓
Executor sets:    span attr "session.id" = <langchain conversation id>  ← ignored by Ark
                         ↓
Broker filters:   on "ark.session.id" only
                         ↓
Dashboard groups: by "ark.session.id" → clean sessions
```

## Goals / Non-Goals

**Goals:**
- Eliminate session grouping collisions between Ark and executor-native OTEL instrumentation
- Clean single-constant change on the write side (controller)
- Remove dead `resource.session_id` fallback from broker

**Non-Goals:**
- Normalizing or merging executor session IDs with Ark session IDs
- Adding backward-compat shims to read both old and new attribute names
- Changing how executors instrument their own spans

## Decisions

### 1. Attribute name: `ark.session.id`

Follows the `<vendor>.<attribute>` namespacing pattern used in OTEL (e.g., `faas.invocation_id`, `cloud.provider`). Keeps the dot-separated hierarchy consistent with existing Ark attributes.

**Alternatives considered:**
- `ark_session_id` — inconsistent with OTEL dot notation
- `ark.session_id` — mixes dot and underscore, inconsistent with current `session.id` style
- Keep `session.id` and add a span processor to overwrite executor values — too invasive, breaks executor observability

### 2. Baggage key also namespaced to `ark.session.id`

Baggage is only consumed by Ark's own OTEL tracer (`extractQueryAttributesFromContext`). No external contract depends on the baggage key. Namespacing both keeps them consistent and avoids confusion about which `session.id` is in the baggage.

### 3. Drop `resource.session_id` fallback in broker

`spanMatchesSessionId()` checks `span.resource?.session_id` as a fallback. Nothing in the codebase sets this — resource attributes describe service identity, not per-request state. Removing it simplifies the matching logic and avoids false matches from executors that happen to set `session_id` at the resource level.

### 4. No backward-compat period

The broker is in-memory only — no persistent trace storage. Old traces disappear on broker restart. A dual-read period adds complexity for zero benefit. The cutover is atomic: deploy controller + broker + dashboard together.

## Risks / Trade-offs

- **Active sessions during rollout** — Traces already stored in broker memory with `session.id` won't match `ark.session.id` filters until broker restarts. → Mitigation: broker is ephemeral; a restart clears state. Coordinate deploy to restart broker alongside controller.
- **External tooling reading `session.id`** — Any custom dashboards or scripts filtering broker traces by `session.id` will break. → Mitigation: document the breaking change in release notes.
- **Executor baggage readers** — If any executor reads `session.id` from baggage to correlate its own sessions, it will stop receiving Ark's value. → Mitigation: this is the intended behavior — executors should use their own session tracking, not Ark's.
