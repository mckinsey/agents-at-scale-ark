"""Broker API endpoints for real-time streaming of traces, messages, and chunks."""
import json
import logging
import os
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse, JSONResponse

from ark_sdk.client import with_ark_client

from ...utils.memory_client import get_memory_service_address, get_all_memory_resources

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/broker", tags=["broker"])

VERSION = "v1alpha1"
BROKER_CONNECT_TIMEOUT = float(os.getenv('BROKER_CONNECT_TIMEOUT', '10.0'))

sse_headers = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
}


async def get_broker_url(memory_name: str) -> Optional[str]:
    """Get the broker URL from a Memory resource."""
    try:
        async with with_ark_client(None, VERSION) as client:
            memory_dicts = await get_all_memory_resources(client, memory_name)
            if not memory_dicts:
                logger.warning(f"No memory resource found with name: {memory_name}")
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
        yield f"data: {json.dumps({'error': {'message': 'Failed to connect to broker service', 'type': 'connection_error'}})}\n\n"
    except Exception as e:
        logger.error(f"Error proxying SSE stream: {e}")
        yield f"data: {json.dumps({'error': {'message': str(e), 'type': 'server_error'}})}\n\n"


async def proxy_broker_request(
    memory: str,
    path: str,
    watch: bool = False,
    params: Optional[dict] = None,
):
    """Generic proxy for broker requests - handles both SSE streaming and JSON fetching."""
    broker_url = await get_broker_url(memory)
    if not broker_url:
        return JSONResponse(
            content={"error": {"message": f"Memory service '{memory}' not available", "type": "service_unavailable"}},
            status_code=503,
        )

    query_params = {k: v for k, v in (params or {}).items() if v is not None}

    if watch:
        query_params["watch"] = "true"
        url = f"{broker_url}{path}"
        if query_params:
            url += f"?{urlencode(query_params)}"
        logger.info(f"Proxying SSE stream from {url}")
        return StreamingResponse(
            proxy_sse_stream(url),
            media_type="text/event-stream",
            headers=sse_headers,
        )

    try:
        async with httpx.AsyncClient() as client:
            url = f"{broker_url}{path}"
            if query_params:
                url += f"?{urlencode(query_params)}"
            response = await client.get(url)
            return JSONResponse(content=response.json(), status_code=response.status_code)
    except httpx.ConnectError as e:
        logger.error(f"Failed to connect to broker: {e}")
        return JSONResponse(
            content={"error": {"message": "Failed to connect to broker service", "type": "connection_error"}},
            status_code=503,
        )
    except Exception as e:
        logger.error(f"Error fetching from broker: {e}")
        return JSONResponse(
            content={"error": {"message": str(e), "type": "server_error"}},
            status_code=500,
        )


@router.get("/traces")
async def get_traces(
    watch: bool = Query(False, description="Stream traces via SSE"),
    memory: str = Query("default", description="Memory resource name"),
    limit: int = Query(100, description="Max traces to return"),
    cursor: Optional[int] = Query(None, description="Cursor for pagination"),
):
    """Get or stream OTEL traces from the broker."""
    return await proxy_broker_request(
        memory, "/traces", watch,
        {"limit": limit, "cursor": cursor}
    )


@router.get("/traces/{trace_id}")
async def get_trace(
    trace_id: str,
    watch: bool = Query(False, description="Stream trace spans via SSE"),
    from_beginning: bool = Query(False, alias="from-beginning", description="Include existing spans"),
    cursor: Optional[int] = Query(None, description="Cursor for pagination/streaming"),
    memory: str = Query("default", description="Memory resource name"),
):
    """Get or stream a specific trace from the broker."""
    params = {"cursor": cursor}
    if from_beginning:
        params["from-beginning"] = "true"
    return await proxy_broker_request(memory, f"/traces/{trace_id}", watch, params)


@router.get("/messages")
async def get_messages(
    watch: bool = Query(False, description="Stream messages via SSE"),
    memory: str = Query("default", description="Memory resource name"),
    limit: int = Query(100, description="Max messages to return"),
    cursor: Optional[int] = Query(None, description="Cursor for pagination"),
    conversation_id: Optional[str] = Query(None, description="Filter by conversation ID"),
    query_id: Optional[str] = Query(None, description="Filter by query ID"),
):
    """Get or stream messages from the broker."""
    return await proxy_broker_request(
        memory, "/messages", watch,
        {"limit": limit, "cursor": cursor, "conversation_id": conversation_id, "query_id": query_id}
    )


