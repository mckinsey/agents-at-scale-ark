"""A2A protocol application setup for execution engines.

Extension spec: ark/api/extensions/query/v1/
"""

import logging
import os
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

from .broker import BrokerClient, discover_broker_url
from .executor import BaseExecutor
from .extensions.query import (
    QUERY_EXTENSION_URI,
    extract_query_ref,
    resolve_query,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# OTEL — conditional setup shared by all executors
# ---------------------------------------------------------------------------
_otel_enabled = False


def _discover_broker_endpoint() -> str | None:
    """Discover ark-broker OTLP endpoint from K8s ConfigMap.

    Looks for a ConfigMap named 'ark-config-broker' in all namespaces,
    matching the pattern used by the Go controller. Returns the OTLP
    traces endpoint URL, or None if not found.
    """
    try:
        from kubernetes import client as k8s_client
        from .k8s import _init_k8s, get_namespace
        _init_k8s()

        v1 = k8s_client.CoreV1Api()
        ns = get_namespace()
        cm = v1.read_namespaced_config_map(name="ark-config-broker", namespace=ns)
        if cm:
            cms_items = [cm]
        else:
            cms_items = []
        for cm in cms_items:
            data = cm.data or {}
            if data.get("enabled") != "true":
                continue
            service_ref = data.get("serviceRef", "")
            # Parse serviceRef YAML-ish format: "name: <svc>\nport: <port>"
            svc_name = ""
            svc_port = ""
            for line in service_ref.strip().splitlines():
                key, _, val = line.partition(":")
                key, val = key.strip(), val.strip().strip('"')
                if key == "name":
                    svc_name = val
                elif key == "port":
                    svc_port = val
            if svc_name:
                ns = cm.metadata.namespace
                # Resolve named port from the service definition
                if svc_port.isdigit():
                    port = svc_port
                else:
                    try:
                        svc = v1.read_namespaced_service(name=svc_name, namespace=ns)
                        port = "80"
                        for p in svc.spec.ports or []:
                            if p.name == svc_port:
                                port = str(p.port)
                                break
                    except Exception:
                        port = "80"
                return f"http://{svc_name}.{ns}.svc.cluster.local:{port}/v1/traces"  # NOSONAR — cluster-internal service-to-service traffic
    except Exception as e:
        logger.debug(f"Broker discovery skipped: {e}")
    return None


def _init_otel() -> bool:
    """Initialize OTEL if OTEL_EXPORTER_OTLP_ENDPOINT is set.

    Sets up TracerProvider, OTLP HTTP exporter, W3C propagators, and
    Starlette instrumentation. Must run before any Starlette app is created.
    """
    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    if not endpoint:
        return False
    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        try:
            from opentelemetry.propagate import set_global_textmap
            from opentelemetry.propagators.composite import CompositePropagator
            from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator
            from opentelemetry.baggage.propagation import W3CBaggagePropagator
            set_global_textmap(CompositePropagator([
                TraceContextTextMapPropagator(),
                W3CBaggagePropagator(),
            ]))
        except ImportError:
            logger.debug("W3C propagators not available, using defaults")

        # Copy baggage entries (e.g. session_id) onto every span as attributes
        from opentelemetry.sdk.trace import SpanProcessor as _SpanProcessor
        from opentelemetry import baggage, context

        class BaggageSpanProcessor(_SpanProcessor):
            def on_start(self, span, parent_context=None):
                ctx = parent_context or context.get_current()
                for key, value in baggage.get_all(ctx).items():
                    span.set_attribute(key, value)
            def on_end(self, span):
                pass
            def shutdown(self):
                pass
            def force_flush(self, timeout_millis=None):
                pass

        provider = TracerProvider()
        provider.add_span_processor(BaggageSpanProcessor())
        # Primary exporter — sends to OTEL_EXPORTER_OTLP_ENDPOINT
        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))

        # Broker exporter — discover ark-config-broker ConfigMap and send traces there too
        broker_endpoint = _discover_broker_endpoint()
        if broker_endpoint:
            broker_exporter = OTLPSpanExporter(endpoint=broker_endpoint)
            provider.add_span_processor(BatchSpanProcessor(broker_exporter))
            logger.info(f"OTEL broker exporter enabled, sending to {broker_endpoint}")

        trace.set_tracer_provider(provider)

        logger.info(f"OTEL tracing enabled, exporting to {endpoint}")
        return True
    except Exception:
        logger.exception("Failed to initialize OTEL tracing")
        return False


