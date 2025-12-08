"""OTLP trace ingestion endpoint."""

import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Request, Response, status
from opentelemetry.proto.collector.trace.v1.trace_service_pb2 import ExportTraceServiceRequest
from sqlmodel.ext.asyncio import AsyncSession

from ark_sessions.core.config import logger
from ark_sessions.core.database import get_session
from ark_sessions.models import Span, SpanEvent, Trace
from ark_sessions.storage.traces import TraceStorage

router = APIRouter(prefix="/v1", tags=["telemetry"])


def extract_session_id_from_attributes(attributes: dict[str, Any]) -> str | None:
    """Extract session_id from OTEL attributes."""
    if "ark.session_id" in attributes:
        val = attributes["ark.session_id"]
        if isinstance(val, str) and val:
            return val
    if "session_id" in attributes:
        val = attributes["session_id"]
        if isinstance(val, str) and val:
            return val
    return None


def attributes_to_dict(attrs: Any) -> dict[str, Any]:
    """Convert OTEL protobuf attributes to Python dict."""
    result = {}
    if hasattr(attrs, "__iter__"):
        for attr in attrs:
            key = attr.key
            value = attr.value
            if value.HasField("string_value"):
                result[key] = value.string_value
            elif value.HasField("int_value"):
                result[key] = value.int_value
            elif value.HasField("double_value"):
                result[key] = value.double_value
            elif value.HasField("bool_value"):
                result[key] = value.bool_value
            elif value.HasField("array_value"):
                result[key] = [v.string_value for v in value.array_value.values]
    return result


def parse_protobuf_traces(body: bytes) -> list[Any]:
    """Parse OTLP protobuf format."""
    export_request = ExportTraceServiceRequest()
    export_request.ParseFromString(body)
    return list(export_request.resource_spans)


def parse_json_traces(body: bytes) -> list[Any]:
    """Parse OTLP JSON format (not yet implemented)."""
    raise NotImplementedError("OTLP JSON format not yet supported")


def determine_session_id(
    resource_attrs: dict[str, Any],
    span_attrs: dict[str, Any],
    trace_id: str,
) -> str:
    """Determine session_id with priority: span_attrs > resource_attrs > trace_id."""
    session_id = extract_session_id_from_attributes(span_attrs)
    if session_id:
        return session_id
    
    session_id = extract_session_id_from_attributes(resource_attrs)
    if session_id:
        return session_id
    
    return trace_id


def nanoseconds_to_datetime(nanos: int) -> datetime:
    """Convert nanoseconds since epoch to datetime."""
    return datetime.fromtimestamp(nanos / 1_000_000_000)


def create_trace_model(span_proto: Any, session_id: str) -> Trace:
    """Create Trace model from protobuf span."""
    trace_id = span_proto.trace_id.hex() if span_proto.trace_id else ""
    
    trace = Trace(
        trace_id=trace_id,
        session_id=session_id,
        start_time=nanoseconds_to_datetime(span_proto.start_time_unix_nano)
        if span_proto.start_time_unix_nano
        else datetime.utcnow(),
    )
    
    if span_proto.end_time_unix_nano:
        trace.end_time = nanoseconds_to_datetime(span_proto.end_time_unix_nano)
    
    return trace


def create_span_model(
    span_proto: Any,
    trace_id: str,
    session_id: str,
    span_attrs: dict[str, Any],
    resource_attrs: dict[str, Any],
    parent_span_id: str | None,
) -> Span:
    """Create Span model from protobuf span."""
    span_id = span_proto.span_id.hex() if span_proto.span_id else ""
    
    span = Span(
        trace_id=trace_id,
        span_id=span_id,
        session_id=session_id,
        name=span_proto.name or "",
        kind=span_proto.kind.name if span_proto.kind else "SPAN_KIND_UNSPECIFIED",
        start_time=nanoseconds_to_datetime(span_proto.start_time_unix_nano)
        if span_proto.start_time_unix_nano
        else datetime.utcnow(),
        attributes=span_attrs,
        resource_attrs=resource_attrs,
    )
    
    if parent_span_id:
        span.parent_span_id = parent_span_id
    
    if span_proto.end_time_unix_nano:
        span.end_time = nanoseconds_to_datetime(span_proto.end_time_unix_nano)
    
    # Determine status (2 = ERROR in OTEL)
    if span_proto.status and span_proto.status.code == 2:
        span.status = "error"
    else:
        span.status = "ok"
    
    return span


