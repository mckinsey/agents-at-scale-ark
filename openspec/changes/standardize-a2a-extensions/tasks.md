## 1. Library Upgrades

- [x] 1.1 Bump `trpc-a2a-go` from v0.2.4 to v0.2.5 in `ark/go.mod`
- [x] 1.2 Bump `a2a-sdk` from ≥0.2.12 to ≥0.3.0 in Python SDK dependencies
- [x] 1.3 Run camelCase → snake_case migration across Python SDK overlay using upstream migration script
- [x] 1.4 Verify existing tests pass after library upgrades

## 2. Extension Schema

- [x] 2.1 Create `ark/api/extensions/query/v1/schema.json` with QueryRef JSON Schema (`$id` set to GitHub URI)
- [x] 2.2 Create `ark/api/extensions/query/v1/README.md` documenting the extension (URI, metadata key, usage)

## 3. Python SDK Extension Module

- [x] 3.1 Create `lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/extensions/__init__.py` exporting QueryRef helpers
- [x] 3.2 Create `lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/extensions/query.py` with `extract_query_ref()` and `resolve_query()` functions
- [x] 3.3 Update `executor_app.py` to use `extensions/query.py` instead of raw metadata blob extraction
- [x] 3.4 Have `ExecutorApp` automatically declare the query extension in the agent card's `capabilities.extensions`
- [x] 3.5 Export `BaseExecutor`, `ExecutorApp`, `ExecutionEngineRequest` and related types from package root or documented submodule

## 4. Go Sender Changes

- [x] 4.1 Update `query_controller.go` `executeViaEngine` to send QueryRef extension instead of full metadata blob
- [x] 4.2 Update `execution_engine.go` to forward QueryRef extension to named engines instead of serialized agent/tools/history
- [x] 4.3 Update `a2a_execution.go` to optionally attach QueryRef extension when calling A2A agents
- [x] 4.4 Add `X-A2A-Extensions` header handling to outbound A2A requests

## 5. Cleanup

- [x] 5.1 Remove old `ark.mckinsey.com/execution-engine` metadata blob construction from `query_controller.go`
- [x] 5.2 Remove old metadata blob construction from `execution_engine.go`
- [x] 5.3 Remove old metadata blob parsing from `executor_app.py`
- [x] 5.4 Remove or deprecate `ARK_METADATA_KEY` constant and associated types that are no longer used

## 6. References and Comments

- [x] 6.1 Add reference comment to `query_controller.go` pointing to `ark/api/extensions/query/v1/`
- [x] 6.2 Add reference comment to `execution_engine.go` pointing to `ark/api/extensions/query/v1/`
- [x] 6.3 Add reference comment to `a2a_execution.go` pointing to `ark/api/extensions/query/v1/`
- [x] 6.4 Add reference docstring to `extensions/query.py` pointing to `ark/api/extensions/query/v1/`

## 7. Documentation

- [x] 7.1 Create `docs/content/developer-guide/building-execution-engines.mdx` with BaseExecutor quickstart and extension spec reference
- [x] 7.2 Update `docs/content/developer-guide/building-a2a-servers.mdx` to cross-reference the new executor guide

## 8. Testing

- [x] 8.1 Add Go unit tests for QueryRef extension metadata construction
- [x] 8.2 Add Python unit tests for `extract_query_ref()` and `resolve_query()`
- [x] 8.3 Add Python unit test verifying `ExecutorApp` agent card includes query extension
- [x] 8.4 Verify no production code references `ark.mckinsey.com/execution-engine`
