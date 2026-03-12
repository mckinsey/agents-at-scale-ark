# Ark Query Engine Iteration 2 — Tasks

## 1. Fix EventStream lifecycle in engine

- In `handler.go`, add `defer` cleanup for EventStream after creation
- After execution completes successfully: call `NotifyCompletion(ctx)` then `Close()`
- On execution error: call `StreamError()` then `NotifyCompletion(ctx)` then `Close()`
- Remove `createEventStreamIfNeeded()` and `finalizeEventStream()` calls from controller's `executeQueryAsync`

## 2. Move OTEL telemetry to engine

- In `handler.go ProcessMessage`, add telemetry span creation using `telemetry.Provider`
- Create root `query/execute` span with query name, session ID, target info
- Create child `target/{type}/{name}` span around execution
- Record input, output, token usage, errors on spans
- Remove all `r.Telemetry.QueryRecorder()` calls from controller's `executeQueryAsync`
- Keep eventing recorder calls in controller (they're for K8s events, not OTEL)

## 3. Return token usage and conversationId in A2A response

- In `handler.go`, after execution collect token usage from eventing recorder
- Get conversationId from memory client (if HTTPMemory, call `GetConversationID()`)
- Add both to response message metadata under `ark.mckinsey.com/execution-engine` key
- In controller's `executeViaEngine`, parse token usage and conversationId from A2A response metadata
- Write `Query.Status.TokenUsage` and `Query.Status.ConversationId` from parsed values

## 4. DevSpace separate pods for engine

- Add `ark-query-engine` image definition to `ark/devspace.yaml`
- Add separate deployment for query engine (simple pod with go run)
- Add K8s Service for query engine in dev namespace
- Add `dev.ark-query-engine` entry with independent sync and restart
- Update controller's dev command to use `--query-engine-addr=http://ark-query-engine:9090`
- Remove the double `go run` hack from controller's dev command
- Keep `queryEngine.enabled: false` in Helm values for dev (sidecar not needed)

## 5. Verify streaming end-to-end

- Deploy to local cluster with devspace
- Send query via dashboard, verify chunks stream without message loss
- Verify previous messages persist when new response arrives
- Verify `data: [DONE]` is sent after stream completes
- Verify no duplicate EventStream connections in ark-broker logs

## Success Criteria

- [x] Dashboard streaming works without losing previous messages
- [x] OTEL traces owned by engine (controller telemetry removed)
- [x] Token usage returned in A2A response metadata, written to Query CR status
- [x] ConversationId returned in A2A response metadata, written to Query CR status
- [x] DevSpace restarts engine independently from controller
