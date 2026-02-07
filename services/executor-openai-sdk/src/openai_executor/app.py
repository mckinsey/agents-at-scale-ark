from fastapi import FastAPI
from ark_executor_common import ExecutorApp
from .executor import OpenAIAgentsExecutor

executor = OpenAIAgentsExecutor()
app_instance = ExecutorApp(executor, "OpenAI Agents SDK")


def create_app() -> FastAPI:
    return app_instance.create_app()
