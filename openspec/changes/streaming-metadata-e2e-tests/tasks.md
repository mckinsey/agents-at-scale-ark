## 1. Broker Route Change

- [x] 1.1 Add paginated JSON mode to `GET /stream/:query_name` in `services/ark-broker/ark-broker/src/routes/stream.ts` — when `watch` query param is not `true`, return `CompletionChunkBroker.paginate(params, queryId)` as JSON following the `/events/:query_id` pattern
- [x] 1.2 Add unit test for the new paginated JSON mode in `services/ark-broker/ark-broker/src/routes/stream.test.ts` — cover: chunks returned for known query, pagination params, empty query returns empty list, `?watch=true` still returns SSE

## 2. Test Infrastructure

- [x] 2.1 Create `tests/streaming-metadata/` directory with `README.md`
- [x] 2.2 Create `mock-llm-values.yaml` with streaming config (`streaming.chunkSize: 20`, `streaming.chunkIntervalMs: 10`), model list endpoint, and default echo rule
- [x] 2.3 Create `manifests/a00-rbac.yaml` with Role/RoleBinding for query test permissions

## 3. Test Manifests

- [x] 3.1 Create `manifests/a03-agent.yaml` — agent referencing the mock-llm model
- [x] 3.2 Create `manifests/a04-team.yaml` — sequential team with the agent as its single member
- [x] 3.3 Create `manifests/a05-query-model.yaml` — streaming-enabled query targeting model directly
- [x] 3.4 Create `manifests/a06-query-agent.yaml` — streaming-enabled query targeting agent
- [x] 3.5 Create `manifests/a07-query-team.yaml` — streaming-enabled query targeting team

## 4. Hurl Assertion Files

- [x] 4.1 Create `test-model.hurl` — assert chunk count >= 2, `ark.query` set, `ark.model` set, sequence numbers ordered, completion signaled
- [x] 4.2 Create `test-agent.hurl` — assert `ark.query` set, `ark.agent` matches agent name, `ark.target` set, `ark.model` set, completion signaled
- [x] 4.3 Create `test-team.hurl` — assert `ark.query` set, `ark.team` matches team name, `ark.agent` non-empty, `ark.model` set, completion signaled

## 5. Chainsaw Test

- [x] 5.1 Create `chainsaw-test.yaml` with setup step: helm install mock-llm, assert pre-deployed ark-broker and streaming ConfigMap, deploy hurl pod with 3 .hurl files, wait for model ready
- [x] 5.2 Add model streaming step: apply query-model, assert phase done, run test-model.hurl
- [x] 5.3 Add agent streaming step: apply agent + query-agent, assert phase done, run test-agent.hurl
- [x] 5.4 Add team streaming step: apply team + query-team, assert phase done, run test-team.hurl

## 6. Validation

- [x] 6.1 Run broker unit tests (`cd services/ark-broker/ark-broker && npm test`) to verify route change
- [ ] 6.2 Run chainsaw test locally (`chainsaw test tests/streaming-metadata/`) to verify full e2e flow
