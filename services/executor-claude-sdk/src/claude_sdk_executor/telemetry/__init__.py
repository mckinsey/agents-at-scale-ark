"""OpenTelemetry integration for Claude SDK executor.

This module provides distributed tracing capabilities that integrate with
Ark's OpenTelemetry pipeline. When OTEL_EXPORTER_OTLP_ENDPOINT is configured,
traces are automatically exported to the same backend as the Ark controller
(e.g., Langfuse).
"""

from .setup import init_telemetry, get_tracer, shutdown_telemetry
from .context import extract_trace_context, TraceContext
from .hooks import (
    create_telemetry_hooks,
    TelemetrySpanManager,
    LifecycleSpanManager,
    create_hook_span,
    end_hook_span,
)

__all__ = [
    "init_telemetry",
    "get_tracer",
    "shutdown_telemetry",
    "extract_trace_context",
    "TraceContext",
    "create_telemetry_hooks",
    "TelemetrySpanManager",
    "LifecycleSpanManager",
    "create_hook_span",
    "end_hook_span",
]
