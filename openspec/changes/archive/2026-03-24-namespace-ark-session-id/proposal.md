## Why

Named executors with their own OTEL instrumentation (e.g., LangChain, LlamaIndex) often set `session.id` as a span attribute using their own session identifiers. This collides with the `session.id` attribute that Ark's controller sets, causing the dashboard Traces view to fracture a single query's spans across multiple session groups. Namespacing Ark's attribute to `ark.session.id` eliminates the collision.

## What Changes

- Rename the OTEL span attribute from `session.id` to `ark.session.id` across the controller, broker, and dashboard — **BREAKING** for any tooling that filters on `session.id` expecting Ark's value
- Rename the W3C Baggage key from `session.id` to `ark.session.id`
- Remove the legacy `resource.session_id` fallback in the broker's span matching (dead code, nothing sets it)
- Update all dashboard session extraction/grouping logic to match on `ark.session.id`
- Update documentation referencing the `session.id` attribute

## Capabilities

### New Capabilities
- `namespaced-session-attribute`: Ark uses `ark.session.id` as its OTEL span attribute and baggage key, avoiding conflicts with executor-native `session.id` values.

### Modified Capabilities

## Impact

- **Ark controller** (`ark/internal/telemetry/recorders.go`, `query_controller.go`, `otel/tracer.go`): attribute constant and baggage key change
- **Ark broker** (`services/ark-broker/`): `spanMatchesSessionId()` attribute key change, `resource.session_id` fallback removal
- **Ark dashboard** (`services/ark-dashboard/`): session extraction in `session-utils.ts`, `embedded-chat-panel.tsx`, and related components
- **Tests**: controller dispatch tests, broker session filter tests, dashboard session utils tests
- **Documentation**: any docs referencing `session.id` as an OTEL attribute
- **Breaking**: existing stored traces using `session.id` will not match the new filter — only affects in-memory broker state during rollout, not persistent storage
