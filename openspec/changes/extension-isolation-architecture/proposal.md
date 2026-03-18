## Why

Extensions in Ark are inlined as bare constants in `ark/internal/a2a/a2a.go`. The controller and handler directly reference `QueryExtensionURI` / `QueryExtensionMetadataKey` and manually build/parse metadata maps. This couples extension semantics to the controller/handler implementation, preventing independent modification, versioning, or external extension support.

Only one extension exists today (`query/v1`). A second (`team-attribution/v1`) is designed but not yet implemented. Without an architectural home for extensions, adding new ones requires editing core controller and handler code.

## What Changes

- Define a common `Extension` interface (`URI()`, `MetadataKey()`, `Version()`, `ValidatePayload()`, etc.)
- Create a central `Registry` with `Register()`, `Get()`, `All()`, `AgentCardDeclarations()` for dependency injection
- Refactor `query/v1` constants from `a2a.go` into an isolated package implementing `Extension`
- Create `team-attribution/v1` extension package with payload schema and validation
- Update controller/handler to use registry lookups instead of direct constant references
- Add `ExternalExtension` adapter for schema-only extensions discovered from Agent Cards
- Mirror the pattern in the Python SDK with equivalent `Extension` protocol class and `Registry`
- Evaluate Go package location during implementation (open design question with trade-off criteria)

## Non-goals

- Changing extension wire format or metadata conventions
- Modifying Agent Card schema (extensions use existing `capabilities.extensions`)
- Dynamic plugin loading at runtime (extensions register at init time or via config)
- Behavioral changes to controller or handler (this step is a refactor-only foundation)

## Compatibility Contract

- Existing `QueryExtensionURI` and `QueryExtensionMetadataKey` constants remain as thin delegations during transition
- No change to extension wire format, metadata key conventions, or Agent Card declarations
- Controller and handler behavior is identical before and after migration to registry lookups
- External extensions participate via schema fetch and do not require Ark-side Go code

## Impact

- `ark/internal/a2a/a2a.go` — constants move to isolated packages; thin delegations remain temporarily
- New extension packages (location TBD) — `query/v1` and `team-attribution/v1`
- `ark/internal/controller/query_controller.go` — switch to registry-based extension lookups
- `ark/executors/completions/handler.go` — switch to registry-based extension lookups
- `lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/extensions/` — Python SDK parity
