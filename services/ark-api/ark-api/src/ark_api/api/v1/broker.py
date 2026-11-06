"""Broker API endpoints for real-time streaming of traces, messages, and chunks."""
import asyncio
import contextlib
import json
import logging
import os
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse, JSONResponse
from kubernetes_asyncio import client as k8s_client, watch as k8s_watch
from kubernetes_asyncio.client.rest import ApiException
from ark_sdk.impersonation import ImpersonationConfig
from ark_sdk.k8s import get_context

from ark_sdk.client import with_ark_client

from ...auth.dependencies import get_impersonation_config
from ...constants.query_param_descriptions import NAMESPACE_DESCRIPTION
from ...constants.query_phases import QUERY_PHASE_ERROR, TERMINAL_QUERY_PHASES
from ...core.constants import GROUP

from ...utils.memory_client import get_memory_service_address, get_all_memory_resources
from ...utils.parse_duration import parse_duration_to_seconds
from ...utils.streaming import StreamingErrorResponse
from ...utils.url_validation import validate_path_segment, build_safe_url, validate_and_build_url
from .client_utils import get_impersonating_api_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/broker", tags=["broker"])

VERSION = "v1alpha1"
BROKER_CONNECT_TIMEOUT = float(os.getenv('BROKER_CONNECT_TIMEOUT', '10.0'))
BROKER_CHUNK_IDLE_TIMEOUT_SECONDS = float(os.getenv('BROKER_CHUNK_IDLE_TIMEOUT_SECONDS', '330'))
CHUNK_TERMINAL_GRACE_SECONDS = 3.0
CHUNK_ACTIVE_TIMEOUT_MARGIN_SECONDS = 60
QUERY_WATCH_TIMEOUT_SECONDS = 300
DEFAULT_QUERY_TIMEOUT = "30m"

SSE_DONE_LINE = "data: [DONE]"
SSE_DONE_EVENT = f"{SSE_DONE_LINE}\n\n"

# Query parameter descriptions
DESC_MEMORY = "Memory resource name"
DESC_CURSOR = "Cursor for pagination"
DESC_CURSOR_STREAM = "Cursor for pagination/streaming"

sse_headers = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
}


async def get_broker_url(memory_name: str, impersonation: Optional[ImpersonationConfig] = None) -> Optional[str]:
    """Get the broker URL from a Memory resource."""
    try:
        async with with_ark_client(None, VERSION, impersonation=impersonation) as client:
            memory_dicts = await get_all_memory_resources(client, memory_name)
            if not memory_dicts:
                logger.warning("No memory resource found for requested name")
                return None
            return get_memory_service_address(memory_dicts[0])
    except Exception as e:
        logger.error(f"Failed to get memory service address: {e}")
        return None


def format_error_response(response_text: str, status_code: int, reason_phrase: str) -> dict:
    """Format error response from broker, trying to parse JSON first."""
    try:
        error_data = json.loads(response_text)
        return {'error': error_data}
    except (json.JSONDecodeError, ValueError):
        return {'error': {'message': f'{status_code} {reason_phrase}', 'type': 'server_error'}}


def build_broker_unavailable_body(message: str, error_type: str) -> dict:
    """Build a structured body for broker-unavailable errors."""
    return {
        "error": {"message": message, "type": error_type},
        "code": "broker_unavailable",
        "fallback": "poll",
    }


def build_broker_unavailable_response(message: str, error_type: str) -> JSONResponse:
    """Build the 503 JSONResponse for broker-unavailable errors."""
    return JSONResponse(
        content=build_broker_unavailable_body(message, error_type),
        status_code=503,
    )


