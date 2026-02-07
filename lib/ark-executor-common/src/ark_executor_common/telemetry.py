from dataclasses import dataclass
from typing import Any, Dict, Optional

from opentelemetry import trace
from opentelemetry.context import Context
from opentelemetry.propagate import extract
from opentelemetry.trace import Span, Status, StatusCode


@dataclass
class TraceContext:
    context: Context
    query_id: Optional[str] = None
    session_id: Optional[str] = None


def extract_trace_context(headers: Dict[str, str]) -> TraceContext:
    normalized = {k.lower(): v for k, v in headers.items()}
    return TraceContext(
        context=extract(normalized),
        query_id=normalized.get("x-query-id"),
        session_id=normalized.get("x-session-id"),
    )


def get_tracer(name: str = "ark-executor"):
    return trace.get_tracer(name)


_active_spans: Dict[str, Span] = {}


async def pre_tool_hook(input_data: Dict[str, Any], tool_use_id: Optional[str], context: Any):
    tool_name = input_data.get("tool_name", "unknown")
    span = get_tracer().start_span(f"tool.{tool_name}")
    span.set_attribute("tool.name", tool_name)
    span.set_attribute("tool.input", str(input_data.get("tool_input", {}))[:1024])
    if tool_use_id:
        _active_spans[tool_use_id] = span
    return {}


async def post_tool_hook(input_data: Dict[str, Any], tool_use_id: Optional[str], context: Any):
    if tool_use_id and tool_use_id in _active_spans:
        span = _active_spans.pop(tool_use_id)
        span.set_attribute("tool.result", str(input_data.get("tool_response", ""))[:1024])
        span.set_status(Status(StatusCode.OK))
        span.end()
    return {}
