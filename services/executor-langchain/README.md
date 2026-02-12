# LangChain Executor

LangChain-based execution service for ARK agents with RAG support.

## Quickstart
```bash
make help     # Show available commands
make init     # Install dependencies
make dev      # Run in development mode
```

## Notes
- Requires Python with uv package manager
- Provides FastAPI web server for execution requests
- Compat endpoint: `POST /execute` via engine type `langchain`
- Native endpoint: `POST /execute-a2a` via engine type `a2a-langchain`
- `a2a-langchain` registration is optional via Helm value `a2aExecutionEngine.enabled`
- Fallback `/execute-a2a` route (when SDK lacks `setup_a2a_route`) returns structured `ExecutionEngineResponse` errors