### Requirement: Controller sets ark.session.id span attribute
The controller SHALL set the OTEL span attribute `ark.session.id` (instead of `session.id`) on the dispatch span when processing a query. The value SHALL be the query's `spec.sessionId`, or the query UID if no session ID is specified.

#### Scenario: Query with explicit session ID
- **WHEN** a query with `spec.sessionId = "abc-123"` is dispatched
- **THEN** the dispatch span SHALL have attribute `ark.session.id` with value `"abc-123"`
- **AND** the span SHALL NOT have an attribute `session.id` set by the controller

#### Scenario: Query without session ID
- **WHEN** a query without a `spec.sessionId` is dispatched
- **THEN** the dispatch span SHALL have attribute `ark.session.id` with value equal to the query UID

### Requirement: Controller sets ark.session.id baggage key
The controller SHALL set the W3C Baggage key `ark.session.id` (instead of `session.id`) when propagating session context to executors.

#### Scenario: Baggage propagation to executor
- **WHEN** the controller dispatches a query to a named executor
- **THEN** the HTTP request SHALL include a `baggage` header containing `ark.session.id=<session-id>`
- **AND** the `baggage` header SHALL NOT contain a `session.id` member set by the controller

### Requirement: Broker filters traces by ark.session.id
The broker's span matching logic SHALL filter on the `ark.session.id` span attribute when filtering traces by session. The broker SHALL NOT fall back to `resource.session_id`.

#### Scenario: Filter traces with ark.session.id attribute
- **WHEN** a GET request to `/traces?session_id=abc-123` is received
- **THEN** the broker SHALL return only spans where `attributes[].key === "ark.session.id"` matches `"abc-123"`

#### Scenario: Executor-set session.id is ignored
- **WHEN** a span has attribute `session.id = "executor-session"` and attribute `ark.session.id = "ark-session"`
- **THEN** filtering by `session_id=ark-session` SHALL include the span
- **AND** filtering by `session_id=executor-session` SHALL NOT include the span

#### Scenario: Legacy resource.session_id is not matched
- **WHEN** a span has `resource.session_id = "abc-123"` but no `ark.session.id` attribute
- **THEN** filtering by `session_id=abc-123` SHALL NOT include the span

### Requirement: Dashboard groups sessions by ark.session.id
The dashboard SHALL extract session IDs from the `ark.session.id` span attribute when grouping traces into sessions. Non-Ark `session.id` attributes SHALL be ignored for grouping purposes.

#### Scenario: Traces grouped correctly despite executor session.id
- **WHEN** a trace contains controller spans with `ark.session.id = "sess-1"` and executor spans with `session.id = "langchain-conv-42"`
- **THEN** all spans in the trace SHALL appear under the `"sess-1"` session group in the Traces view

#### Scenario: Session extraction from span attributes
- **WHEN** session extraction is performed on a span
- **THEN** the extraction logic SHALL look for `ark.session.id` in span attributes
- **AND** SHALL NOT use `session.id` from span attributes for Ark session grouping

### Requirement: Documentation reflects ark.session.id
All documentation referencing the OTEL session attribute SHALL use `ark.session.id`. Any references to the old `session.id` attribute as an Ark-set attribute SHALL be updated.

#### Scenario: Documentation accuracy
- **WHEN** a user reads documentation about Ark's OTEL tracing
- **THEN** the documented span attribute for session tracking SHALL be `ark.session.id`
