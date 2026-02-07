"""FastAPI application setup for Ark execution engines."""

import json
import logging
from typing import AsyncGenerator

import uvicorn
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import ValidationError

from .base import BaseExecutor, ExecutionEngineRequest, ExecutionEngineResponse, TokenUsage

logger = logging.getLogger(__name__)


class HealthFilter(logging.Filter):
    def filter(self, record):
        return not (hasattr(record, "getMessage") and "/health" in record.getMessage())


class ExecutorApp:
    def __init__(self, executor: BaseExecutor, engine_name: str):
        self.app = FastAPI(title=f"{engine_name.title()} Executor", version="1.0.0")
        self.executor = executor
        self.engine_name = engine_name.lower()
        self.setup_routes()
        self._setup_logging()
        logger.info(f"{engine_name} application initialized")

    def _setup_logging(self):
        uvicorn_logger = logging.getLogger("uvicorn.access")
        health_filter = HealthFilter()
        uvicorn_logger.addFilter(health_filter)

    def setup_routes(self):
        @self.app.get("/health")
        async def health_check():
            return {"status": "healthy", "engine": self.engine_name}

        @self.app.post("/execute", response_model=ExecutionEngineResponse)
        async def execute(request: ExecutionEngineRequest):
            try:
                logger.info(f"Processing execution request for agent: {request.agent.name}")
                response_messages = await self.executor.execute_agent(request)
                logger.info(f"Execution successful, returned {len(response_messages)} messages")
                token_usage = None
                if response_messages:
                    last_msg = response_messages[-1]
                    usage_data = getattr(last_msg, "token_usage", None)
                    if usage_data and isinstance(usage_data, dict):
                        token_usage = TokenUsage(**usage_data)
                return ExecutionEngineResponse(messages=response_messages, error="", token_usage=token_usage)
            except ValidationError as e:
                error_msg = f"Request validation failed for agent {request.agent.name}: {str(e)}"
                logger.error(error_msg)
                return ExecutionEngineResponse(messages=[], error=error_msg)
            except Exception as e:
                error_msg = f"{self.engine_name.title()} execution failed for agent {request.agent.name}: {str(e)}"
                logger.error(error_msg, exc_info=True)
                return ExecutionEngineResponse(messages=[], error=error_msg)

        @self.app.post("/execute-stream")
        async def execute_stream(request: ExecutionEngineRequest):
            return StreamingResponse(
                self._stream_events(request), media_type="text/event-stream"
            )

    async def _stream_events(self, request: ExecutionEngineRequest) -> AsyncGenerator[str, None]:
        from .base import Message as Msg

        try:
            logger.info(f"Streaming execution request for agent: {request.agent.name}")

            if hasattr(self.executor, "execute_agent_streaming"):
                collected = []
                token_usage = None
                async for chunk in self.executor.execute_agent_streaming(request):
                    yield f"data: {json.dumps({'type': 'chunk', 'chunk': chunk})}\n\n"
                    if isinstance(chunk, dict):
                        if chunk.get("type") == "content":
                            collected.append(chunk.get("content", ""))
                        if chunk.get("token_usage"):
                            token_usage = TokenUsage(**chunk["token_usage"])

                content = "".join(collected)
                messages = [Msg(role="assistant", content=content, name=request.agent.name)] if content else []
            else:
                messages = await self.executor.execute_agent(request)
                token_usage = None

            result = ExecutionEngineResponse(messages=messages, error="", token_usage=token_usage)
            yield f"data: {json.dumps({'type': 'result', 'result': result.model_dump()})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            error_msg = f"{self.engine_name.title()} streaming execution failed: {str(e)}"
            logger.error(error_msg, exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'error': error_msg})}\n\n"
            yield "data: [DONE]\n\n"

    def run(self, host: str = "0.0.0.0", port: int = 8000):
        logger.info(f"Starting {self.engine_name} execution server on {host}:{port}")
        uvicorn.run(self.app, host=host, port=port, access_log=True, log_level="info")

    def create_app(self) -> FastAPI:
        return self.app