async def proxy_sse_stream(url: str):
    """Proxy SSE stream from broker service."""
    timeout = httpx.Timeout(BROKER_CONNECT_TIMEOUT, read=None)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("GET", url) as response:
                if response.status_code != 200:
                    response_text = await response.aread()
                    error = format_error_response(
                        response_text.decode("utf-8"),
                        response.status_code,
                        response.reason_phrase
                    )
                    yield f"data: {json.dumps(error)}\n\n"
                    return

                async for line in response.aiter_lines():
                    if line.strip():
                        yield line + "\n\n"
    except httpx.ConnectError as e:
        logger.error(f"Failed to connect to broker at {url}: {e}")
        yield f"data: {json.dumps(build_broker_unavailable_body('Failed to connect to broker service', 'connection_error'))}\n\n"
    except Exception as e:
        logger.error(f"Error proxying SSE stream: {e}")
        yield f"data: {json.dumps({'error': {'message': str(e), 'type': 'server_error'}})}\n\n"


def sse_error_event(message: str, error_type: str, code: str) -> str:
    """Format an OpenAI-style error as an SSE event."""
    error: StreamingErrorResponse = {"error": {"message": message, "type": error_type, "code": code}}
    return f"data: {json.dumps(error)}\n\n"


def query_error_message(status: dict) -> str:
    """Pick the most specific error text from a Query status."""
    content = (status.get("response") or {}).get("content")
    if content:
        return content
    for condition in reversed(status.get("conditions") or []):
        if condition.get("message"):
            return condition["message"]
    return "Query failed"


def terminal_sse_events(status: dict) -> list[str]:
    """Build the closing SSE events for a Query that reached a terminal phase."""
    if status.get("phase") != QUERY_PHASE_ERROR:
        return [SSE_DONE_EVENT]
    return [sse_error_event(query_error_message(status), "server_error", "query_error"), SSE_DONE_EVENT]


class QueryPhaseTracker:
    """Follows a Query's phase by reading it once and then watching from that resourceVersion."""

    def __init__(
        self,
        query_name: str,
        namespace: str,
        namespace_given: bool,
        impersonation: Optional[ImpersonationConfig],
    ):
        self.query_name = query_name
        self.namespace = namespace
        self.namespace_given = namespace_given
        self.impersonation = impersonation
        self.active = False
        self.timeout_seconds: Optional[int] = None
        self.closing_events: list[str] = []
        self.terminal = asyncio.Event()

    def observe(self, query: dict) -> bool:
        """Record the Query's state and return True once it is terminal."""
        status = query.get("status") or {}
        self.timeout_seconds = parse_duration_to_seconds((query.get("spec") or {}).get("timeout") or DEFAULT_QUERY_TIMEOUT)
        if status.get("phase") in TERMINAL_QUERY_PHASES:
            self.finish(terminal_sse_events(status))
            return True
        self.active = True
        return False

    def finish(self, events: list[str]) -> None:
        self.active = False
        self.closing_events = events
        self.terminal.set()

    async def run(self) -> None:
        """Track the phase until it is terminal. Raises when tracking cannot continue."""
        try:
            async with get_impersonating_api_client(self.impersonation) as api:
                custom_api = k8s_client.CustomObjectsApi(api)
                while True:
                    try:
                        query = await custom_api.get_namespaced_custom_object(
                            GROUP, VERSION, self.namespace, "queries", self.query_name
                        )
                    except ApiException as e:
                        if e.status == 404 and self.namespace_given:
                            self.finish([sse_error_event("Query not found", "server_error", "query_not_found"), SSE_DONE_EVENT])
                            return
                        raise
                    if self.observe(query):
                        return
                    try:
                        if await self.watch(custom_api, query["metadata"]["resourceVersion"]):
                            return
                    except ApiException as e:
                        if e.status != 410:
                            raise
        finally:
            self.active = False

    async def watch(self, custom_api, resource_version: str) -> bool:
        """Watch until the Query is terminal (True) or the watch closes (False)."""
        async with k8s_watch.Watch() as query_watch:
            async for event in query_watch.stream(
                custom_api.list_namespaced_custom_object,
                group=GROUP,
                version=VERSION,
                namespace=self.namespace,
                plural="queries",
                field_selector=f"metadata.name={self.query_name}",
                resource_version=resource_version,
                timeout_seconds=QUERY_WATCH_TIMEOUT_SECONDS,
            ):
                if event["type"] == "DELETED":
                    self.finish([sse_error_event("Query was deleted", "server_error", "query_deleted"), SSE_DONE_EVENT])
                    return True
                if event["type"] in ("ADDED", "MODIFIED") and self.observe(event["raw_object"]):
                    return True
        return False

    def idle_limit_seconds(self) -> float:
        """Allow an active Query its own timeout; otherwise use the default idle limit."""
        if self.active and self.timeout_seconds is not None:
            return max(BROKER_CHUNK_IDLE_TIMEOUT_SECONDS, self.timeout_seconds + CHUNK_ACTIVE_TIMEOUT_MARGIN_SECONDS)
        return BROKER_CHUNK_IDLE_TIMEOUT_SECONDS


