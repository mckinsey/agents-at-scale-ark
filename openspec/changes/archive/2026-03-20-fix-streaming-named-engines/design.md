# Design: Fix streaming timeout for named execution engines

## Decision: Where to check

ark-api (`openai.py`) makes two K8s API calls on the streaming hot path when the target is an agent with a named engine:

1. `ark_client.agents.a_get(agent_name)` — get the agent, check `executionEngine`
2. `ark_client.execution_engines.a_get(engine_name)` — get the engine, check annotation

This only happens when `stream=true` AND target type is `agent` AND the agent has a named engine (not `"a2a"`). Acceptable cost.

Alternative considered: propagate annotation from ExecutionEngine → Agent to avoid the second call. Rejected because the ExecutionEngine controller doesn't manage agents, and adding propagation adds complexity for minimal gain.

## Decision: Annotation on ExecutionEngine CR, not Agent

Streaming is a capability of the execution engine, not the agent. All agents using the same engine inherit the behavior. Consistent with how the system models capabilities.

## Decision: Default to no streaming

Named engines don't support streaming unless explicitly annotated. This is the safe default — the existing breakage is caused by assuming streaming works.

## ark-api logic change

```
chat_completions(request):
  ... create query ...

  if not request.stream:
    return poll_and_return()  # existing path

  # NEW: check if target can produce streaming chunks
  supports_streaming = await check_streaming_support(target, namespace)

  if not supports_streaming:
    # Poll for completion, wrap as single-chunk SSE
    completion = await watch_query_completion(...)
    sse_lines = create_single_chunk_sse_response(completion)
    return StreamingResponse(iter(sse_lines), ...)

  # Existing streaming proxy path
  streaming_config = await get_streaming_config(...)
  ...
```

```
async def check_streaming_support(target, namespace) -> bool:
  """Check if the target can produce streaming chunks to the broker."""
  if target.type != "agent":
    return True  # models, teams, tools go through completions engine

  async with with_ark_client(namespace, "v1alpha1") as ark_client:
    agent = await ark_client.agents.a_get(target.name)
    agent_spec = agent.to_dict().get("spec", {})
    engine_ref = agent_spec.get("executionEngine")

    if not engine_ref or engine_ref.get("name") in (None, "", "a2a"):
      return True  # completions engine handles streaming

    engine_name = engine_ref["name"]
    engine_namespace = engine_ref.get("namespace") or namespace

  async with with_ark_client(engine_namespace, "v1prealpha1") as ark_client:
    engine = await ark_client.execution_engines.a_get(engine_name)
    engine_annotations = engine.to_dict().get("metadata", {}).get("annotations", {}) or {}
    return engine_annotations.get("ark.mckinsey.com/streaming-supported") == "true"
```

## Streaming config check ordering

Current code checks streaming config AFTER deciding to stream. The new check should happen BEFORE the streaming config check, since it's a higher-level gate:

```
stream=true?
  → can target produce chunks? (NEW)
    → NO: poll + single-chunk SSE
    → YES: is streaming config available? (existing)
      → NO: poll + single-chunk SSE (existing fallback)
      → YES: proxy to broker (existing)
```