def create_span_events(
    span_proto: Any,
    trace_id: str,
    span_id: str,
    session_id: str,
) -> list[SpanEvent]:
    """Create SpanEvent models from protobuf span events."""
    span_events = []
    
    for event_proto in span_proto.events:
        event_attrs = attributes_to_dict(event_proto.attributes)
        span_event = SpanEvent(
            trace_id=trace_id,
            span_id=span_id,
            session_id=session_id,
            name=event_proto.name or "",
            time=nanoseconds_to_datetime(event_proto.time_unix_nano)
            if event_proto.time_unix_nano
            else datetime.utcnow(),
            attributes=event_attrs,
        )
        span_events.append(span_event)
    
    return span_events


async def _process_single_span(
    span_proto: Any,
    resource_attrs: dict[str, Any],
    trace_storage: TraceStorage,
) -> bool:
    """
    Process a single span proto and store it.
    
    Returns:
        True if span was processed successfully, False if skipped
    """
    # Extract IDs
    trace_id = span_proto.trace_id.hex() if span_proto.trace_id else ""
    span_id = span_proto.span_id.hex() if span_proto.span_id else ""
    
    if not trace_id or not span_id:
        logger.warning("Skipping span with missing trace_id or span_id")
        return False
    
    parent_span_id = (
        span_proto.parent_span_id.hex() if span_proto.parent_span_id else None
    )
    
    # Extract attributes and determine session_id
    span_attrs = attributes_to_dict(span_proto.attributes)
    session_id = determine_session_id(resource_attrs, span_attrs, trace_id)
    
    # Create models
    trace = create_trace_model(span_proto, session_id)
    span = create_span_model(
        span_proto, trace_id, session_id, span_attrs, resource_attrs, parent_span_id
    )
    span_events = create_span_events(span_proto, trace_id, span_id, session_id)
    
    # Store
    await trace_storage.store_trace(trace, [span], span_events)
    
    logger.info(
        f"Processed trace | "
        f"trace_id={trace_id[:8]}... | "
        f"span_id={span_id[:8]}... | "
        f"session_id={session_id[:8] if session_id else 'none'}... | "
        f"name={span.name}"
    )
    
    return True


async def process_resource_span(
    resource_span: Any,
    trace_storage: TraceStorage,
) -> int:
    """Process a single resource span and return number of spans processed."""
    resource_attrs = attributes_to_dict(resource_span.resource.attributes)
    processed = 0
    
    for scope_span in resource_span.scope_spans:
        for span_proto in scope_span.spans:
            if await _process_single_span(span_proto, resource_attrs, trace_storage):
                processed += 1
    
    return processed


def _create_error_response(message: str, status_code: int) -> Response:
    """Create a standardized error response."""
    return Response(
        content=json.dumps({"status": "error", "message": message}),
        status_code=status_code,
        media_type="application/json",
    )


def _create_success_response(traces_processed: int) -> Response:
    """Create a standardized success response."""
    return Response(
        content=json.dumps({"status": "accepted", "traces": traces_processed}),
        status_code=status.HTTP_202_ACCEPTED,
        media_type="application/json",
    )


def _parse_traces_from_request(body: bytes, content_type: str) -> list[Any]:
    """
    Parse OTLP traces from request body based on content type.
    
    Raises:
        ValueError: If parsing fails or format is not supported
    """
    # Explicit protobuf content types
    if "application/x-protobuf" in content_type or "application/vnd.opentelemetry.proto" in content_type:
        return parse_protobuf_traces(body)
    
    # Explicit JSON content type
    if "application/json" in content_type:
        return parse_json_traces(body)
    
    # No content type or unknown - try protobuf (most common)
    return parse_protobuf_traces(body)


async def _process_all_traces(
    traces_data: list[Any],
    trace_storage: TraceStorage,
) -> int:
    """Process all resource spans and return total number of spans processed."""
    total_processed = 0
    for resource_span in traces_data:
        processed = await process_resource_span(resource_span, trace_storage)
        total_processed += processed
    return total_processed


@router.post("/traces")
async def receive_otlp_traces(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Receive OTLP traces (protobuf or JSON format)."""
    trace_storage = TraceStorage(session)
    
    try:
        body = await request.body()
        content_type = request.headers.get("content-type", "")
        
        traces_data = _parse_traces_from_request(body, content_type)
        
        if not traces_data:
            return _create_error_response("No traces data", status.HTTP_400_BAD_REQUEST)
        
        total_processed = await _process_all_traces(traces_data, trace_storage)
        return _create_success_response(total_processed)
    
    except NotImplementedError as e:
        logger.warning(f"Unsupported format requested: {e}")
        return _create_error_response(str(e), status.HTTP_501_NOT_IMPLEMENTED)
    except Exception as e:
        logger.error(f"Failed to process OTLP traces: {e}", exc_info=True)
        return _create_error_response("Invalid OTLP format", status.HTTP_400_BAD_REQUEST)

__all__ = ["router"]
