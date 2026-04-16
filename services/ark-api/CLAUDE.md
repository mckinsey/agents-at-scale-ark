## Ark API

Python/FastAPI REST gateway for Ark resources. Wraps the Kubernetes API with auth, streaming, and broker integration.

### Route Modules (`src/ark_api/api/v1/`)
- **Core resources**: agents, models, teams, tools, queries, secrets, memories, mcp_servers, namespaces
- **A2A protocol**: a2a_gateway, a2a_servers, a2a_tasks
- **Broker integration**: broker (SSE streaming for traces, messages, events, chunks), conversations
- **Utilities**: export, events, api_keys, proxy, resources, file_preview, system_info, ark_services

### Guidelines
- Put all imports at the top, never import inline
- Only look in the current directory or children unless told explicitly otherwise
- All routes should be async where possible
- All routes go in `src/ark_api/api/v1`
- All pydantic models go in `src/ark_api/models`
- Use the `handle_k8s_errors` decorator for error handling
- Use the `with_ark_client` async context manager to create an ark-client, but not for secrets
- Pass the version and namespace to `with_ark_client`
- The sync and async functions on the ark client have the same signatures, the async ones start with `a_`

### Exception handling

**Never hide exceptions.** If something goes wrong, let it propagate and crash loudly. Silent failures are harder to debug than loud ones.

A fallback (returning a default value on error) is only acceptable when:
- The caller has explicitly designed for a degraded/default state
- The absence of data is a valid, expected runtime condition (e.g. optional config, missing optional resource)
- The default value is semantically correct and safe to use

In all other cases, raise or re-raise — do not swallow the exception.

```python
# BAD — hides misconfiguration, returns wrong data silently
try:
    result = fetch_something()
    return result
except Exception as e:
    logger.warning(f"Failed: {e}")
    return {}

# GOOD — let it propagate
result = fetch_something()
return result

# GOOD — explicit fallback only when the absence is a valid state
ee_ref = getattr(agent.spec, "execution_engine", None)
if not ee_ref:
    return {}  # no execution engine configured — valid case, not an error
ee = await fetch_execution_engine(ee_ref.name)  # let this raise if it fails
```

- No `try/except` blocks that return default values unless absence is a designed-for condition
- Crash hard and early — a clear exception at the source is always better than a silent wrong result downstream
- Logging a warning and continuing is not acceptable as a substitute for proper error handling

### Making changes
- After making changes run `make test`