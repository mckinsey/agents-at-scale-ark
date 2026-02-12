"""Common FastAPI application setup for execution engines."""

import logging
from typing import Any, List
from fastapi import FastAPI
from pydantic import ValidationError
import uvicorn

from .executor import BaseExecutor, ExecutionEngineRequest, ExecutionEngineResponse

logger = logging.getLogger(__name__)


class HealthFilter(logging.Filter):
    """Filter to exclude health check logs."""
    def filter(self, record):
        return not (hasattr(record, "getMessage") and "/health" in record.getMessage())


class ExecutorApp:
    """Base FastAPI application for execution engines."""

    def __init__(self, executor: BaseExecutor, engine_name: str):
        """Initialize the FastAPI app with an executor.
        
        Args:
            executor: The executor instance to handle requests
            engine_name: Name of the execution engine (for title and health check)
        """
        self.app = FastAPI(title=f"{engine_name.title()} Executor", version="1.0.0")
        self.executor = executor
        self.engine_name = engine_name.lower()
        self.setup_routes()
        self._setup_logging()
        logger.info(f"{engine_name} application initialized")

    def _setup_logging(self):
        """Setup logging filters to reduce noise."""
        # Add health filter to uvicorn access logger
        uvicorn_logger = logging.getLogger("uvicorn.access")
        health_filter = HealthFilter()
        uvicorn_logger.addFilter(health_filter)

    def setup_routes(self):
        """Setup FastAPI routes."""

        @self.app.get("/health")
        async def health_check():
            """Health check endpoint."""
            return {"status": "healthy", "engine": self.engine_name}

        @self.app.post("/execute", response_model=ExecutionEngineResponse)
        async def execute(request: ExecutionEngineRequest):
            """Execute agent and return response messages."""
            try:
                logger.info(
                    f"Processing execution request for agent: {request.agent.name}"
                )

                response_messages = await self.executor.execute_agent(request)

                logger.info(
                    f"Execution successful, returned {len(response_messages)} messages"
                )

                return ExecutionEngineResponse(messages=response_messages, error="")

            except ValidationError as e:
                error_msg = f"Request validation failed for agent {request.agent.name}: {str(e)}"
                logger.error(error_msg)
                return ExecutionEngineResponse(messages=[], error=error_msg)
            except Exception as e:
                error_msg = (
                    f"{self.engine_name.title()} execution failed for agent {request.agent.name}: {str(e)}"
                )
                logger.error(error_msg, exc_info=True)
                return ExecutionEngineResponse(messages=[], error=error_msg)

    def setup_a2a_route(self, executor: BaseExecutor, path: str = "/execute-a2a") -> None:
        @self.app.post(path, response_model=ExecutionEngineResponse)
        async def execute_a2a(request: ExecutionEngineRequest):
            try:
                logger.info(
                    f"Processing A2A execution request for agent: {request.agent.name}"
                )
                response_messages = await executor.execute_agent(request)
                a2a_messages = self._convert_messages_to_a2a(response_messages, request)
                logger.info(
                    f"A2A execution successful, returned {len(a2a_messages)} messages"
                )
                return ExecutionEngineResponse(messages=[], a2aMessages=a2a_messages, error="")
            except ValidationError as e:
                error_msg = f"Request validation failed for agent {request.agent.name}: {str(e)}"
                logger.error(error_msg)
                return ExecutionEngineResponse(messages=[], a2aMessages=[], error=error_msg)
            except Exception as e:
                error_msg = (
                    f"{self.engine_name.title()} A2A execution failed for agent {request.agent.name}: {str(e)}"
                )
                logger.error(error_msg, exc_info=True)
                return ExecutionEngineResponse(messages=[], a2aMessages=[], error=error_msg)

    def _convert_messages_to_a2a(
        self, messages: List, request: ExecutionEngineRequest
    ) -> List[dict[str, Any]]:
        context_id = ""
        task_id = ""
        if request.a2aUserInput is not None:
            context_value = request.a2aUserInput.get("contextId")
            task_value = request.a2aUserInput.get("taskId")
            if isinstance(context_value, str):
                context_id = context_value
            if isinstance(task_value, str):
                task_id = task_value

        a2a_messages: List[dict[str, Any]] = []
        for message in messages:
            role = "agent" if message.role == "assistant" else message.role
            result: dict[str, Any] = {
                "role": role,
                "parts": [{"kind": "text", "text": message.content}],
            }
            if context_id:
                result["contextId"] = context_id
            if task_id:
                result["taskId"] = task_id
            a2a_messages.append(result)
        return a2a_messages

    def run(self, host: str = "0.0.0.0", port: int = 8000):
        """Run the FastAPI server."""
        logger.info(f"Starting {self.engine_name} execution server on {host}:{port}")
        uvicorn.run(self.app, host=host, port=port, access_log=True, log_level="info")

    def create_app(self) -> FastAPI:
        """Get the FastAPI app instance."""
        return self.app
