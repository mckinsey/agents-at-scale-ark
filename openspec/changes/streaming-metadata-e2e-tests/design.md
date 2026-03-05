## Context

The Ark controller wraps every streaming chunk with `StreamMetadata` (`ark.query`, `ark.session`, `ark.target`, `ark.team`, `ark.agent`, `ark.model`) and sends them as NDJSON to ark-broker via `POST /stream/{query}`. The final chunk additionally carries `ark.completedQuery` with the full Query object. ark-broker stores all chunks verbatim in `CompletionChunkBroker`.

Today, `GET /stream/:query_name` only supports SSE mode (`?watch=true`). The data layer already supports `paginate(params, queryId?)` and `getByQuery(queryId)`, but there is no HTTP route for paginated JSON retrieval of chunks per query — the pattern that `/events/:query_id` already implements.

Chainsaw tests validate Query CR status but cannot observe streaming chunks. mock-llm supports streaming responses natively via `streaming.chunkSize` / `streaming.chunkIntervalMs` configuration.

## Goals / Non-Goals

**Goals:**
- Validate the full streaming metadata contract end-to-end: chunks arrive at ark-broker with correct `ark` metadata for model, agent, team, and error paths
- Expose per-query paginated chunk retrieval in ark-broker so tests (and future consumers) can inspect stored chunks
- Run within existing chainsaw CI infrastructure using mock-llm and Hurl

**Non-Goals:**
- Testing streaming latency or throughput
- Testing SSE consumer behavior (dashboard, SDK clients)
- Modifying the controller's streaming implementation
- Adding streaming tests to every existing query test

## Decisions

### 1. Single test directory with sequential query scenarios

**Decision:** One `tests/streaming-metadata/` directory with a single `chainsaw-test.yaml` that creates model, agent, team, and error queries sequentially, validating chunks after each.

**Alternative:** Separate test directories per scenario (`streaming-model-metadata/`, `streaming-agent-metadata/`, etc.).

**Rationale:** Each test requires helm-installing mock-llm + ark-broker + ark-tenant (~3 helm installs). A single test amortizes this setup cost. Sequential steps within one test still give clear failure identification per scenario via named steps and separate Hurl files.

### 2. Hurl for chunk assertions

**Decision:** Use Hurl test files executed from a pod against ark-broker's HTTP API.

**Alternative:** Shell scripts with `kubectl exec curl | jq`.

**Rationale:** Hurl is already established in the broker's own test (`services/ark-broker/test/`). Its `jsonpath` assertions are declarative, readable, and sufficient for validating metadata fields, counts, and ordering. Separate `.hurl` files per scenario keep assertions focused.

### 3. Add paginated JSON mode to `GET /stream/:query_name`

**Decision:** Modify `routes/stream.ts` so `GET /stream/:query_name` returns paginated JSON by default, and SSE only when `?watch=true` — matching the existing `/events/:query_id` pattern.

**Alternative:** Use `GET /stream?limit=1000` (global) and filter client-side in Hurl.

**Rationale:** Hurl cannot filter arrays by nested field values. The broker already has `CompletionChunkBroker.paginate(params, queryId)` — only the route is missing. Following the events pattern keeps the API consistent.

### 4. mock-llm with streaming enabled

**Decision:** Configure mock-llm with `streaming.chunkSize: 20` and `streaming.chunkIntervalMs: 10` so the OpenAI provider's `ChatCompletionStream` receives real SSE chunks.

**Alternative:** Try to test with non-streaming mock-llm responses.

**Rationale:** When `eventStream != nil`, the controller calls `ChatCompletionStream` which sends `stream: true` to the LLM. mock-llm must return SSE format in this case. mock-llm natively supports this via `streaming` config.

### 5. Error scenario via mock-llm HTTP 500

**Decision:** Add a mock-llm rule that returns HTTP 500 for a specific input pattern (e.g., `contains(body.messages[-1].content, 'trigger-error')`). The controller catches this, creates a `StreamingError`, wraps it with `WrapErrorWithMetadata`, and sends to broker.

**Alternative:** Use an invalid model reference to trigger controller-level errors.

**Rationale:** mock-llm HTTP 500 exercises the exact error-streaming code path in `StreamError()` at `streaming.go:161-173`. An invalid model reference would fail before streaming is set up.

## Risks / Trade-offs

- **[Risk] mock-llm streaming chunk count is non-deterministic** — The number of chunks depends on response length / chunkSize. → Mitigation: Assert `>= N` not `== N` for chunk counts. Assert metadata on first and last chunks rather than all.
- **[Risk] Helm install overhead** — Three helm installs add ~60-90s to test setup. → Mitigation: Acceptable for a single test. The streaming-metadata test is not in the fast-feedback loop.
- **[Risk] Broker route change could affect SSE consumers** — Adding JSON mode to `GET /stream/:query_name` changes default behavior from SSE to JSON. → Mitigation: Existing SSE consumers always send `?watch=true`. The new behavior matches `/events/:query_id` exactly. Existing broker unit tests cover SSE path.
- **[Risk] Team query metadata depends on which agent the team selects** — Cannot assert exact agent name for team queries. → Mitigation: Assert `ark.team` is set and `ark.agent` is non-empty, rather than a specific agent name.
