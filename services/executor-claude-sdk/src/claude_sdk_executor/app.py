"""FastAPI application for Claude SDK Executor."""

from ark_sdk.executor_app import ExecutorApp
from .executor import ClaudeSdkExecutor

# Create executor instance
executor = ClaudeSdkExecutor()

# Create app instance using ark-sdk's ExecutorApp
app_instance = ExecutorApp(executor, engine_name="claude-sdk")

# Export the FastAPI app for ASGI servers
app = app_instance.app
