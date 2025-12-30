## ARK API

### General guidelines
- Put all imports at the top, never import inline
- unpack the ark sdk whl file for guidance on the types.  do not look outside this directory
- only look in the current directory or children unless told explicitly otherwise

### Routes and models
- All routes should be async where possible
- All routes should go in src/ark_api/api/v1
- All pydantic models should go in src/ark_api/models
- Use the handle_k8s_errors decorator for error handling if possible

### Pydantic model naming (CRITICAL)
Pydantic model class names MUST be globally unique across all model files. When multiple files define classes with the same name (e.g., `ConfigMapKeyRef`, `Header`, `ValueFrom`), FastAPI generates non-deterministic OpenAPI schema names like `ark_api__models__agents__Header-Input`. These names depend on import order and cause CI failures when `types.ts` differs between environments.

**Solution**: Prefix class names with their domain context:
- `agents.py`: `AgentHeader`, `AgentValueFrom`, `AgentParameter`
- `evaluators.py`: `EvaluatorParameter`, `EvaluatorValueSource`
- `mcp_servers.py`: `MCPServerHeader`, `MCPServerValueSource`
- `queries.py`: `QueryParameter`, `QueryLabelSelector`

See: https://github.com/mckinsey/agents-at-scale-ark/issues/656

### Ark client usage
- Use the with_ark_client async context manager to create an ark-client, but not for secrets
- pass the version and namespace to the with_ark_client
- The sync and async functions on the ark client have the same signatures, the async ones start with a_
- bias towards using async where possible

### Making changes
- After making changes run 'make test' to make sure we didn't break anything