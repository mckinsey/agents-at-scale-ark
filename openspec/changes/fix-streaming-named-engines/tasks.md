# Tasks

## 1. Add streaming-supported annotation constant (Go)
- File: `ark/internal/annotations/annotations.go`
- Add `StreamingSupported = ARKPrefix + "streaming-supported"` to a new or existing annotation group

## 2. Add streaming-supported annotation constant (Python)
- File: `services/ark-api/ark-api/src/ark_api/constants/annotations.py`
- Add `STREAMING_SUPPORTED_ANNOTATION = "ark.mckinsey.com/streaming-supported"`

## 3. Add check_streaming_support helper in ark-api
- File: `services/ark-api/ark-api/src/ark_api/api/v1/openai.py` (or a new util)
- Fetch agent → check executionEngine → fetch ExecutionEngine CR → check annotation
- Return bool indicating whether the target can produce streaming chunks

## 4. Update chat_completions to use the helper
- File: `services/ark-api/ark-api/src/ark_api/api/v1/openai.py`
- After query creation, before streaming decision: call `check_streaming_support`
- If not supported: poll + `create_single_chunk_sse_response` (reuse existing fallback logic)
- If supported: existing streaming proxy path

## 5. Add tests for the new behavior
- File: `services/ark-api/ark-api/tests/api/test_routes.py` (or new test file)
- Test: agent with named engine, no annotation → falls back to polling
- Test: agent with named engine, annotation=true → streams normally
- Test: agent with no engine / engine=a2a → streams normally
- Test: non-agent targets → streams normally

## 6. Update execution engine documentation
- File: `docs/content/developer-guide/building-execution-engines.mdx`
- Document the `streaming-supported` annotation
- Explain default behavior (no streaming) and how to opt in

## 7. Update langchain engine documentation
- File: `docs/content/developer-guide/langchain-execution-engine.mdx`
- Note that the langchain engine does not support streaming
