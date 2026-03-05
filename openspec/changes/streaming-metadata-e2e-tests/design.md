## Context

The Ark controller wraps every streaming chunk with `StreamMetadata` (`ark.query`, `ark.session`, `ark.target`, `ark.team`, `ark.agent`, `ark.model`) and sends them as NDJSON to ark-broker via `POST /stream/{query}`. The final chunk additionally carries `ark.completedQuery` with the full Query object. ark-broker stores all chunks verbatim in `CompletionChunkBroker`.

Today, `GET /stream/:query_name` only supports SSE mode (`?watch=true`). The data layer already supports `paginate(params, queryId?)` and `getByQuery(queryId)`, but there is no HTTP route for paginated JSON retrieval of chunks per query — the pattern that `/events/:query_id` already implements.

Chainsaw tests validate Query CR status but cannot observe streaming chunks. mock-llm supports streaming responses natively via `streaming.chunkSize` / `streaming.chunkIntervalMs` configuration.

## Goals / Non-Goals

**Goals:**
- Validate the full streaming metadata contract end-to-end: chunks arrive at ark-broker with correct `ark` metadata for model, agent, and team paths
- Expose per-query paginated chunk retrieval in ark-broker so tests (and future consumers) can inspect stored chunks
- Run within existing chainsaw CI infrastructure using mock-llm and Hurl
- Assume ark-broker with streaming is pre-deployed in default namespace (by CI setup)

**Non-Goals:**
- Testing streaming latency or throughput
- Testing SSE consumer behavior (dashboard, SDK clients)
- Modifying the controller's streaming implementation
- Adding streaming tests to every existing query test
- Error chunk metadata testing (deferred to a follow-up)

## Decisions

### 1. Single test directory with sequential query scenarios

**Decision:** One `tests/streaming-metadata/` directory with a single `chainsaw-test.yaml` that creates model, agent, and team queries sequentially, validating chunks after each.

**Alternative:** Separate test directories per scenario.

**Rationale:** A single test amortizes mock-llm setup cost. Sequential steps within one test still give clear failure identification per scenario via named steps and separate Hurl files.

### 2. Hurl for chunk assertions

**Decision:** Use Hurl test files executed from a pod against ark-broker's HTTP API.

**Alternative:** Shell scripts with `kubectl exec curl | jq`.

**Rationale:** Hurl is already established in the broker's own test (`services/ark-broker/test/`). Its `jsonpath` assertions are declarative, readable, and sufficient for validating metadata fields, counts, and ordering.

### 3. Add paginated JSON mode to `GET /stream/:query_name`

**Decision:** Modify `routes/stream.ts` so `GET /stream/:query_name` returns paginated JSON by default, and SSE only when `?watch=true` — matching the existing `/events/:query_id` pattern.

**Alternative:** Use `GET /stream?limit=1000` (global) and filter client-side in Hurl.

**Rationale:** Hurl cannot filter arrays by nested field values. The broker already has `CompletionChunkBroker.paginate(params, queryId)` — only the route is missing. Following the events pattern keeps the API consistent.

### 4. mock-llm with streaming enabled

**Decision:** Configure mock-llm with `streaming.chunkSize: 20` and `streaming.chunkIntervalMs: 10` so the OpenAI provider's `ChatCompletionStream` receives real SSE chunks.

**Alternative:** Try to test with non-streaming mock-llm responses.

**Rationale:** When `eventStream != nil`, the controller calls `ChatCompletionStream` which sends `stream: true` to the LLM. mock-llm must return SSE format in this case. mock-llm natively supports this via `streaming` config.

### 5. Pre-deployed ark-broker in default namespace

**Decision:** The test assumes ark-broker with streaming enabled is already deployed. It does not helm-install the broker itself.

**Alternative:** Helm-install ark-broker within the test.

**Rationale:** In CI, ark-broker is deployed during cluster setup. Installing it per-test adds complexity (image building, pull policies). The test only needs to assert the broker deployment and streaming ConfigMap exist.

## Risks / Trade-offs

- **[Risk] mock-llm streaming chunk count is non-deterministic** — The number of chunks depends on response length / chunkSize. → Mitigation: Assert `>= N` not `== N` for chunk counts. Assert metadata on first and last chunks rather than all.
- **[Risk] Broker route change could affect SSE consumers** — Adding JSON mode to `GET /stream/:query_name` changes default behavior from SSE to JSON. → Mitigation: Existing SSE consumers always send `?watch=true`. The new behavior matches `/events/:query_id` exactly. Existing broker unit tests cover SSE path.
- **[Risk] Team query metadata depends on which agent the team selects** — Cannot assert exact agent name for team queries. → Mitigation: Assert `ark.team` is set and `ark.agent` is non-empty, rather than a specific agent name.
