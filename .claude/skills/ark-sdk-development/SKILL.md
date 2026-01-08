---
name: ark-sdk-development
description: Regenerate and debug types across the ARK stack (SDK, API, Dashboard). Use when fixing TypeScript type errors in ark-dashboard, updating types after CRD changes, regenerating types.ts from OpenAPI spec, debugging "Property does not exist on type" schema errors, or adding custom SDK functionality via overlays. Covers the full type pipeline from Kubernetes CRDs to TypeScript.
---

# ARK SDK and Type Development

## Type Generation Pipeline

Types flow through the ARK stack:

```
CRD YAML (ark/config/crd/)
    ↓ make ark-sdk-build (automatic)
ark-sdk Python types + overlay utilities
    ↓
ark-api Pydantic models (manual updates if exposing new fields)
    ↓ make ark-api-build → generates openapi.json
ark-dashboard TypeScript types
    ↓ npm run generate:api → generates types.ts
```

## ark-sdk: Automatic Type Generation

CRD types are **automatically generated** from Kubernetes CRD YAML files.

```bash
make ark-sdk-build
```

This runs:
1. `crd_to_openapi.py` - converts CRDs to OpenAPI schema
2. `openapi-generator-cli` - generates Python types from schema
3. Copies overlay files on top of generated code
4. Builds wheel package

### Adding Custom SDK Functionality (Overlays)

The `lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/` directory contains custom Python modules that are copied on top of generated code. This is how utilities like `client.py`, `k8s.py`, and `executor.py` are added.

To add custom SDK functionality:
1. Add Python files to `lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/`
2. Run `make ark-sdk-build`

## ark-api: Manual Model Updates

The ark-api has **manually written** Pydantic models in `services/ark-api/ark-api/src/ark_api/models/`.

When to update ark-api models:
- When exposing new CRD fields via the HTTP API
- When adding new API response types

```bash
make ark-api-build
```

This generates `services/ark-api/openapi.json` from FastAPI routes and Pydantic models.

### Pydantic Model Naming (CRITICAL)

Pydantic model class names **MUST be globally unique** across all model files. When multiple files define classes with the same name (e.g., `ConfigMapKeyRef`, `Header`, `ValueFrom`), FastAPI generates non-deterministic OpenAPI schema names like `ark_api__models__agents__Header-Input`. These names depend on import order and cause CI failures when `types.ts` differs between environments.

**Solution**: Prefix class names with their domain context:

| File | Naming Pattern | Examples |
|------|---------------|----------|
| `agents.py` | `Agent*` | `AgentHeader`, `AgentValueFrom`, `AgentParameter` |
| `evaluators.py` | `Evaluator*` | `EvaluatorParameter`, `EvaluatorValueSource` |
| `mcp_servers.py` | `MCPServer*` | `MCPServerHeader`, `MCPServerValueSource` |
| `queries.py` | `Query*` | `QueryParameter`, `QueryLabelSelector` |
| `models.py` | `Model*` | `ModelValueSource` |

**Safety net**: `generate_openapi.py` fails if any schema name contains `__models__`, catching collisions at build time.

See: https://github.com/mckinsey/agents-at-scale-ark/issues/656

## ark-dashboard: TypeScript Type Generation

```bash
cd services/ark-dashboard/ark-dashboard
cp ../../ark-api/openapi.json ../out/
npm run generate:api
npm run build  # verify types compile
```

## Debugging Type Errors

When you see:
```
Property 'SomeSchema' does not exist on type
```

1. **Regenerate types.ts** from latest openapi.json
2. **Find the correct schema name:**
   ```bash
   grep "SomeSchema" services/ark-dashboard/ark-dashboard/lib/api/generated/types.ts
   ```
3. **Update service files** to use correct schema names

If you see schema names with `__models__` pattern (e.g., `ark_api__models__agents__Header-Input`):
- This indicates a Pydantic model naming collision
- Fix by renaming the Python class to be unique (see naming convention above)
- Do NOT work around by using the `__models__` name - fix the root cause

## Key Files

| File | Purpose |
|------|---------|
| `ark/config/crd/bases/*.yaml` | Source of truth - Kubernetes CRDs |
| `lib/ark-sdk/gen_sdk/overlay/` | Custom SDK utilities (copied on top of generated) |
| `services/ark-api/ark-api/src/ark_api/models/` | Manually written Pydantic models |
| `services/ark-api/ark-api/generate_openapi.py` | Generates openapi.json with collision safety net |
| `services/ark-api/openapi.json` | Generated OpenAPI spec from FastAPI |
| `services/ark-dashboard/out/openapi.json` | Copy used for dashboard type generation |
| `services/ark-dashboard/ark-dashboard/lib/api/generated/types.ts` | Generated TypeScript types |
