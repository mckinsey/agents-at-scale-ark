"""A2A server that exposes LangChain agents with skill-specific endpoints."""

import asyncio
import logging
import os

import click
import uvicorn
from a2a.server.apps import A2AStarletteApplication
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import AgentCapabilities, AgentCard, AgentSkill
from dotenv import load_dotenv
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Mount, Route

from hosted_langchain_agents.langchain_agents import get_weather_forecast

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@click.command()
@click.option("--host", default="0.0.0.0")
@click.option("--port", default=8000, type=int)
def main(host: str, port: int) -> None:
    if not os.getenv("AZURE_OPENAI_API_KEY"):
        logger.error("AZURE_OPENAI_API_KEY environment variable not set.")
        exit(1)

    # Define agent capabilities and skills
    capabilities = AgentCapabilities(streaming=False)

    weather_skill = AgentSkill(
        id="weather_forecast",
        name="Weather Forecast",
        description="Weather forecasting agent using LangChain with NWS API",
        tags=["weather", "forecast", "conditions"],
        examples=["weather in Chicago", "forecast for New York", "current conditions in Seattle"],
        inputModes=["text/plain"],
        outputModes=["text/plain"],
    )

    agent_card = AgentCard(
        name="langchain_weather_reporter",
        description="Weather forecasting agent using LangChain and OpenMeteo API",
        url=f"http://{host}:{port}/",
        version="1.0.0",
        defaultInputModes=["text/plain"],
        defaultOutputModes=["text/plain"],
        capabilities=capabilities,
        skills=[weather_skill],
    )

    # Create simple executor that directly calls LangChain weather agent
    class SimpleLangChainExecutor:
        async def execute(self, context, event_queue):
            # Extract message text
            message_text = ""
            if context.message and context.message.parts:
                first_part = context.message.parts[0]
                if hasattr(first_part, "root") and hasattr(first_part.root, "text"):
                    message_text = first_part.root.text
            
            # Call LangChain weather agent directly
            result = await asyncio.get_event_loop().run_in_executor(None, get_weather_forecast, message_text)
            
            # Send result back
            from a2a.types import Message, Part, Role, TextPart
            import uuid
            response_message = Message(
                messageId=str(uuid.uuid4()),
                contextId=context.message.contextId if context.message else str(uuid.uuid4()),
                taskId=context.task_id,
                role=Role.agent,
                parts=[Part(root=TextPart(kind="text", text=result))],
            )
            await event_queue.enqueue_event(response_message)

        async def cancel(self, context, event_queue):
            pass

    # Build main A2A application 
    handler = DefaultRequestHandler(
        agent_executor=SimpleLangChainExecutor(),
        task_store=InMemoryTaskStore(),
    )

    # Health check endpoint
    async def health(request: object) -> JSONResponse:
        return JSONResponse({"status": "healthy"})

    # Build main application
    a2a_app = A2AStarletteApplication(
        agent_card=agent_card,
        http_handler=handler,
    )

    # Build the A2A app
    built_a2a_app = a2a_app.build()

    # Extract the specific routes we need
    jsonrpc_route = None
    agent_json_route = None

    for route in built_a2a_app.routes:
        if hasattr(route, 'path'):
            if route.path == "/":
                jsonrpc_route = route
            elif route.path == "/.well-known/agent.json":
                agent_json_route = route

    # Create main application with health check and specific A2A routes
    routes = [Route("/health", health, methods=["GET"])]

    if jsonrpc_route:
        routes.append(Route("/", jsonrpc_route.endpoint, methods=jsonrpc_route.methods))

    # Add both legacy and new agent discovery endpoints
    if agent_json_route:
        routes.append(agent_json_route)  # Legacy: /.well-known/agent.json
        routes.append(Route("/agent-card.json", agent_json_route.endpoint, methods=agent_json_route.methods))  # New endpoint

    app = Starlette(routes=routes)

    logger.info(f"Starting LangChain A2A server on {host}:{port}")
    logger.info("Available endpoints:")
    logger.info("  - /.well-known/agent.json (legacy agent discovery)")
    logger.info("  - /agent-card.json (new agent discovery)")
    logger.info("  - / (main endpoint)")
    logger.info("  - /health (health check)")

    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    main()
