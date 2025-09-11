# Migration Guide: executor-common → ark-sdk

## Overview

The `executor-common` library has been **deprecated** and its functionality has been moved into the main `ark-sdk` package. This consolidation eliminates code duplication and provides a single source of truth for execution engine contracts.

## What Changed

### Moved Components

The following components have been moved from `executor-common` to `ark-sdk`:

- **Types** (`types.py` → `ark_sdk.executor`):
  - `Parameter`
  - `Model` (renamed from `ModelConfig`)
  - `AgentConfig`
  - `ToolDefinition`
  - `Message`
  - `ExecutionEngineRequest`
  - `ExecutionEngineResponse`

- **Base Classes** (`base.py` → `ark_sdk.executor`):
  - `BaseExecutor`

- **FastAPI App** (`app.py` → `ark_sdk.executor_app`):
  - `ExecutorApp`
  - `HealthFilter`

### Breaking Changes

1. **Import Changes**: All imports must be updated from `executor_common` to `ark_sdk`
2. **Model Type**: `ModelConfig` has been renamed to `Model` for consistency
3. **Dependencies**: FastAPI and uvicorn are now included in ark-sdk

## Migration Steps

### 1. Update Dependencies

**Before:**
```toml
dependencies = [
    "executor-common",
    # other deps...
]
```

**After:**
```toml
dependencies = [
    "ark-sdk",
    # other deps...
]
```

### 2. Update Imports

**Before:**
```python
from executor_common import (
    Parameter,
    ModelConfig,
    AgentConfig,
    ToolDefinition,
    Message,
    ExecutionEngineRequest,
    ExecutionEngineResponse,
    BaseExecutor,
    ExecutorApp,
)
```

**After:**
```python
from ark_sdk import (
    Parameter,
    Model,  # Note: renamed from ModelConfig
    AgentConfig,
    ToolDefinition,
    Message,
    ExecutionEngineRequest,
    ExecutionEngineResponse,
    BaseExecutor,
    ExecutorApp,
)
```

### 3. Update Build Configuration

**Before:**
```makefile
$(ARK_EXECUTOR_COMMON_WHL)
```

**After:**
```makefile
$(ARK_SDK_WHL)
```

### 4. Update Dockerfiles

**Before:**
```dockerfile
COPY build-context/*.whl /tmp/
RUN uv add /tmp/executor_common-*.whl
```

**After:**
```dockerfile
COPY build-context/*.whl /tmp/
RUN uv add /tmp/ark_sdk-*.whl
```

## Benefits

1. **Eliminated Duplication**: No more duplicate type definitions between Go and Python
2. **Single Source of Truth**: All execution engine contracts are now in ark-sdk
3. **Better Integration**: Execution engines can leverage the full ark-sdk functionality
4. **Reduced Maintenance**: One less package to maintain and version

## Timeline

- **Phase 1**: Move functionality to ark-sdk ✅
- **Phase 2**: Update executor-langchain to use ark-sdk ✅
- **Phase 3**: Deprecate executor-common package
- **Phase 4**: Remove executor-common entirely

## Support

If you encounter any issues during migration, please:
1. Check this migration guide first
2. Review the updated ark-sdk documentation
3. Open an issue if you find bugs or need clarification
