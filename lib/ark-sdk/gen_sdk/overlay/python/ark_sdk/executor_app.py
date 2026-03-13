"""A2A protocol application setup for execution engines.

Extension spec: ark/api/extensions/query/v1/
"""

import logging
from typing import Any, List

import uvicorn
from a2a.server.agent_execution import AgentExecutor
from a2a.server.apps import A2AStarletteApplication
from a2a.server.events import EventQueue
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import (
    AgentCapabilities,
    AgentCard,
    AgentExtension,
    AgentSkill,
    Part,
    TextPart,
    Message as A2AMessage,
)
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from .executor import BaseExecutor
from .extensions.query import (
    QUERY_EXTENSION_URI,
    extract_query_ref,
    resolve_query,
)

logger = logging.getLogger(__name__)


class HealthFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return not (hasattr(record, "getMessage") and "/health" in record.getMessage())


class A2AExecutorAdapter(AgentExecutor):
    def __init__(self, executor: BaseExecutor):
        self.executor = executor

    async def execute(self, context: Any, event_queue: EventQueue) -> None:
        user_text = context.get_user_input()

        query_ref = extract_query_ref(context.message)
        request = await resolve_query(query_ref, user_text)

        try:
            response_messages = await self.executor.execute_agent(request)
            response_text = ""
            for msg in response_messages:
                if msg.role == "assistant" and msg.content:
                    response_text += msg.content

            await event_queue.enqueue_event(
                A2AMessage(
                    role="agent",
                    parts=[Part(root=TextPart(text=response_text))],
                    message_id=context.message.message_id + "-response" if hasattr(context.message, "message_id") else "response",
                )
            )
        except Exception as e:
            logger.error(f"Execution failed: {e}", exc_info=True)
            await event_queue.enqueue_event(
                A2AMessage(
                    role="agent",
                    parts=[Part(root=TextPart(text=f"Execution error: {e}"))],
                    message_id="error-response",
                )
            )

    async def cancel(self, context: Any, event_queue: EventQueue) -> None:
        pass


class ExecutorApp:
    def __init__(
        self,
        executor: BaseExecutor,
        engine_name: str,
        description: str = "",
        skills: List[AgentSkill] | None = None,
    ):
        self.executor = executor
        self.engine_name = engine_name.lower()
        self.description = description or f"{engine_name} execution engine"
        self.skills = skills or [
            AgentSkill(
                id=f"{self.engine_name}-execute",
                name=f"{engine_name} Agent Execution",
                description=f"Executes agents using {engine_name}",
                tags=[self.engine_name, "execution-engine"],
            )
        ]

        self.agent_card = AgentCard(
            name=self.engine_name,
            description=self.description,
            url="https://localhost:8000",
            version="1.0.0",
            skills=self.skills,
            capabilities=AgentCapabilities(
                extensions=[
                    AgentExtension(
                        uri=QUERY_EXTENSION_URI,
                        description="Ark query context",
                        required=False,
                    )
                ],
            ),
            default_input_modes=["text"],
            default_output_modes=["text"],
        )

        adapter = A2AExecutorAdapter(executor)
        request_handler = DefaultRequestHandler(
            agent_executor=adapter,
            task_store=InMemoryTaskStore(),
        )

        self._a2a_app = A2AStarletteApplication(
            agent_card=self.agent_card,
            http_handler=request_handler,
        )

        self._setup_logging()
        logger.info(f"{engine_name} A2A application initialized")

    def _setup_logging(self) -> None:
        uvicorn_logger = logging.getLogger("uvicorn.access")
        uvicorn_logger.addFilter(HealthFilter())

    def build(self) -> Starlette:
        app = self._a2a_app.build()

        async def health_check(request: Request) -> JSONResponse:
            return JSONResponse({"status": "healthy", "engine": self.engine_name})

        app.routes.insert(0, Route("/health", health_check, methods=["GET"]))
        return app

    def run(self, host: str = "0.0.0.0", port: int = 8000) -> None:
        self.agent_card.url = f"https://{host}:{port}"
        logger.info(f"Starting {self.engine_name} A2A server on {host}:{port}")
        uvicorn.run(self.build(), host=host, port=port, access_log=True, log_level="info")

    def create_app(self) -> Starlette:
        return self.build()
