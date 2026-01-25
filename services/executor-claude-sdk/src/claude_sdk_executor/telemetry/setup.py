"""OpenTelemetry tracer provider initialization.

Reads configuration from standard OTEL environment variables:
- OTEL_EXPORTER_OTLP_ENDPOINT: The OTLP endpoint URL (e.g., http://langfuse:4318)
- OTEL_EXPORTER_OTLP_HEADERS: Authentication headers
- OTEL_SERVICE_NAME: Service name for traces (defaults to executor-claude-sdk)
"""

import logging
import os
from typing import Optional

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

logger = logging.getLogger(__name__)

_tracer_provider: Optional[TracerProvider] = None
_tracer: Optional[trace.Tracer] = None


def init_telemetry() -> bool:
    """Initialize OpenTelemetry tracing from environment variables.
    
    Returns:
        True if telemetry was initialized, False if OTEL endpoint not configured.
    """
    global _tracer_provider, _tracer
    
    otel_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    if not otel_endpoint:
        logger.info("OTEL_EXPORTER_OTLP_ENDPOINT not set, telemetry disabled")
        return False
    
    service_name = os.getenv("OTEL_SERVICE_NAME", "executor-claude-sdk")
    
    # Create resource with service information
    resource = Resource.create({
        "service.name": service_name,
    })
    
    # Create tracer provider
    _tracer_provider = TracerProvider(resource=resource)
    trace.set_tracer_provider(_tracer_provider)
    
    # Create OTLP exporter with explicit headers configuration
    # When endpoint is explicitly set, we need to parse headers from env too
    headers_str = os.getenv("OTEL_EXPORTER_OTLP_HEADERS", "")
    headers = {}
    if headers_str:
        # Parse headers in format "key1=value1,key2=value2"
        for header in headers_str.split(","):
            if "=" in header:
                key, value = header.split("=", 1)
                headers[key.strip()] = value.strip()
        logger.info(f"Parsed OTEL headers: {list(headers.keys())}")
    
    otlp_exporter = OTLPSpanExporter(
        endpoint=f"{otel_endpoint}/v1/traces",
        headers=headers if headers else None,
    )
    
    # Add batch processor for efficient export
    span_processor = BatchSpanProcessor(otlp_exporter)
    _tracer_provider.add_span_processor(span_processor)
    
    # Create tracer
    _tracer = trace.get_tracer("claude-sdk-executor")
    
    logger.info(f"OpenTelemetry initialized: {service_name} -> {otel_endpoint}")
    return True


def get_tracer() -> trace.Tracer:
    """Get the configured tracer.
    
    Returns:
        The OpenTelemetry tracer, or a no-op tracer if not initialized.
    """
    if _tracer is None:
        # Return no-op tracer if not initialized
        return trace.get_tracer("claude-sdk-executor")
    return _tracer


def shutdown_telemetry() -> None:
    """Shutdown the tracer provider and flush pending spans."""
    global _tracer_provider
    
    if _tracer_provider is not None:
        _tracer_provider.shutdown()
        logger.info("OpenTelemetry shutdown complete")
