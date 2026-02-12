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
- Supports both execution payload modes:
  - `payloadMode=compat` for OpenAI-compatible `userInput/history`
  - `payloadMode=native` for A2A-native `a2aUserInput/a2aHistory`
- In Ark experimental A2A mode, LangChain can be used as a native external executor type.