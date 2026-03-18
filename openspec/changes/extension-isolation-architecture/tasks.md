## Tasks

### 1. Extension interface and Registry types

- [ ] Define `Extension` interface
- [ ] Define `Registry` type with `Register()`, `Get()`, `All()`, `URIs()`, `AgentCardDeclarations()`, `ValidatePayloadFor()`
- [ ] Define `Default` global registry instance
- [ ] Add `BuildMetadataKey()`, `MarshalPayload()`, `UnmarshalPayload()` helpers
- [ ] Unit tests for Registry (register, get, list, duplicate registration)

### 2. Refactor query/v1 into isolated package

- [ ] Create isolated package implementing `Extension` for `query/v1`
- [ ] Move `QueryExtensionURI`, `QueryExtensionMetadataKey` from `ark/internal/a2a/a2a.go` into the new package
- [ ] Add `QueryRef` struct and `ExtractQueryRef()` helper
- [ ] Auto-register via `init()` into the default registry
- [ ] Replace direct constant references in `a2a.go` with delegations to the package (behavioral no-op)
- [ ] Verify existing chainsaw and unit tests pass without modification

### 3. Create team-attribution/v1 extension

- [ ] Create isolated package implementing `Extension` for `team-attribution/v1`
- [ ] Define `TeamAttribution` payload struct (`member.name`, `member.type`, `member.path`)
- [ ] Add `schema.json` with JSON Schema definition
- [ ] Add `README.md` with extension specification (URI, wire format, Agent Card declaration)
- [ ] Auto-register via `init()` into the default registry
- [ ] Unit tests for payload validation

### 4. Update controller/handler to use registry

- [ ] Controller: replace direct `QueryExtensionURI` / `QueryExtensionMetadataKey` references with `registry.Get()` calls
- [ ] Handler: replace direct constant references with registry lookups
- [ ] Inject registry into controller and handler constructors
- [ ] Verify all existing tests pass (no behavioral change)

Note: `registry.AgentCardDeclarations()` is exposed by task 1 (Registry type). Controller-side capability verification integration (Agent Card discovery, comparison, `soft_fail_warn` telemetry) is owned by `controller-response-boundary` (Step 3) tasks 7.1-7.3. Escalation threshold governance is owned by `compat-lifecycle-management` (Step 9) task 7.4.

### 5. External extension adapter

- [ ] Define `ExternalExtension` struct implementing `Extension` from discovered URI + JSON Schema
- [ ] Implement schema fetch from extension URI with timeout and caching
- [ ] `ValidatePayload` delegates to fetched JSON Schema
- [ ] Invalid schema or fetch failure emits `soft_fail_warn` telemetry
- [ ] Unit tests with mock HTTP server for schema fetch

### 6. Python SDK parity

- [ ] Define `Extension` protocol class in `ark_sdk/extensions/__init__.py`
- [ ] Define `Registry` class with `register()`, `get()`, `all_uris()`, `validate_payload()`
- [ ] Create `ark_sdk/extensions/query/v1.py` implementing `Extension`
- [ ] Create `ark_sdk/extensions/team_attribution/v1.py` implementing `Extension`
- [ ] Create `ark_sdk/extensions/external.py` external extension adapter
- [ ] Unit tests for registry and built-in extensions

### 7. Risk-tracked actions

- [ ] 7.1 Resolve `ExecutionContextExtensionURI` disposition: promote to canonical inventory (add to registry with semantic-gap rationale) or remove from staged language and document rationale