def report_tracker_failure(task: asyncio.Task, query_name: str) -> None:
    """Log why phase tracking stopped, so the stream falls back to the idle timeout visibly."""
    if task.cancelled() or task.exception() is None:
        return
    error = task.exception()
    logger.warning(f"Stopped tracking Query {query_name} phase, relying on the idle timeout: {error}", exc_info=error)


async def watch_chunks_until_terminal(
    url: str,
    query_name: str,
    namespace: Optional[str],
    impersonation: Optional[ImpersonationConfig],
):
    """Relay the broker chunk stream, closing it once the Query reaches a terminal phase."""
    tracker = QueryPhaseTracker(
        query_name,
        namespace or get_context()["namespace"],
        namespace is not None,
        impersonation,
    )
    tracker_task = asyncio.create_task(tracker.run())
    tracker_task.add_done_callback(lambda task: report_tracker_failure(task, query_name))
    terminal_wait = asyncio.ensure_future(tracker.terminal.wait())
    stream = proxy_sse_stream(url)
    next_line = asyncio.ensure_future(anext(stream))
    loop = asyncio.get_running_loop()
    last_line_at = loop.time()
    grace_deadline = None
    try:
        while True:
            waiters = {next_line}
            if grace_deadline is None:
                waiters.add(terminal_wait)
                deadline = last_line_at + tracker.idle_limit_seconds()
            else:
                deadline = grace_deadline
            if not tracker_task.done():
                waiters.add(tracker_task)
            done, _ = await asyncio.wait(
                waiters, timeout=max(0.0, deadline - loop.time()), return_when=asyncio.FIRST_COMPLETED
            )

            if next_line in done:
                try:
                    line = next_line.result()
                except StopAsyncIteration:
                    return
                yield line
                if line.strip() == SSE_DONE_LINE:
                    return
                last_line_at = loop.time()
                next_line = asyncio.ensure_future(anext(stream))
                continue

            if grace_deadline is None and terminal_wait in done:
                grace_deadline = loop.time() + CHUNK_TERMINAL_GRACE_SECONDS
                continue

            if tracker_task in done:
                continue

            if grace_deadline is not None:
                logger.info(f"Query {query_name} finished but the broker sent no [DONE], closing stream")
                for event in tracker.closing_events:
                    yield event
                return

            if loop.time() < last_line_at + tracker.idle_limit_seconds():
                continue
            idle_seconds = tracker.idle_limit_seconds()
            logger.warning(f"No chunks for Query {query_name} in {idle_seconds:.0f}s, closing stream")
            yield sse_error_event(f"No data from broker for {idle_seconds:.0f}s", "timeout_error", "broker_idle_timeout")
            yield SSE_DONE_EVENT
            return
    finally:
        for task in (next_line, terminal_wait, tracker_task):
            task.cancel()
        for task in (next_line, terminal_wait, tracker_task):
            with contextlib.suppress(BaseException):
                await task
        await stream.aclose()


