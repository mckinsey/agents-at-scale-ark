# Tasks: Controller-Level Tracing

- [x] **Task 1: Activate OTEL propagator** — In `telemetry/config/provider.go`, configure `otel.SetTextMapPropagator` with `propagation.TraceContext{}` + `propagation.Baggage{}`. Verify traceparent injection works.
- [x] **Task 2: Add root span in controller** — In `executeQueryAsync`, set query in context, create baggage with `session.id`, start `query.dispatch` span with query/target/address attributes. Defer span.End().
- [x] **Task 3: Instrument A2A client with otelhttp** — In `CreateA2AClient`, wrap HTTP client transport with `otelhttp.NewTransport`. Remove `InjectOTELHeaders` call from `customA2ARequestHandler.Handle`.
- [x] **Task 4: Add otelhttp middleware to completions server** — Wrap handler in `server.go` with `otelhttp.NewHandler` to extract incoming trace context.
- [x] **Task 5: Simplify QueryRecorder interface** — Remove `RecordSessionID` and `RecordConversationID` from interface and all implementations (otel, mock, noop). Remove calls in handler.go.
- [x] **Task 6: Delete dead propagation code** — Delete `telemetry/propagation.go`. Remove `InjectOTELHeaders` imports/calls.
- [x] **Task 7: Add tests** — Test root span creation, baggage propagation, otelhttp instrumentation on A2A client. Verify trace context flows across boundaries.
- [x] **Task 8: Update docs** — Update `docs/content/developer-guide/observability/index.mdx` architecture diagram. Update `completions/CLAUDE.md` and `ark/CLAUDE.md` telemetry descriptions.
