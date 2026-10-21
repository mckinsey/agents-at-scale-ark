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
from kubernetes_asyncio.client.rest import ApiException
from ark_sdk.impersonation import ImpersonationConfig

from ark_sdk.client import with_ark_client

from ...auth.dependencies import get_impersonation_config
from ...constants.query_param_descriptions import NAMESPACE_DESCRIPTION
from ...constants.query_phases import QUERY_PHASE_ERROR, TERMINAL_QUERY_PHASES

from ...utils.memory_client import get_memory_service_address, get_all_memory_resources
from ...utils.streaming import StreamingErrorResponse
from ...utils.url_validation import validate_path_segment, build_safe_url, validate_and_build_url

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/broker", tags=["broker"])

VERSION = "v1alpha1"
BROKER_CONNECT_TIMEOUT = float(os.getenv('BROKER_CONNECT_TIMEOUT', '10.0'))
BROKER_CHUNK_READ_TIMEOUT_SECONDS = float(os.getenv('BROKER_CHUNK_READ_TIMEOUT_SECONDS', '330'))
CHUNK_PHASE_POLL_INTERVAL_SECONDS = 1.0
CHUNK_TERMINAL_GRACE_SECONDS = 0.5

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


async def proxy_sse_stream(url: str, read_timeout: Optional[float] = None):
    """Proxy SSE stream from broker service."""
    timeout = httpx.Timeout(BROKER_CONNECT_TIMEOUT, read=read_timeout)
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
    except httpx.ReadTimeout:
        logger.warning(f"No data from broker at {url} for {read_timeout}s, closing stream")
        error: StreamingErrorResponse = {
            "error": {
                "message": f"No data from broker for {read_timeout}s",
                "type": "timeout_error",
                "code": "broker_read_timeout",
            }
        }
        yield f"data: {json.dumps(error)}\n\n"
        yield SSE_DONE_EVENT
    except Exception as e:
        logger.error(f"Error proxying SSE stream: {e}")
        yield f"data: {json.dumps({'error': {'message': str(e), 'type': 'server_error'}})}\n\n"


async def fetch_query_status(ark_client, query_name: str):
    """Return the Query's status, or None when the Query cannot be read."""
    try:
        query = await ark_client.queries.a_get(query_name)
    except ApiException as e:
        if e.status in (403, 404):
            logger.debug(f"Query {query_name} not readable ({e.status}), relying on broker idle timeout")
            return None
        raise
    return query.status


def terminal_sse_events(status) -> list[str]:
    """Build the closing SSE events for a Query that reached a terminal phase."""
    if status.phase != QUERY_PHASE_ERROR:
        return [SSE_DONE_EVENT]
    message = "Query failed"
    if status.response and status.response.content:
        message = status.response.content
    error: StreamingErrorResponse = {
        "error": {"message": message, "type": "server_error", "code": "query_error"}
    }
    return [f"data: {json.dumps(error)}\n\n", SSE_DONE_EVENT]


async def watch_chunks_until_terminal(
    url: str,
    query_name: str,
    namespace: Optional[str],
    impersonation: Optional[ImpersonationConfig],
):
    """Relay the broker chunk stream, closing it once the Query reaches a terminal phase."""
    stream = proxy_sse_stream(url, read_timeout=BROKER_CHUNK_READ_TIMEOUT_SECONDS)
    next_line = asyncio.ensure_future(anext(stream))
    loop = asyncio.get_running_loop()
    terminal_status = None
    deadline = None
    try:
        async with with_ark_client(namespace, VERSION, impersonation=impersonation) as ark_client:
            while True:
                timeout = CHUNK_PHASE_POLL_INTERVAL_SECONDS if deadline is None else max(0.0, deadline - loop.time())
                done, _ = await asyncio.wait({next_line}, timeout=timeout)
                if done:
                    try:
                        line = next_line.result()
                    except StopAsyncIteration:
                        return
                    yield line
                    if line.strip() == SSE_DONE_LINE:
                        return
                    next_line = asyncio.ensure_future(anext(stream))
                    continue
                if terminal_status is not None:
                    logger.info(f"Query {query_name} is {terminal_status.phase} but the broker sent no [DONE], closing stream")
                    for event in terminal_sse_events(terminal_status):
                        yield event
                    return
                status = await fetch_query_status(ark_client, query_name)
                if status and status.phase in TERMINAL_QUERY_PHASES:
                    terminal_status = status
                    deadline = loop.time() + CHUNK_TERMINAL_GRACE_SECONDS
    finally:
        next_line.cancel()
        with contextlib.suppress(asyncio.CancelledError, StopAsyncIteration):
            await next_line
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