async def proxy_broker_request(
    memory: str,
    path: str,
    watch: bool = False,
    params: Optional[dict] = None,
    impersonation: Optional[ImpersonationConfig] = None,
):
    """Generic proxy for broker requests - handles both SSE streaming and JSON fetching."""
    broker_url = await get_broker_url(memory, impersonation=impersonation)
    if not broker_url:
        return build_broker_unavailable_response(
            f"Memory service '{memory}' not available", "service_unavailable"
        )

    safe_url = validate_and_build_url(broker_url, path)

    query_params = {k: v for k, v in (params or {}).items() if v is not None}

    if watch:
        query_params["watch"] = "true"
        url = safe_url
        if query_params:
            url += f"?{urlencode(query_params)}"
        logger.info(f"Proxying SSE stream from {url}")
        return StreamingResponse(
            proxy_sse_stream(url),
            media_type="text/event-stream",
            headers=sse_headers,
        )

    try:
        timeout = httpx.Timeout(BROKER_CONNECT_TIMEOUT)
        async with httpx.AsyncClient(timeout=timeout) as client:
            url = safe_url
            if query_params:
                url += f"?{urlencode(query_params)}"
            response = await client.get(url)
            return JSONResponse(content=response.json(), status_code=response.status_code)
    except httpx.ConnectError as e:
        logger.error(f"Failed to connect to broker: {e}")
        return build_broker_unavailable_response(
            "Failed to connect to broker service", "connection_error"
        )
    except Exception as e:
        logger.error(f"Error fetching from broker: {e}")
        return JSONResponse(
            content={"error": {"message": str(e), "type": "server_error"}},
            status_code=500,
        )


@router.get("/traces")
async def get_traces(
    request: Request,
    watch: bool = Query(False, description="Stream traces via SSE"),
    memory: str = Query("default", description=DESC_MEMORY),
    limit: int = Query(100, description="Max traces to return"),
    cursor: Optional[int] = Query(None, description=DESC_CURSOR),
    session_id: Optional[str] = Query(None, description="Filter by session ID"),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
):
    """Get or stream OTEL traces from the broker."""
    return await proxy_broker_request(
        memory, "/traces", watch,
        {"limit": limit, "cursor": cursor, "session_id": session_id},
        impersonation=impersonation,
    )


@router.get("/traces/{trace_id}")
async def get_trace(
    request: Request,
    trace_id: str,
    watch: bool = Query(False, description="Stream trace spans via SSE"),
    from_beginning: bool = Query(False, alias="from-beginning", description="Include existing spans"),
    cursor: Optional[int] = Query(None, description=DESC_CURSOR_STREAM),
    memory: str = Query("default", description=DESC_MEMORY),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
):
    """Get or stream a specific trace from the broker."""
    params = {"cursor": cursor}
    if from_beginning:
        params["from-beginning"] = "true"
    return await proxy_broker_request(memory, f"/traces/{trace_id}", watch, params, impersonation=impersonation)


@router.get("/messages")
async def get_messages(
    request: Request,
    watch: bool = Query(False, description="Stream messages via SSE"),
    memory: str = Query("default", description=DESC_MEMORY),
    limit: int = Query(100, description="Max messages to return"),
    cursor: Optional[int] = Query(None, description=DESC_CURSOR),
    conversation_id: Optional[str] = Query(None, description="Filter by conversation ID"),
    query_id: Optional[str] = Query(None, description="Filter by query ID"),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
):
    """Get or stream messages from the broker."""
    return await proxy_broker_request(
        memory, "/messages", watch,
        {"limit": limit, "cursor": cursor, "conversation_id": conversation_id, "query_id": query_id},
        impersonation=impersonation,
    )


@router.get("/events")
async def get_events(
    request: Request,
    watch: bool = Query(False, description="Stream events via SSE"),
    memory: str = Query("default", description=DESC_MEMORY),
    limit: int = Query(100, description="Max events to return"),
    cursor: Optional[int] = Query(None, description=DESC_CURSOR),
    session_id: Optional[str] = Query(None, description="Filter by session ID"),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
):
    """Get or stream operation events from the broker."""
    return await proxy_broker_request(
        memory, "/events", watch,
        {"limit": limit, "cursor": cursor, "session_id": session_id},
        impersonation=impersonation,
    )


