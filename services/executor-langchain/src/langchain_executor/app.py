from ark_sdk.executor_app import ExecutorApp
from starlette.applications import Starlette
from .executor import LangChainExecutor

executor = LangChainExecutor()
app_instance = ExecutorApp(
    executor,
    "LangChain",
    description="LangChain execution engine with RAG support",
)


def create_app() -> Starlette:
    return app_instance.create_app()
