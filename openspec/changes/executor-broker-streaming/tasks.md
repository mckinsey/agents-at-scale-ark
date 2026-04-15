## 1. Phase 1 — broker.py

- [ ] 1.1 Create `ark_sdk/broker.py` with `discover_broker_url(namespace)` using existing `get_streaming_config` + `get_streaming_base_url` from `streaming_config.py`
- [ ] 1.2 Implement `BrokerClient(base_url, query_name, session_id, agent_name)` with `send_chunk(content, finish_reason)` and `complete()`
- [ ] 1.3 Ensure all broker errors are caught, logged at WARNING, and never propagate

## 2. Phase 1 — ExecutorApp integration

- [ ] 2.1 After `execute_agent()` returns in `A2AExecutorAdapter._do_execute()`, call `discover_broker_url()` and create `BrokerClient` if configured
- [ ] 2.2 POST single `chat.completion.chunk` with full response content and `finish_reason: "stop"`
- [ ] 2.3 POST completion signal to `/stream/{query_name}/complete`

## 3. Phase 1 — Tests

- [ ] 3.1 Unit test `BrokerClient.send_chunk` sends correct OpenAI chunk format
- [ ] 3.2 Unit test `BrokerClient.complete` hits correct URL
- [ ] 3.3 Unit test broker errors are swallowed and do not raise
- [ ] 3.4 Unit test `A2AExecutorAdapter` sends chunk to broker when configured
- [ ] 3.5 Unit test `A2AExecutorAdapter` skips broker when not configured

## 4. Phase 2 — stream_chunk() on BaseExecutor

- [ ] 4.1 Add `_broker_client` attribute and `stream_chunk(chunk)` method to `BaseExecutor`
- [ ] 4.2 Inject `BrokerClient` into executor before calling `execute_agent()` in `A2AExecutorAdapter`
- [ ] 4.3 Call `complete()` after `execute_agent()` returns; skip single-chunk fallback if `stream_chunk()` was called during execution
- [ ] 4.4 Unit test executor that calls `stream_chunk()` sends incremental chunks and skips final single-chunk fallback
- [ ] 4.5 Unit test executor that does not call `stream_chunk()` still gets single-chunk fallback
