"""API routes for Ark Event Manager."""

from fastapi import APIRouter

from .events import receive_event
from .memory import add_messages, get_messages, get_sessions
from .stream import complete_stream, read_stream, write_stream

router = APIRouter()

# Events endpoints
router.add_api_route(
    "/events",
    receive_event,
    methods=["POST"],
    tags=["events"],
    summary="Receive an event",
    description="Accepts protobuf-serialized Event objects and enqueues them for processing.",
)

# Memory endpoints
router.add_api_route(
    "/messages",
    get_messages,
    methods=["GET"],
    tags=["memory"],
    summary="Get messages with optional filtering",
    description="Get messages for a session or all messages (implements MemoryInterface.GetMessages).",
)
router.add_api_route(
    "/messages",
    add_messages,
    methods=["POST"],
    tags=["memory"],
    summary="Add messages to a session",
    description="Add messages to a session (implements MemoryInterface.AddMessages).",
)
router.add_api_route(
    "/sessions",
    get_sessions,
    methods=["GET"],
    tags=["memory"],
    summary="Get all session IDs",
    description="Get all session IDs (implements MemoryInterface.GetSessions).",
)

# Stream endpoints
router.add_api_route(
    "/stream/{query_id}",
    read_stream,
    methods=["GET"],
    tags=["stream"],
    summary="Read stream for a query",
    description="Read stream for a query (Server-Sent Events).",
)
router.add_api_route(
    "/stream/{query_id}",
    write_stream,
    methods=["POST"],
    tags=["stream"],
    summary="Write chunks to a stream",
    description="Write chunks to a stream (NDJSON format).",
)
router.add_api_route(
    "/stream/{query_id}/complete",
    complete_stream,
    methods=["POST"],
    tags=["stream"],
    summary="Mark query execution as complete",
    description="Mark query execution as complete.",
)



