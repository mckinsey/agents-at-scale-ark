from fastapi import FastAPI
from ark_executor_common import ExecutorApp
from .executor import ClaudeSDKExecutor

executor = ClaudeSDKExecutor()
app_instance = ExecutorApp(executor, "Claude Agent SDK")


def create_app() -> FastAPI:
    return app_instance.create_app()
