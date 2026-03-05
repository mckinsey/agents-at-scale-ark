## 1. Broker Route Change

- [ ] 1.1 Add paginated JSON mode to `GET /stream/:query_name` in `services/ark-broker/ark-broker/src/routes/stream.ts` — when `watch` query param is not `true`, return `CompletionChunkBroker.paginate(params, queryId)` as JSON following the `/events/:query_id` pattern
- [ ] 1.2 Add unit test for the new paginated JSON mode in `services/ark-broker/ark-broker/src/routes/stream.test.ts` — cover: chunks returned for known query, pagination params, empty query returns empty list, `?watch=true` still returns SSE

## 2. Test Infrastructure

- [ ] 2.1 Create `tests/streaming-metadata/` directory with `README.md`
- [ ] 2.2 Create `mock-llm-values.yaml` with streaming config (`streaming.chunkSize: 20`, `streaming.chunkIntervalMs: 10`), model list endpoint, default echo rule, and error-triggering rule (HTTP 500 for input containing `trigger-error`)
- [ ] 2.3 Create `manifests/a00-rbac.yaml` with Role/RoleBinding for query test permissions

## 3. Test Manifests

- [ ] 3.1 Create `manifests/a03-agent.yaml` — agent referencing the mock-llm model
- [ ] 3.2 Create `manifests/a04-team.yaml` — sequential team with the agent as its single member
- [ ] 3.3 Create `manifests/a05-query-model.yaml` — streaming-enabled query targeting model directly
- [ ] 3.4 Create `manifests/a06-query-agent.yaml` — streaming-enabled query targeting agent
- [ ] 3.5 Create `manifests/a07-query-team.yaml` — streaming-enabled query targeting team
- [ ] 3.6 Create `manifests/a08-query-error.yaml` — streaming-enabled query with input `trigger-error` targeting agent
- [ ] 3.7 Create `manifests/a09-agent-error.yaml` — agent for the error scenario (same model, different name for isolation)

## 4. Hurl Assertion Files

- [ ] 4.1 Create `test-model.hurl` — assert chunk count >= 2, `ark.query` matches, `ark.model` set, `ark.agent` empty, `ark.team` empty, last chunk has `ark.completedQuery`, sequence numbers ordered
- [ ] 4.2 Create `test-agent.hurl` — assert `ark.query` matches, `ark.agent` matches agent name, `ark.target` matches, `ark.model` set, last chunk has `ark.completedQuery`
- [ ] 4.3 Create `test-team.hurl` — assert `ark.query` matches, `ark.team` matches team name, `ark.agent` non-empty, `ark.model` set, last chunk has `ark.completedQuery`
- [ ] 4.4 Create `test-error.hurl` — assert at least one chunk exists, chunk has `error` field, chunk has `ark.query` matching query name

## 5. Chainsaw Test

- [ ] 5.1 Create `chainsaw-test.yaml` with setup step: helm install mock-llm, helm install ark-broker, helm install ark-tenant, deploy hurl pod with all 4 .hurl files, wait for model/broker/hurl pod ready
- [ ] 5.2 Add model streaming step: apply query-model, assert phase done, run test-model.hurl
- [ ] 5.3 Add agent streaming step: apply agent + query-agent, assert phase done, run test-agent.hurl
- [ ] 5.4 Add team streaming step: apply team + query-team, assert phase done, run test-team.hurl
- [ ] 5.5 Add error streaming step: apply agent-error + query-error, assert phase error, run test-error.hurl

## 6. Validation

- [ ] 6.1 Run broker unit tests (`cd services/ark-broker/ark-broker && npm test`) to verify route change
- [ ] 6.2 Run chainsaw test locally (`chainsaw test tests/streaming-metadata/`) to verify full e2e flow
