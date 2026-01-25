"""FastAPI application for Claude SDK Executor with OpenTelemetry integration."""

import logging
from contextlib import asynccontextmanager
from typing import Dict

from fastapi import FastAPI, Request
from pydantic import ValidationError
import uvicorn

from ark_sdk.executor import ExecutionEngineRequest, ExecutionEngineResponse

from .executor import ClaudeSdkExecutor
from .telemetry import init_telemetry, shutdown_telemetry, extract_trace_context

logger = logging.getLogger(__name__)


class HealthFilter(logging.Filter):
    """Filter out health check logs to reduce noise."""

    def filter(self, record: logging.LogRecord) -> bool:
        return not (hasattr(record, "getMessage") and "/health" in record.getMessage())


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown."""
    # Startup: Initialize OpenTelemetry
    telemetry_enabled = init_telemetry()
    if telemetry_enabled:
        logger.info("OpenTelemetry tracing enabled")
    else:
        logger.info("OpenTelemetry tracing disabled (no OTEL endpoint configured)")
    
    yield
    
    # Shutdown: Flush pending spans
    shutdown_telemetry()


# Create FastAPI app with lifespan handler
app = FastAPI(
    title="Claude SDK Executor",
    version="1.0.0",
    lifespan=lifespan,
)

# Create executor instance
executor = ClaudeSdkExecutor()


def _setup_logging() -> None:
    """Setup logging filters to reduce noise."""
    health_filter = HealthFilter()
    uvicorn_logger = logging.getLogger("uvicorn.access")
    uvicorn_logger.addFilter(health_filter)


@app.get("/health")
async def health_check() -> Dict[str, str]:
    """Health check endpoint."""
    return {"status": "healthy", "engine": "claude-sdk"}


@app.post("/execute", response_model=ExecutionEngineResponse)
async def execute(request: ExecutionEngineRequest, raw_request: Request) -> ExecutionEngineResponse:
    """Execute agent and return response messages.
    
    Extracts trace context from HTTP headers for distributed tracing.
    """
    try:
        # Extract trace context from HTTP headers for distributed tracing
        headers = dict(raw_request.headers)
        trace_context = extract_trace_context(headers)
        
        logger.info(
            f"Processing execution request for agent: {request.agent.name}",
            extra={
                "query_id": request.queryId,
                "trace_id": trace_context.trace_id,
            }
        )

        # Pass trace context to executor
        response_messages = await executor.execute_agent(request, trace_context=trace_context)

        logger.info(
            f"Execution successful, returned {len(response_messages)} messages"
        )

        return ExecutionEngineResponse(messages=response_messages, error="")

    except ValidationError as e:
        error_msg = f"Request validation failed for agent {request.agent.name}: {str(e)}"
        logger.error(error_msg)
        return ExecutionEngineResponse(messages=[], error=error_msg)
    except Exception as e:
        error_msg = f"Claude SDK execution failed for agent {request.agent.name}: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return ExecutionEngineResponse(messages=[], error=error_msg)


class ExecutorApp:
    """Wrapper for running the FastAPI application.
    
    Provides the same interface as ark-sdk's ExecutorApp for compatibility.
    """
    
    def __init__(self, executor: ClaudeSdkExecutor, engine_name: str):
        self.executor = executor
        self.engine_name = engine_name
        _setup_logging()
        logger.info(f"{engine_name} application initialized")
    
    def run(self, host: str = "0.0.0.0", port: int = 8000) -> None:
        """Run the FastAPI server."""
        logger.info(f"Starting {self.engine_name} execution server on {host}:{port}")
        uvicorn.run(app, host=host, port=port, access_log=True, log_level="info")


# Create app instance for __main__.py compatibility
app_instance = ExecutorApp(executor, engine_name="claude-sdk")
