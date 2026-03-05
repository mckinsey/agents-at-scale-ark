## Why

Chainsaw tests cover Kubernetes resource lifecycle (Query phase, response content) but have zero visibility into streaming chunks. The controller already wraps every chunk with `ark` metadata (query, session, target, team, agent, model, completedQuery) and sends them to ark-broker, but nothing validates this contract end-to-end. A regression in metadata attachment would go undetected until a consumer (dashboard, SDK client) breaks.

## What Changes

- Add a single top-level chainsaw test (`tests/streaming-metadata/`) that validates streaming chunk metadata across four query scenarios: model-target, agent-target, team-target, and error.
- Add a paginated JSON endpoint to ark-broker's stream route (`GET /stream/:query_name` without `?watch=true`) so Hurl can retrieve and assert on stored chunks per query. The data layer (`CompletionChunkBroker.paginate(params, queryId)`) already supports this — only the HTTP route is missing.
- Configure mock-llm with streaming enabled (`streaming.chunkSize`, `streaming.chunkIntervalMs`) so the controller uses `ChatCompletionStream` and produces real chunks.

## Capabilities

### New Capabilities
- `streaming-chunk-assertions`: E2e test suite validating that streaming chunks arriving at ark-broker carry correct ark metadata for model, agent, team, and error query paths.
- `broker-query-stream-endpoint`: Per-query paginated chunk retrieval on ark-broker (`GET /stream/:query_name` returning JSON).

### Modified Capabilities

## Impact

- `services/ark-broker/ark-broker/src/routes/stream.ts` — new route handler (~15 lines, follows existing events pattern)
- `tests/streaming-metadata/` — new test directory with chainsaw-test.yaml, mock-llm-values.yaml, 4 hurl files, manifests
- CI/CD — new test added to chainsaw test suite; requires ark-broker image to be built before running