@router.get("/events")
async def get_events(
    watch: bool = Query(False, description="Stream events via SSE"),
    memory: str = Query("default", description="Memory resource name"),
    limit: int = Query(100, description="Max events to return"),
    cursor: Optional[int] = Query(None, description="Cursor for pagination"),
):
    """Get or stream operation events from the broker."""
    return await proxy_broker_request(
        memory, "/events", watch,
        {"limit": limit, "cursor": cursor}
    )


@router.get("/events/{query_id}")
async def get_events_by_query(
    query_id: str,
    watch: bool = Query(False, description="Stream events via SSE"),
    from_beginning: bool = Query(False, alias="from-beginning", description="Include existing events"),
    cursor: Optional[int] = Query(None, description="Cursor for pagination/streaming"),
    memory: str = Query("default", description="Memory resource name"),
    limit: int = Query(100, description="Max events to return"),
):
    """Get or stream events for a specific query."""
    params = {"limit": limit, "cursor": cursor}
    if from_beginning:
        params["from-beginning"] = "true"
    return await proxy_broker_request(memory, f"/events/{query_id}", watch, params)


@router.get("/chunks")
async def get_chunks(
    watch: bool = Query(False, description="Stream chunks via SSE"),
    query_id: Optional[str] = Query(None, alias="query-id", description="Filter by query ID"),
    memory: str = Query("default", description="Memory resource name"),
    limit: int = Query(100, description="Max chunks to return"),
    cursor: Optional[int] = Query(None, description="Cursor for pagination"),
):
    """Get or stream LLM chunks from the broker."""
    if watch and query_id:
        broker_url = await get_broker_url(memory)
        if not broker_url:
            return JSONResponse(
                content={"error": {"message": f"Memory service '{memory}' not available", "type": "service_unavailable"}},
                status_code=503,
            )
        url = f"{broker_url}/stream/{query_id}?from-beginning=true"
        logger.info(f"Proxying chunks SSE stream from {url}")
        return StreamingResponse(
            proxy_sse_stream(url),
            media_type="text/event-stream",
            headers=sse_headers,
        )

    return await proxy_broker_request(
        memory, "/stream", watch,
        {"limit": limit, "cursor": cursor}
    )


async def proxy_broker_delete(memory: str, path: str):
    """Proxy DELETE requests to broker."""
    broker_url = await get_broker_url(memory)
    if not broker_url:
        return JSONResponse(
            content={"error": {"message": f"Memory service '{memory}' not available", "type": "service_unavailable"}},
            status_code=503,
        )
    try:
        async with httpx.AsyncClient() as client:
            response = await client.delete(f"{broker_url}{path}")
            return JSONResponse(content=response.json(), status_code=response.status_code)
    except httpx.ConnectError as e:
        logger.error(f"Failed to connect to broker: {e}")
        return JSONResponse(
            content={"error": {"message": "Failed to connect to broker service", "type": "connection_error"}},
            status_code=503,
        )
    except Exception as e:
        logger.error(f"Error in DELETE request: {e}")
        return JSONResponse(
            content={"error": {"message": str(e), "type": "server_error"}},
            status_code=500,
        )


@router.delete("/traces")
async def purge_traces(memory: str = Query("default", description="Memory resource name")):
    """Purge all traces from the broker."""
    return await proxy_broker_delete(memory, "/traces")


@router.delete("/events")
async def purge_events(memory: str = Query("default", description="Memory resource name")):
    """Purge all events from the broker."""
    return await proxy_broker_delete(memory, "/events")


@router.delete("/messages")
async def purge_messages(memory: str = Query("default", description="Memory resource name")):
    """Purge all messages from the broker."""
    return await proxy_broker_delete(memory, "/messages")


@router.delete("/chunks")
async def purge_chunks(memory: str = Query("default", description="Memory resource name")):
    """Purge all chunks from the broker."""
    return await proxy_broker_delete(memory, "/stream")
