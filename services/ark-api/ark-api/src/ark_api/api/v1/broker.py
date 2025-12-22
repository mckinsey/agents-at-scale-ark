"""Broker API endpoints for real-time streaming of traces, messages, and chunks."""
import json
import logging
import os
from typing import Optional

import httpx
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse, JSONResponse

from ark_sdk.client import with_ark_client

from ...utils.memory_client import get_memory_service_address, get_all_memory_resources

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/broker", tags=["broker"])

VERSION = "v1alpha1"
BROKER_CONNECT_TIMEOUT = float(os.getenv('BROKER_CONNECT_TIMEOUT', '10.0'))


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


sse_headers = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
}


@router.get("/traces")
async def get_traces(
    watch: bool = Query(False, description="Stream traces via SSE"),
    memory: str = Query("default", description="Memory resource name"),
):
    """Get or stream OTEL traces from the broker."""
    broker_url = await get_broker_url(memory)
    if not broker_url:
        return JSONResponse(
            content={"error": {"message": f"Memory service '{memory}' not available", "type": "service_unavailable"}},
            status_code=503,
        )

    if watch:
        url = f"{broker_url}/traces?watch=true"
        logger.info(f"Proxying trace SSE stream from {url}")
        return StreamingResponse(
            proxy_sse_stream(url),
            media_type="text/event-stream",
            headers=sse_headers,
        )

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{broker_url}/traces")
            return JSONResponse(content=response.json(), status_code=response.status_code)
    except httpx.ConnectError as e:
        logger.error(f"Failed to connect to broker: {e}")
        return JSONResponse(
            content={"error": {"message": "Failed to connect to broker service", "type": "connection_error"}},
            status_code=503,
        )
    except Exception as e:
        logger.error(f"Error fetching traces: {e}")
        return JSONResponse(
            content={"error": {"message": str(e), "type": "server_error"}},
            status_code=500,
        )


@router.get("/traces/{trace_id}")
async def get_trace(
    trace_id: str,
    watch: bool = Query(False, description="Stream trace spans via SSE"),
    from_beginning: bool = Query(True, alias="from-beginning", description="Include existing spans"),
    memory: str = Query("default", description="Memory resource name"),
):
    """Get or stream a specific trace from the broker."""
    broker_url = await get_broker_url(memory)
    if not broker_url:
        return JSONResponse(
            content={"error": {"message": f"Memory service '{memory}' not available", "type": "service_unavailable"}},
            status_code=503,
        )

    if watch:
        url = f"{broker_url}/traces/{trace_id}?watch=true"
        if from_beginning:
            url += "&from-beginning=true"
        logger.info(f"Proxying trace SSE stream from {url}")
        return StreamingResponse(
            proxy_sse_stream(url),
            media_type="text/event-stream",
            headers=sse_headers,
        )

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{broker_url}/traces/{trace_id}")
            return JSONResponse(content=response.json(), status_code=response.status_code)
    except httpx.ConnectError as e:
        logger.error(f"Failed to connect to broker: {e}")
        return JSONResponse(
            content={"error": {"message": "Failed to connect to broker service", "type": "connection_error"}},
            status_code=503,
        )
    except Exception as e:
        logger.error(f"Error fetching trace: {e}")
        return JSONResponse(
            content={"error": {"message": str(e), "type": "server_error"}},
            status_code=500,
        )


@router.get("/messages")
async def get_messages(
    watch: bool = Query(False, description="Stream messages via SSE"),
    conversation_id: str = Query(None, alias="conversation-id", description="Filter by conversation ID"),
    memory: str = Query("default", description="Memory resource name"),
):
    """Get or stream messages from the broker."""
    broker_url = await get_broker_url(memory)
    if not broker_url:
        return JSONResponse(
            content={"error": {"message": f"Memory service '{memory}' not available", "type": "service_unavailable"}},
            status_code=503,
        )

    if watch:
        url = f"{broker_url}/messages?watch=true"
        if conversation_id:
            url += f"&conversation_id={conversation_id}"
        logger.info(f"Proxying messages SSE stream from {url}")
        return StreamingResponse(
            proxy_sse_stream(url),
            media_type="text/event-stream",
            headers=sse_headers,
        )

    try:
        async with httpx.AsyncClient() as client:
            url = f"{broker_url}/messages"
            if conversation_id:
                url += f"?conversation_id={conversation_id}"
            response = await client.get(url)
            return JSONResponse(content=response.json(), status_code=response.status_code)
    except httpx.ConnectError as e:
        logger.error(f"Failed to connect to broker: {e}")
        return JSONResponse(
            content={"error": {"message": "Failed to connect to broker service", "type": "connection_error"}},
            status_code=503,
        )
    except Exception as e:
        logger.error(f"Error fetching messages: {e}")
        return JSONResponse(
            content={"error": {"message": str(e), "type": "server_error"}},
            status_code=500,
        )


