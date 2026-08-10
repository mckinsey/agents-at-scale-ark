## ADDED Requirements

### Requirement: ExecutorApp sends completion chunk to broker after execute_agent

The Python SDK `ExecutorApp` SHALL discover the ark-broker streaming endpoint from the `ark-config-streaming` ConfigMap and, after `execute_agent()` returns, POST a single OpenAI-format `chat.completion.chunk` containing the full response to `/stream/{query_name}`, followed by a completion signal to `/stream/{query_name}/complete`. Broker errors SHALL be logged and swallowed — broker unavailability SHALL NOT fail the query or the A2A response.

#### Scenario: Broker is configured and executor returns a response

- **WHEN** `execute_agent()` returns successfully and `ark-config-streaming` ConfigMap exists with `enabled: "true"`
- **THEN** the SDK POSTs one ndjson chunk to `/stream/{query_name}` in OpenAI `chat.completion.chunk` format with `finish_reason: "stop"` and `ark` metadata containing `query`, `session`, and `agent` fields
- **AND** the SDK POSTs `{}` to `/stream/{query_name}/complete`
- **AND** the A2A response message is still enqueued normally

#### Scenario: Broker is not configured

- **WHEN** `execute_agent()` returns and the `ark-config-streaming` ConfigMap is absent or `enabled` is not `"true"`
- **THEN** no broker HTTP calls are made
- **AND** execution proceeds normally

#### Scenario: Broker POST fails

- **WHEN** the broker service is unreachable or returns a non-2xx status
- **THEN** the error is logged at WARNING level
- **AND** the A2A response is still enqueued and the query completes successfully

### Requirement: ExecutorApp supports real-time streaming via stream_chunk()

The `BaseExecutor` SHALL expose a `stream_chunk(chunk: str)` method. `ExecutorApp` SHALL inject a `BrokerClient` instance into the executor before calling `execute_agent()` when the broker is configured, enabling executors to call `self.stream_chunk(token)` as content is generated. When `stream_chunk()` is called during execution, each chunk SHALL be POSTed to `/stream/{query_name}` individually. After `execute_agent()` returns, `ExecutorApp` SHALL call `/stream/{query_name}/complete`. Executors that never call `stream_chunk()` fall through to the Phase 1 single-chunk behaviour.

#### Scenario: Executor streams tokens during execution

- **WHEN** `execute_agent()` calls `self.stream_chunk(token)` one or more times during execution
- **THEN** each token is POSTed to `/stream/{query_name}` as a `chat.completion.chunk` with `finish_reason: null`
- **AND** after `execute_agent()` returns, `/stream/{query_name}/complete` is called
- **AND** the dashboard receives incremental content as tokens arrive

#### Scenario: Executor does not call stream_chunk()

- **WHEN** `execute_agent()` completes without calling `self.stream_chunk()`
- **THEN** `ExecutorApp` falls back to sending a single chunk with the full response content and `finish_reason: "stop"`
