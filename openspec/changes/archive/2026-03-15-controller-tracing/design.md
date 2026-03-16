# Design: Controller-Level Tracing

## Trace Tree (target state)

```
query.dispatch (controller)                         ← NEW root span
├─ attrs: query.name, query.namespace, session.id,
│         target.type, target.name, dispatch.address
│
├─ HTTP POST /message (otelhttp child span)         ← NEW auto from otelhttp
│   ├─ traceparent header propagated
│   ├─ baggage header: session.id
│   │
│   └─ query.<name> (completions, child of above)   ← EXISTING, now linked
│       ├─ target.<name>
│       │   ├─ agent.<name>
│       │   │   ├─ llm.<model> (generation)
│       │   │   └─ tool.<name>
│       │   └─ team.<name>
│       │       └─ turns...
│       └─ attrs auto-enriched from query-in-context
│
└─ OR for named engines:
    └─ HTTP POST /message (otelhttp child span)     ← NEW
        ├─ traceparent propagated to engine
        └─ engine creates its own child spans
```

## Changes by file

### `ark/internal/telemetry/config/provider.go`

Configure the composite propagator at provider init:

```go
otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
    propagation.TraceContext{},
    propagation.Baggage{},
))
```

### `ark/internal/controller/query_controller.go`

In `executeQueryAsync`, before dispatching:

```go
ctx = otel.SetQueryInContext(ctx, &obj)

sessionId := obj.Spec.SessionId
if sessionId == "" {
    sessionId = string(obj.UID)
}
bag, _ := baggage.New(
    baggage.Member{Key: "session.id", Value: sessionId},
)
ctx = baggage.ContextWithBaggage(ctx, bag)

ctx, span := r.Telemetry.QueryRecorder().StartQuery(ctx, &obj, "dispatch")
defer span.End()

r.Telemetry.QueryRecorder().RecordSessionID(span, sessionId) // until interface simplified
```

Attributes on root span: query.name, query.namespace, session.id, target.type, target.name, dispatch.address.

### `ark/internal/a2a/a2a.go`

In `CreateA2AClient`, wrap HTTP client with otelhttp:

```go
transport := otelhttp.NewTransport(http.DefaultTransport)
httpClient := &http.Client{Timeout: timeout, Transport: transport}
```

This replaces the manual `InjectOTELHeaders` call in `customA2ARequestHandler.Handle` — otelhttp injects `traceparent` and `baggage` automatically. Keep custom header injection (resolved A2A headers) alongside.

### `ark/executors/completions/server.go`

Wrap the HTTP handler with otelhttp middleware to extract incoming trace context:

```go
mux.Handle("/", otelhttp.NewHandler(s.a2aServer.Handler(), "completions"))
```

This makes the completions handler's `StartQuery` span a child of the controller's root span.

### `ark/internal/telemetry/recorders.go`

Remove from `QueryRecorder` interface:
- `RecordSessionID(span Span, sessionID string)` — auto-added by tracer from query-in-context
- `RecordConversationID(span Span, conversationID string)` — auto-added by tracer from query-in-context

Update all implementations (otel, mock, noop).

### `ark/executors/completions/handler.go`

Remove calls:
- `h.telemetry.QueryRecorder().RecordSessionID(querySpan, sessionId)`

The tracer's `extractQueryAttributesFromContext` already adds session.id to every span.

### `ark/internal/telemetry/propagation.go`

Delete the file. `InjectOTELHeaders` is replaced by `otelhttp` transport which handles `traceparent` injection, and baggage propagation handles `session.id`.

### `ark/internal/a2a/a2a.go` (customA2ARequestHandler)

Remove the `InjectOTELHeaders` call from `Handle()`. The otelhttp transport handles trace propagation. Keep the custom header injection for resolved A2A headers.

### Docs

**`docs/content/developer-guide/observability/index.mdx`**:
- Update architecture diagram to show controller-level root span
- Note trace propagation across A2A boundaries via W3C traceparent
- Mention session.id baggage propagation

**`ark/executors/completions/CLAUDE.md`**:
- Update Key Patterns to note traces are linked to controller root span

**`ark/CLAUDE.md`**:
- Update Telemetry Pattern comment on QueryReconciler if needed

## Risks

- **otelhttp on completions server** adds middleware overhead to every request. Should be negligible for A2A message processing.
- **Baggage size** — `session.id` is a single short value. No concern.
- **Backward compatibility** — removing `RecordSessionID`/`RecordConversationID` from the interface is a breaking change for any external implementations. Internal only (otel, mock, noop), so safe.