@router.get("/chunks")
async def get_chunks(
    watch: bool = Query(False, description="Stream chunks via SSE"),
    query_id: str = Query(None, alias="query-id", description="Filter by query ID"),
    memory: str = Query("default", description="Memory resource name"),
):
    """Get or stream LLM chunks from the broker."""
    broker_url = await get_broker_url(memory)
    if not broker_url:
        return JSONResponse(
            content={"error": {"message": f"Memory service '{memory}' not available", "type": "service_unavailable"}},
            status_code=503,
        )

    if watch:
        if query_id:
            url = f"{broker_url}/stream/{query_id}?from-beginning=true"
        else:
            url = f"{broker_url}/stream?watch=true"

        logger.info(f"Proxying chunks SSE stream from {url}")
        return StreamingResponse(
            proxy_sse_stream(url),
            media_type="text/event-stream",
            headers=sse_headers,
        )

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{broker_url}/stream-statistics")
            return JSONResponse(content=response.json(), status_code=response.status_code)
    except httpx.ConnectError as e:
        logger.error(f"Failed to connect to broker: {e}")
        return JSONResponse(
            content={"error": {"message": "Failed to connect to broker service", "type": "connection_error"}},
            status_code=503,
        )
    except Exception as e:
        logger.error(f"Error fetching chunks: {e}")
        return JSONResponse(
            content={"error": {"message": str(e), "type": "server_error"}},
            status_code=500,
        )


@router.delete("/traces")
async def purge_traces(
    memory: str = Query("default", description="Memory resource name"),
):
    """Purge all traces from the broker."""
    broker_url = await get_broker_url(memory)
    if not broker_url:
        return JSONResponse(
            content={"error": {"message": f"Memory service '{memory}' not available", "type": "service_unavailable"}},
            status_code=503,
        )

    try:
        async with httpx.AsyncClient() as client:
            response = await client.delete(f"{broker_url}/traces")
            return JSONResponse(content=response.json(), status_code=response.status_code)
    except httpx.ConnectError as e:
        logger.error(f"Failed to connect to broker: {e}")
        return JSONResponse(
            content={"error": {"message": "Failed to connect to broker service", "type": "connection_error"}},
            status_code=503,
        )
    except Exception as e:
        logger.error(f"Error purging traces: {e}")
        return JSONResponse(
            content={"error": {"message": str(e), "type": "server_error"}},
            status_code=500,
        )


@router.get("/events")
async def get_events(
    watch: bool = Query(False, description="Stream events via SSE"),
    query_id: str = Query(None, alias="query-id", description="Filter by query ID"),
    memory: str = Query("default", description="Memory resource name"),
):
    """Get or stream operation events from the broker."""
    broker_url = await get_broker_url(memory)
    if not broker_url:
        return JSONResponse(
            content={"error": {"message": f"Memory service '{memory}' not available", "type": "service_unavailable"}},
            status_code=503,
        )

    if watch:
        url = f"{broker_url}/events?watch=true"
        if query_id:
            url = f"{broker_url}/events/{query_id}?watch=true"
        logger.info(f"Proxying events SSE stream from {url}")
        return StreamingResponse(
            proxy_sse_stream(url),
            media_type="text/event-stream",
            headers=sse_headers,
        )

    try:
        async with httpx.AsyncClient() as client:
            url = f"{broker_url}/events"
            if query_id:
                url = f"{broker_url}/events/{query_id}"
            response = await client.get(url)
            return JSONResponse(content=response.json(), status_code=response.status_code)
    except httpx.ConnectError as e:
        logger.error(f"Failed to connect to broker: {e}")
        return JSONResponse(
            content={"error": {"message": "Failed to connect to broker service", "type": "connection_error"}},
            status_code=503,
        )
    except Exception as e:
        logger.error(f"Error fetching events: {e}")
        return JSONResponse(
            content={"error": {"message": str(e), "type": "server_error"}},
            status_code=500,
        )


@router.delete("/events")
async def purge_events(
    memory: str = Query("default", description="Memory resource name"),
):
    """Purge all events from the broker."""
    broker_url = await get_broker_url(memory)
    if not broker_url:
        return JSONResponse(
            content={"error": {"message": f"Memory service '{memory}' not available", "type": "service_unavailable"}},
            status_code=503,
        )

    try:
        async with httpx.AsyncClient() as client:
            response = await client.delete(f"{broker_url}/events")
            return JSONResponse(content=response.json(), status_code=response.status_code)
    except httpx.ConnectError as e:
        logger.error(f"Failed to connect to broker: {e}")
        return JSONResponse(
            content={"error": {"message": "Failed to connect to broker service", "type": "connection_error"}},
            status_code=503,
        )
    except Exception as e:
        logger.error(f"Error purging events: {e}")
        return JSONResponse(
            content={"error": {"message": str(e), "type": "server_error"}},
            status_code=500,
        )
