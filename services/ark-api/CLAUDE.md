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

### Making changes
- After making changes run `make test`