"""Trace context extraction from HTTP headers.

Extracts W3C Trace Context headers (traceparent, tracestate) from incoming
HTTP requests to create child spans that link to the Ark controller's trace.
"""

import logging
from dataclasses import dataclass
from typing import Dict, Optional

from opentelemetry import trace
from opentelemetry.context import Context
from opentelemetry.propagate import extract

logger = logging.getLogger(__name__)


@dataclass
class TraceContext:
    """Container for extracted trace context."""
    
    context: Context
    """The OpenTelemetry context with parent span information."""
    
    query_id: Optional[str] = None
    """Query ID from Ark for correlation."""
    
    session_id: Optional[str] = None
    """Session ID from Ark for grouping related traces."""

    @property
    def trace_id(self) -> Optional[str]:
        """Get the trace ID as a hex string."""
        span_context = trace.get_current_span(self.context).get_span_context()
        if span_context.is_valid:
            return format(span_context.trace_id, '032x')
        return None

    @property
    def parent_span_id(self) -> Optional[str]:
        """Get the parent span ID as a hex string."""
        span_context = trace.get_current_span(self.context).get_span_context()
        if span_context.is_valid:
            return format(span_context.span_id, '016x')
        return None


def extract_trace_context(headers: Dict[str, str]) -> TraceContext:
    """Extract trace context from HTTP headers.
    
    Args:
        headers: HTTP headers dictionary (case-insensitive keys preferred)
        
    Returns:
        TraceContext with parent span context if available
    """
    # Normalize header keys to lowercase for consistent lookup
    normalized_headers = {k.lower(): v for k, v in headers.items()}
    
    # Extract W3C trace context using OpenTelemetry propagator
    context = extract(normalized_headers)
    
    # Extract Ark-specific headers
    query_id = normalized_headers.get("x-query-id")
    session_id = normalized_headers.get("x-session-id")
    
    trace_ctx = TraceContext(
        context=context,
        query_id=query_id,
        session_id=session_id,
    )
    
    if trace_ctx.trace_id:
        logger.debug(f"Extracted trace context: trace_id={trace_ctx.trace_id}, parent_span_id={trace_ctx.parent_span_id}")
    else:
        logger.debug("No parent trace context found, will create new trace")
    
    return trace_ctx
