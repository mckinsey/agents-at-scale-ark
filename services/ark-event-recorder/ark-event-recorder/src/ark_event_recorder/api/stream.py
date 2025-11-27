"""Streaming API endpoints (replaces ark-cluster-memory streaming)."""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from ..storage import StreamStorage

router = APIRouter()

# Global stream storage instance (set by main.py)
stream_storage: StreamStorage | None = None


def set_stream_storage(s: StreamStorage) -> None:
    """Set the global stream storage instance."""
    global stream_storage
    stream_storage = s


@router.get("/{query_id}")
async def read_stream(
    query_id: str,
    from_beginning: bool = Query(False, alias="from-beginning"),
    wait_for_query: str | None = Query(None, alias="wait-for-query"),
) -> StreamingResponse:
    """
    Read stream for a query (Server-Sent Events).

    Args:
        query_id: Query ID to stream events for
        from_beginning: If true, send all existing messages first
        wait_for_query: Optional timeout to wait for query execution to start

    Returns:
        Server-Sent Events stream
    """
    if stream_storage is None:
        raise HTTPException(status_code=503, detail="Stream storage not initialized")

    async def generate():
        try:
            async for chunk in stream_storage.read_stream(
                query_id, from_beginning, wait_for_query
            ):
                yield f"data: {chunk}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {{\"error\": \"{str(e)}\"}}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.post("/{query_id}")
async def write_stream(query_id: str, request: dict) -> dict:
    """
    Write chunks to a stream (NDJSON format).

    Args:
        query_id: Query ID to write chunks for
        request: NDJSON chunks in request body

    Returns:
        Status response
    """
    if stream_storage is None:
        raise HTTPException(status_code=503, detail="Stream storage not initialized")

    try:
        await stream_storage.write_stream(query_id, request)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to write stream: {str(e)}"
        ) from e


@router.post("/{query_id}/complete")
async def complete_stream(query_id: str) -> dict:
    """
    Mark query execution as complete.

    Args:
        query_id: Query ID to mark as complete

    Returns:
        Status response
    """
    if stream_storage is None:
        raise HTTPException(status_code=503, detail="Stream storage not initialized")

    try:
        await stream_storage.complete_stream(query_id)
        return {"status": "completed", "query": query_id}
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to complete stream: {str(e)}"
        ) from e

