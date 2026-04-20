## Why

External execution engines return responses via A2A but the broker never receives chunks, so the dashboard shows loading dots indefinitely and CLI streaming is broken for all non-completions engines. The fix belongs in the ark-sdk `ExecutorApp`, which already owns the A2A server lifecycle for external executors.

## What Changes

- `ExecutorApp` discovers the ark-broker endpoint from `ark-config-streaming` ConfigMap and sends a single OpenAI `chat.completion.chunk` after `execute_agent()` returns (Phase 1 — immediate unblock, no executor changes required)
- `BaseExecutor` gains a `stream_chunk()` method executors can call during `execute_agent()` to push tokens to the broker in real time (Phase 2 — opt-in, per executor)
- New `broker.py` module in ark-sdk providing `BrokerClient` and `discover_broker_url()`
- Chunk format: OpenAI `chat.completion.chunk` + `ark` metadata wrapper (same format the completions engine already produces)

## Capabilities

### New Capabilities
- `executor-broker-streaming`: `ExecutorApp` sends OpenAI-format completion chunks to the ark-broker after execution, enabling dashboard and CLI streaming for all external execution engines

### Modified Capabilities

## Impact

- `lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/executor_app.py` — broker chunk dispatch in `A2AExecutorAdapter._do_execute()`
- `lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/executor.py` — `stream_chunk()` on `BaseExecutor` (Phase 2)
- `lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/broker.py` — new file
- No controller changes, no Go changes, no existing executor changes
