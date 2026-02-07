from fastapi import FastAPI
from ark_executor_common import ExecutorApp
from .executor import LangChainExecutor

# Create the executor and app
executor = LangChainExecutor()
app_instance = ExecutorApp(executor, "LangChain")


def create_app() -> FastAPI:
    return app_instance.create_app()