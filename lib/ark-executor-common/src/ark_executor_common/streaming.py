"""SSE streaming helpers for Ark execution engines."""

import json
import logging
from typing import Any, AsyncGenerator, Dict

logger = logging.getLogger(__name__)


def format_sse_event(data: Any, event_type: str = None) -> str:
    if event_type:
        return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
    return f"data: {json.dumps(data)}\n\n"


def format_sse_chunk(chunk: Any) -> str:
    return format_sse_event({"type": "chunk", "chunk": chunk})


def format_sse_result(result: Dict[str, Any]) -> str:
    return format_sse_event({"type": "result", "result": result})


def format_sse_error(error: str) -> str:
    return format_sse_event({"type": "error", "error": error})


def format_sse_done() -> str:
    return "data: [DONE]\n\n"