@router.get("/events/{query_id}")
async def get_events_by_query(
    request: Request,
    query_id: str,
    watch: bool = Query(False, description="Stream events via SSE"),
    from_beginning: bool = Query(False, alias="from-beginning", description="Include existing events"),
    cursor: Optional[int] = Query(None, description=DESC_CURSOR_STREAM),
    memory: str = Query("default", description=DESC_MEMORY),
    limit: int = Query(100, description="Max events to return"),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
):
    """Get or stream events for a specific query."""
    params = {"limit": limit, "cursor": cursor}
    if from_beginning:
        params["from-beginning"] = "true"
    return await proxy_broker_request(memory, f"/events/{query_id}", watch, params, impersonation=impersonation)


@router.get("/chunks")
async def get_chunks(
    request: Request,
    watch: bool = Query(False, description="Stream chunks via SSE"),
    query_id: Optional[str] = Query(None, alias="query-id", description="Filter by query ID"),
    memory: str = Query("default", description=DESC_MEMORY),
    limit: int = Query(100, description="Max chunks to return"),
    cursor: Optional[int] = Query(None, description=DESC_CURSOR),
    namespace: Optional[str] = Query(None, description=NAMESPACE_DESCRIPTION),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
):
    """Get or stream LLM chunks from the broker."""
    if watch and query_id:
        broker_url = await get_broker_url(memory, impersonation=impersonation)
        if not broker_url:
            return build_broker_unavailable_response(
                f"Memory service '{memory}' not available", "service_unavailable"
            )
        # Validate query_id to prevent path traversal
        validate_path_segment(query_id, "query_id")
        url = build_safe_url(broker_url, "stream", query_id) + "?from-beginning=true"
        logger.info(f"Proxying chunks SSE stream from {url}")
        return StreamingResponse(
            watch_chunks_until_terminal(url, query_id, namespace, impersonation),
            media_type="text/event-stream",
            headers=sse_headers,
        )

    return await proxy_broker_request(
        memory, "/stream", watch,
        {"limit": limit, "cursor": cursor},
        impersonation=impersonation,
    )


@router.get("/sessions")
async def get_sessions(
    request: Request,
    watch: bool = Query(False, description="Stream sessions via SSE"),
    memory: str = Query("default", description=DESC_MEMORY),
    limit: Optional[int] = Query(None, description="Max sessions to return"),
    cursor: Optional[int] = Query(None, description=DESC_CURSOR),
    status: Optional[str] = Query(None, description="Filter by status (active/idle/error)"),
    date_from: Optional[str] = Query(None, description="Filter sessions from this date"),
    date_to: Optional[str] = Query(None, description="Filter sessions to this date"),
    search: Optional[str] = Query(None, description="Search by session ID or participant"),
    sort: Optional[str] = Query(None, description="Sort field (date, name, conversations)"),
    order: Optional[str] = Query(None, description="Sort order (asc/desc)"),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
):
    """Get or stream sessions from the broker. Sessions are global broker state, not memory-scoped, but the memory parameter selects which broker service to query."""
    return await proxy_broker_request(
        memory, "/sessions", watch,
        {
            "limit": limit,
            "cursor": cursor,
            "status": status,
            "dateFrom": date_from,
            "dateTo": date_to,
            "search": search,
            "sort": sort,
            "order": order,
        },
        impersonation=impersonation,
    )


@router.get("/sessions/{session_id}")
async def get_session(
    request: Request,
    session_id: str,
    memory: str = Query("default", description=DESC_MEMORY),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
):
    """Get a single session by ID from the broker."""
    return await proxy_broker_request(memory, f"/sessions/{session_id}", False, {}, impersonation=impersonation)
