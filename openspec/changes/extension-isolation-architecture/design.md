## Context

Extensions in Ark are currently inlined as bare constants in `ark/internal/a2a/a2a.go`. The controller and handler directly reference `QueryExtensionURI` / `QueryExtensionMetadataKey` and manually build/parse metadata maps. This couples extension semantics to the controller/handler implementation and prevents independent modification, versioning, or external extension support.

Only one extension exists today (`query/v1`). A second (`team-attribution/v1`) is designed but not yet implemented. The accepted extension contract defines URI conventions, capability verification, and a minimal inventory, but has no architectural home that isolates extensions from each other or from core code.

## Goals / Non-Goals

**Goals:**

- Each extension is a self-contained Go package with its own types, schema, and validation
- A common `Extension` interface defines what every extension must provide
- A central `Registry` decouples consumers (controller, handler, verifier) from individual extension packages
- External extensions can participate via schema-only adapters without custom Go logic
- Multiple extension versions can coexist in the registry simultaneously
- Python SDK mirrors the same isolation pattern

**Non-Goals:**

- Changing extension wire format or metadata conventions (already defined)
- Modifying Agent Card schema (extensions use existing `capabilities.extensions`)
- Dynamic plugin loading at runtime (extensions register at init time or via config)

## Decisions

### 1. Extension interface contract

**Decision**: Define an `Extension` interface that each extension must implement: `URI()`, `MetadataKeySuffix()`, `MetadataKey()`, `Version()`, `Required()`, `Description()`, and `ValidatePayload(payload any) error`.

**Rationale**: A common interface allows the registry, controller, handler, and capability verifier to work with any extension without importing its package directly. `ValidatePayload` provides schema validation at boundaries.

### 2. Central registry with dependency injection

**Decision**: Define a `Registry` type in the same package with `Register()`, `Get()`, `All()`, `URIs()`, `AgentCardDeclarations()`, and `ValidatePayloadFor()`. Built-in extensions auto-register via `init()`. Controller and handler receive the registry as a dependency.

**Rationale**: The registry decouples consumers from extension packages. Adding or removing an extension requires no changes to controller or handler code. Dependency injection makes testing with custom extension sets straightforward.

### 3. Per-extension package layout

**Decision**: Each extension lives in a directory-versioned package containing `extension.go` (implements `Extension`), `schema.json` (payload schema), and `README.md` (extension specification including URI, wire format, Agent Card declaration).

The Go package location is an open design question to be evaluated during implementation. Options under consideration:

- `ark/api/extensions/{name}/v{n}/` — public API surface, importable by external consumers
- `ark/internal/extensions/{name}/v{n}/` — internal only, prevents external import
- `ark/pkg/extensions/{name}/v{n}/` — shared package convention

Selection criteria: whether external Go consumers need to import extension types, how the import path affects SDK generation, and alignment with existing `ark/api/` vs `ark/internal/` conventions.

**Rationale**: Directory-based versioning allows multiple versions to coexist. Co-locating schema and spec with Go code keeps each extension self-documenting.

### 4. Refactor query/v1 into isolated package

**Decision**: Move URI, metadata key, and description from `ark/internal/a2a/a2a.go` constants into the new isolated package as method returns on a `QueryExtension` type. Add a `QueryRef` struct and `ExtractQueryRef` helper. The existing constants in `a2a.go` become thin delegations (or are removed once controller/handler use the registry).

**Rationale**: This is the minimum refactor to prove the isolation pattern with no behavioral change.

### 5. External extension adapter

**Decision**: Define an `ExternalExtension` adapter type that wraps a discovered URI + fetched JSON Schema into the `Extension` interface. External extensions are discovered from Agent Card `capabilities.extensions` declarations and registered in the registry. `ValidatePayload` delegates to the fetched schema.

**Rationale**: External extensions need to participate in capability verification and metadata handling without requiring Ark-side Go code. A schema-only adapter provides validation and registry integration with no compile-time dependency.

### 6. Python SDK parity

**Decision**: Mirror the isolation in the Python SDK with a base `Extension` protocol class (defining `uri`, `metadata_key`, `validate_payload`), a `Registry` class, and per-extension submodules (`query/v1`, `team_attribution/v1`). An external extension adapter provides schema-only validation.

**Rationale**: SDK consumers need the same extension isolation. Consistent patterns across Go and Python reduce cognitive overhead for engine authors.

### 7. Versioning via directory path

**Decision**: Each extension package is versioned by its directory path (`v1`, `v2`, etc.). Multiple versions can be registered simultaneously. Version negotiation uses Agent Card `capabilities.extensions` declarations. URI includes version segment.

**Rationale**: Directory-based versioning is the Go convention for major versions. URI-embedded versions align with A2A extension URI conventions. Coexistence supports mixed-deployment scenarios where different engines support different extension versions.

## Sequencing

This is Step 1 in the staged roadmap — a foundation pre-step with no behavioral change:

1. Extension interface and Registry types (pure addition)
2. Refactor `query/v1` into isolated package (behavioral no-op; constants delegate)
3. Create `team-attribution/v1` package (pure addition; not yet consumed)
4. Update controller/handler to use registry (behavioral no-op; same URIs/keys)
5. External extension adapter (pure addition; not yet consumed)
6. Python SDK parity (pure addition)

Sub-steps 1-3 can proceed in parallel. Sub-step 4 depends on 1-2. Sub-steps 5-6 are independent.

## Risks / Trade-offs

**[Migration surface]** — Refactoring query/v1 touches controller and handler import paths. Mitigation: constants in `a2a.go` remain as thin delegations during transition; no behavioral change.

**[Registry overhead]** — Adding a registry layer for two extensions may seem premature. Mitigation: the registry is lightweight (map + interface) and the architecture is needed for capability verification and external extension support regardless of current inventory size.

**[External schema trust]** — Fetched JSON Schemas from external URIs could be malformed. Mitigation: schema fetch failures are logged; external extensions with invalid schemas fail `ValidatePayload` but do not block dispatch (consistent with `soft_fail_warn` policy).

**[Package location]** — The directory choice affects import visibility and SDK generation. Mitigation: evaluate trade-offs during Step 1 implementation against the criteria documented in Decision 3.