_otel_enabled = _init_otel()


def is_otel_enabled() -> bool:
    """Check if OTEL tracing was initialized. Executors use this to
    conditionally apply their own executor-specific instrumentors."""
    return _otel_enabled


class HealthFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return not (hasattr(record, "getMessage") and "/health" in record.getMessage())


def _get_tracer():
    """Get an OTEL tracer if available, otherwise return None."""
    if not _otel_enabled:
        return None
    try:
        from opentelemetry import trace
        return trace.get_tracer("ark-sdk")
    except Exception:
        return None


class A2AExecutorAdapter(AgentExecutor):
    def __init__(self, executor: BaseExecutor):
        self.executor = executor

    async def execute(self, context: Any, event_queue: EventQueue) -> None:
        tracer = _get_tracer()
        if tracer:
            from opentelemetry import trace
            with tracer.start_as_current_span("ark.executor.execute", kind=trace.SpanKind.INTERNAL):
                await self._do_execute(context, event_queue)
        else:
            await self._do_execute(context, event_queue)

    async def _do_execute(self, context: Any, event_queue: EventQueue) -> None:
        user_text = context.get_user_input()
        conversation_id = ""
        if hasattr(context.message, "context_id") and context.message.context_id:
            conversation_id = context.message.context_id

        query_ref = extract_query_ref(context.message)
        request = await resolve_query(query_ref, user_text, conversation_id=conversation_id)

        broker_url = await discover_broker_url(query_ref.namespace)
        broker = BrokerClient(
            base_url=broker_url,
            query_name=query_ref.name,
            session_id=conversation_id,
            agent_name=request.agent.name,
        ) if broker_url else None

        self.executor._broker_client = broker
        self.executor._streamed = False

        try:
            response_messages = await self.executor.execute_agent(request)
            response_text = ""
            for msg in response_messages:
                if msg.role == "assistant" and msg.content:
                    response_text += msg.content

            if broker:
                if not self.executor._streamed:
                    await broker.send_chunk(response_text, finish_reason="stop")
                await broker.complete()

            response_msg = A2AMessage(
                role="agent",
                parts=[Part(root=TextPart(text=response_text))],
                message_id=context.message.message_id + "-response" if hasattr(context.message, "message_id") else "response",
            )
            if conversation_id:
                response_msg.context_id = conversation_id
            await event_queue.enqueue_event(response_msg)
        except Exception as e:
            logger.error(f"Execution failed: {e}", exc_info=True)
            await event_queue.enqueue_event(
                A2AMessage(
                    role="agent",
                    parts=[Part(root=TextPart(text=f"Execution error: {e}"))],
                    message_id="error-response",
                )
            )
        finally:
            self.executor._broker_client = None
            self.executor._streamed = False

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

        # Wrap app with OTEL ASGI middleware to extract traceparent/baggage.
        # Exclude /health to prevent Kubernetes liveness/readiness probes
        # from generating noisy traces on every probe interval.
        if _otel_enabled:
            try:
                from opentelemetry.instrumentation.asgi import OpenTelemetryMiddleware
                from opentelemetry.util.http import ExcludeList
                excluded = ExcludeList(["health"])
                app = OpenTelemetryMiddleware(app, excluded_urls=excluded)
            except ImportError:
                logger.debug("opentelemetry-instrumentation-asgi not available")

        return app

    def run(self, host: str = "0.0.0.0", port: int = 8000) -> None:
        self.agent_card.url = f"https://{host}:{port}"
        logger.info(f"Starting {self.engine_name} A2A server on {host}:{port}")
        uvicorn.run(self.build(), host=host, port=port, access_log=True, log_level="info")

    def create_app(self) -> Starlette:
        return self.build()
