## Requirements: Annotation passthrough in ExecutionEngineRequest

Executors need access to `metadata.annotations` from three CRs — Agent, Query, and ExecutionEngine —
to support executor-specific configuration (e.g. tool config, routing hints) without requiring
changes to core Ark CRDs. The `ExecutionEngineRequest` SDK type already declares the fields;
this spec covers populating them in the request-building path.

---

### Requirement: Agent annotations passed to executor
`ExecutionEngineRequest.agent.annotations` SHALL be populated from the Agent CR's
`metadata.annotations` when the request is built.

#### Scenario: Agent has annotations
- **WHEN** an Agent CR has `metadata.annotations: {"executor-openai-responses.ark.mckinsey.com/tools": "[...]"}`
- **THEN** `request.agent.annotations` SHALL contain that key-value pair

#### Scenario: Agent has no annotations
- **WHEN** an Agent CR has no `metadata.annotations`
- **THEN** `request.agent.annotations` SHALL be an empty dict (not `None`)

---

### Requirement: Query annotations passed to executor
`ExecutionEngineRequest.query_annotations` SHALL be populated from the Query CR's
`metadata.annotations` when the request is built.

#### Scenario: Query has annotations
- **WHEN** a Query CR has `metadata.annotations` set
- **THEN** `request.query_annotations` SHALL contain those key-value pairs

#### Scenario: Query has no annotations
- **WHEN** a Query CR has no `metadata.annotations`
- **THEN** `request.query_annotations` SHALL be an empty dict

---

### Requirement: ExecutionEngine annotations passed to executor
`ExecutionEngineRequest.execution_engine_annotations` SHALL be populated from the ExecutionEngine CR's
`metadata.annotations` when the request is built.

#### Scenario: ExecutionEngine has annotations
- **WHEN** the ExecutionEngine CR referenced by the agent has `metadata.annotations` set
- **THEN** `request.execution_engine_annotations` SHALL contain those key-value pairs

#### Scenario: ExecutionEngine has no annotations
- **WHEN** the ExecutionEngine CR has no `metadata.annotations`
- **THEN** `request.execution_engine_annotations` SHALL be an empty dict

#### Scenario: ExecutionEngine CR unresolvable
- **WHEN** the ExecutionEngine CR cannot be fetched (e.g. RBAC denied, not found)
- **THEN** `request.execution_engine_annotations` SHALL be an empty dict and a warning SHALL be logged;
  the request SHALL NOT fail

---

### Requirement: Annotation values are passed as-is
Annotation values SHALL be passed as raw strings without parsing or transformation. Parsing is
the executor's responsibility.

#### Scenario: Annotation value contains JSON
- **WHEN** an annotation value is a JSON string
- **THEN** `request.agent.annotations["key"]` SHALL contain the raw JSON string, not a parsed object

---

### Requirement: RBAC for ExecutionEngine annotation resolution
The query controller's service account SHALL have `get` permission on `executionengines` in the
`ark.mckinsey.com` API group to resolve ExecutionEngine CR annotations.

#### Scenario: Controller reads ExecutionEngine CR
- **WHEN** the query controller builds an `ExecutionEngineRequest`
- **THEN** it SHALL be able to `get` the referenced ExecutionEngine CR without a permissions error
