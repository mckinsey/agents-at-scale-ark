# Add Controller-Level Tracing and Simplify Session Propagation

## Problem

The query controller has no OTEL spans. Tracing starts inside the completions engine, leaving the controller's work (target resolution, address resolution, A2A round-trip, status writes) invisible. Named execution engine queries have zero tracing since they skip completions entirely.

Session ID and query attributes are derived independently in 3 places (context_utils, OTEL tracer, manual recorder calls). The OTEL propagation layer (`InjectOTELHeaders`, baggage) is wired up but never activated — the propagator is never configured, so `traceparent` and `baggage` headers are never injected or extracted. Trace context doesn't flow across the A2A boundary.

## Proposal

1. **Add a root span in the controller** (`query.dispatch`) wrapping `executeQueryAsync`, with query metadata, session ID, target, and dispatch address as attributes.

2. **Activate OTEL propagation** — configure `propagation.TraceContext{}` + `propagation.Baggage{}` so trace context and session ID flow across HTTP boundaries automatically.

3. **Use `otelhttp` for A2A client** — replace plain `http.Client` in `CreateA2AClient` with `otelhttp`-instrumented transport. This creates child spans for A2A calls and auto-propagates `traceparent` + `baggage`.

4. **Use `otelhttp` middleware on completions server** — extract incoming trace context so completions spans are children of the controller's root span.

5. **Set session ID via baggage** — controller sets `session.id` in OTEL baggage once; it propagates to completions and named engines automatically.

6. **Simplify QueryRecorder interface** — remove `RecordSessionID` and `RecordConversationID` since the OTEL tracer already auto-adds these from the Query CR in context.

7. **Remove dead propagation code** — delete `InjectOTELHeaders` (replaced by `otelhttp`), remove manual `X-Session-ID` header logic, remove unused baggage reading.

8. **Update docs** — update `docs/content/developer-guide/observability/index.mdx` architecture diagram to reflect controller-level tracing and trace propagation across A2A boundaries. Update `ark/executors/completions/CLAUDE.md` and `ark/CLAUDE.md` telemetry pattern descriptions.

## Non-goals

- Changing the `context_utils.go` runtime context values (queryID, sessionID, queryName) — these serve streaming, not telemetry
- Adding tracing to non-query controllers (agent, model, team reconcilers)
- Changing the eventing (K8s events) system

## Impact

- Full trace tree from controller through completions to LLM/tool calls
- Named engine queries get tracing for the first time
- Session ID propagates across service boundaries via baggage
- ~50 lines removed (dead propagation code, redundant recorder methods)
- QueryRecorder interface simplified (2 methods removed)
- Observability docs updated to reflect new architecture
