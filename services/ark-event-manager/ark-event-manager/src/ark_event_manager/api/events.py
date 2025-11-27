"""Event ingestion endpoint."""

from fastapi import Header, HTTPException, Request, Response

from ark_event_manager.transport import HTTPEventConsumer
from ark_event_manager.core.types import Protobuf

# Global consumer instance (set by main.py)
consumer: HTTPEventConsumer | None = None


def set_consumer(c: HTTPEventConsumer) -> None:
    """Set the global consumer instance."""
    global consumer
    consumer = c


async def receive_event(
    request: Request,
    x_correlation_id: str = Header(..., alias="X-Correlation-ID"),
) -> Response:
    """
    Receive an event via HTTP POST.

    Accepts protobuf-serialized Event objects and enqueues them for processing.
    """
    if consumer is None:
        raise HTTPException(status_code=503, detail="Event consumer not initialized")

    event_bytes: Protobuf = Protobuf(await request.body())

    if not event_bytes:
        raise HTTPException(status_code=400, detail="Empty event body")

    try:
        await consumer.enqueue(event_bytes, x_correlation_id)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to enqueue event: {str(e)}"
        ) from e

    return Response(
        content='{"status": "accepted"}',
        status_code=202,
        media_type="application/json",
    )



