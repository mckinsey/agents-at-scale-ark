## 1. Query Extension Schema

- [ ] 1.1 Create `ark/api/extensions/query/v1/status-schema.json` defining the status metadata structure (`state` required string, `message` optional string)
- [ ] 1.2 Add `QueryExtensionStatusKey` constant to `ark/internal/a2a/a2a.go` (`{QueryExtensionURI}/status`)
- [ ] 1.3 Update `ark/api/extensions/query/v1/README.md` to document bidirectional flow, the new `/status` metadata key, and wire format examples

## 2. Query CRD

- [ ] 2.1 Add `ExecutorStatus` struct (`State`, `Message`, `UpdatedAt`) to `ark/api/v1alpha1/query_types.go`
- [ ] 2.2 Add `ExecutorStatus *ExecutorStatus` field to `QueryStatus`
- [ ] 2.3 Run `make manifests` to regenerate CRDs from Go types

## 3. Operator A2A Dispatch

- [ ] 3.1 Verify `trpc-a2a-go` client supports `GetTask`/`tasks/get` — if not, implement or find alternative
- [ ] 3.2 Add status extraction function to `ark/internal/a2a/a2a.go` that reads `{QueryExtensionURI}/status` from Task status metadata and returns an `ExecutorStatus`
- [ ] 3.3 Modify `executeA2AAgentMessage` in `ark/internal/a2a/a2a.go` to send `SendMessage` with `blocking: false`
- [ ] 3.4 Update `extractResponseFromMessageResult` to handle non-terminal Task states (currently only handles `completed` and `failed`)
- [ ] 3.5 Implement `GetTask` poll loop in `ark/internal/controller/query_controller.go` — store task ID on first dispatch, poll on requeue, extract status and write to `Query.status.executorStatus`
- [ ] 3.6 Write unit tests for status extraction, non-blocking dispatch, and poll loop

## 4. Ark SDK

- [ ] 4.1 Add `ExecutorState` enum to `lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/executor.py` with values: `INITIALIZING`, `WORKING`, `COMPLETED`, `FAILED`, `CANCELED`
- [ ] 4.2 Add `report_status(state, message)` method to `BaseExecutor` that validates state against enum
- [ ] 4.3 Wire `report_status()` in `ExecutorApp` (`executor_app.py`) to set A2A Task status metadata at `{QueryExtensionURI}/status`
- [ ] 4.4 Write unit tests for `report_status()` including enum validation and metadata propagation

## 5. Dashboard

- [ ] 5.1 Update `queries-section.tsx` to read `executorStatus` from query status and display contextual subtitle under the phase badge when phase is `running`
- [ ] 5.2 Show executor status message (e.g., "Initializing session...") with appropriate styling
- [ ] 5.3 Verify no subtitle is shown when `executorStatus` is absent (backward compatibility)

## 6. Ark CLI

- [ ] 6.1 Update `chatClient.ts` polling path to read `executorStatus` from query status and display status line
- [ ] 6.2 Update streaming path to show executor status before chunks begin
- [ ] 6.3 Verify CLI falls back gracefully when `executorStatus` is not present

## 7. Fark CLI

- [ ] 7.1 Update `query_watcher.go` to watch for `executorStatus` field changes on the Query CR
- [ ] 7.2 Display executor status message in spinner text with elapsed timer (e.g., "Initializing session... (12s)")
- [ ] 7.3 Verify watcher falls back gracefully when `executorStatus` is not present

## 8. REST API

- [ ] 8.1 Verify `executorStatus` is exposed in query status responses (may work automatically if the field is on the Query CR and the API serializes full status)
- [ ] 8.2 Update OpenAI-compatible response format to include `executorStatus` in the `ark` extension object

## 9. Documentation

- [ ] 9.1 Update `docs/content/reference/resources/query.mdx` — document new `executorStatus` field in QueryStatus
- [ ] 9.2 Update `docs/content/reference/query-execution.mdx` — add intermediate status and polling to lifecycle description
- [ ] 9.3 Update `docs/content/developer-guide/building-execution-engines.mdx` — document `report_status()` contract and `ExecutorState` enum for executor implementers
- [ ] 9.4 Update `docs/content/developer-guide/queries/a2a-queries.mdx` — document intermediate status flow in A2A queries
- [ ] 9.5 Update `docs/content/developer-guide/cli-tools.mdx` — document executor status display in Fark
- [ ] 9.6 Update `docs/content/user-guide/dashboard.mdx` — document provisioning indicator
