"""OpenTelemetry hooks for Claude SDK execution.

Creates spans for tool calls that integrate with Ark's trace hierarchy.
"""

import logging
import time
from typing import Any, Callable, Dict, Optional

from opentelemetry import context as otel_context
from opentelemetry import trace
from opentelemetry.trace import Span, Status, StatusCode

from .context import TraceContext
from .setup import get_tracer

logger = logging.getLogger(__name__)

# Store active spans keyed by tool_use_id for correlation between Pre and Post hooks
_active_tool_spans: Dict[str, Span] = {}


async def _pre_tool_use_hook(
    input_data: Dict[str, Any],
    tool_use_id: Optional[str],
    context: Any,
) -> Dict[str, Any]:
    """Hook called before a tool executes. Creates a span for the tool call.
    
    Args:
        input_data: Contains tool_name, tool_input, hook_event_name, session_id, etc.
        tool_use_id: Unique ID for this tool call (correlates with PostToolUse)
        context: Reserved for future use
        
    Returns:
        Empty dict to allow the operation to proceed
    """
    if input_data.get("hook_event_name") != "PreToolUse":
        return {}
    
    tool_name = input_data.get("tool_name", "unknown")
    tool_input = input_data.get("tool_input", {})
    session_id = input_data.get("session_id")
    
    tracer = get_tracer()
    
    # Create span for this tool call
    span = tracer.start_span(
        name=f"tool.{tool_name}",
        attributes={
            "tool.name": tool_name,
            "tool.type": "claude-sdk",
            "tool.input": _truncate_for_attribute(str(tool_input)),
            "session.id": session_id or "",
        }
    )
    
    # Store span for PostToolUse to close
    if tool_use_id:
        _active_tool_spans[tool_use_id] = span
        logger.debug(f"Started span for tool {tool_name} (tool_use_id={tool_use_id})")
    else:
        # No tool_use_id - close span immediately (shouldn't happen but handle gracefully)
        span.end()
        logger.warning(f"No tool_use_id for {tool_name}, closing span immediately")
    
    return {}


async def _post_tool_use_hook(
    input_data: Dict[str, Any],
    tool_use_id: Optional[str],
    context: Any,
) -> Dict[str, Any]:
    """Hook called after a tool executes. Closes the span and records the result.
    
    Args:
        input_data: Contains tool_name, tool_input, tool_response, hook_event_name, etc.
        tool_use_id: Unique ID for this tool call (correlates with PreToolUse)
        context: Reserved for future use
        
    Returns:
        Empty dict to allow the operation to proceed
    """
    if input_data.get("hook_event_name") != "PostToolUse":
        return {}
    
    tool_name = input_data.get("tool_name", "unknown")
    tool_response = input_data.get("tool_response")
    
    # Find and close the matching span
    if tool_use_id and tool_use_id in _active_tool_spans:
        span = _active_tool_spans.pop(tool_use_id)
        
        # Record result
        span.set_attribute("tool.result", _truncate_for_attribute(str(tool_response)))
        span.set_status(Status(StatusCode.OK))
        span.end()
        
        logger.debug(f"Completed span for tool {tool_name} (tool_use_id={tool_use_id})")
    else:
        logger.warning(f"No active span found for tool {tool_name} (tool_use_id={tool_use_id})")
    
    return {}


def _truncate_for_attribute(value: str, max_length: int = 1024) -> str:
    """Truncate a string value to fit in an OpenTelemetry attribute.
    
    Args:
        value: The string to truncate
        max_length: Maximum length (default 1024 to be safe for most backends)
        
    Returns:
        Truncated string with indicator if truncated
    """
    if len(value) <= max_length:
        return value
    return value[:max_length - 3] + "..."


def create_telemetry_hooks(trace_context: Optional[TraceContext] = None) -> Dict[str, Any]:
    """Create telemetry hooks for Claude SDK execution.
    
    The hooks capture tool calls as OpenTelemetry spans. If trace_context is provided,
    spans will be created as children of the parent trace from Ark.
    
    Args:
        trace_context: Optional parent trace context from HTTP headers
        
    Returns:
        Hook configuration dict compatible with ClaudeAgentOptions.hooks
    """
    # Import HookMatcher here to avoid import errors if claude-agent-sdk not available
    try:
        from claude_agent_sdk import HookMatcher
    except ImportError:
        logger.warning("claude_agent_sdk not available, returning empty hooks")
        return {}
    
    return {
        "PreToolUse": [HookMatcher(hooks=[_pre_tool_use_hook])],
        "PostToolUse": [HookMatcher(hooks=[_post_tool_use_hook])],
    }


class TelemetrySpanManager:
    """Context manager for the root execution span.
    
    Creates a parent span for the entire Claude SDK execution that contains
    all tool call spans as children.
    
    Usage:
        with TelemetrySpanManager(trace_context, query_id) as manager:
            # Run Claude SDK execution
            pass
    """
    
    def __init__(
        self,
        trace_context: Optional[TraceContext] = None,
        query_id: Optional[str] = None,
        agent_name: Optional[str] = None,
    ):
        self.trace_context = trace_context
        self.query_id = query_id
        self.agent_name = agent_name
        self._span: Optional[Span] = None
        self._token: Optional[Any] = None
    
    def __enter__(self) -> "TelemetrySpanManager":
        tracer = get_tracer()
        
        # Build attributes
        attributes = {
            "execution.engine": "claude-sdk",
        }
        if self.query_id:
            attributes["query.id"] = self.query_id
        if self.agent_name:
            attributes["agent.name"] = self.agent_name
        if self.trace_context and self.trace_context.session_id:
            attributes["session.id"] = self.trace_context.session_id
        
        # Start span with parent context if available
        parent_context = self.trace_context.context if self.trace_context else None
        
        if parent_context:
            self._token = otel_context.attach(parent_context)
        
        self._span = tracer.start_span(
            name="claude-sdk-execution",
            attributes=attributes,
        )
        
        # Make this span the current span so tool spans are children
        self._span_token = otel_context.attach(
            trace.set_span_in_context(self._span)
        )
        
        return self
    
    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        if self._span:
            if exc_type:
                self._span.set_status(Status(StatusCode.ERROR, str(exc_val)))
                self._span.record_exception(exc_val)
            else:
                self._span.set_status(Status(StatusCode.OK))
            self._span.end()
        
        # Detach contexts
        if hasattr(self, '_span_token'):
            otel_context.detach(self._span_token)
        if self._token:
            otel_context.detach(self._token)
    
    def set_input(self, input_value: str) -> None:
        """Set the input value on the span (for Langfuse UI).
        
        Args:
            input_value: The input prompt
        """
        if self._span:
            self._span.set_attribute("input.value", input_value)
    
    def set_output(self, output_value: str) -> None:
        """Set the output value on the span (for Langfuse UI).
        
        Args:
            output_value: The agent output
        """
        if self._span:
            self._span.set_attribute("output.value", output_value)
    
    def record_telemetry(
        self,
        duration_ms: Optional[int] = None,
        num_turns: Optional[int] = None,
        total_cost_usd: Optional[float] = None,
        input_value: Optional[str] = None,
        output_value: Optional[str] = None,
    ) -> None:
        """Record aggregate telemetry on the execution span.
        
        Args:
            duration_ms: Total execution duration in milliseconds
            num_turns: Number of conversation turns
            total_cost_usd: Total cost in USD
            input_value: The input prompt (for Langfuse UI)
            output_value: The agent output (for Langfuse UI)
        """
        if self._span:
            if duration_ms is not None:
                self._span.set_attribute("execution.duration_ms", duration_ms)
            if num_turns is not None:
                self._span.set_attribute("execution.num_turns", num_turns)
            if total_cost_usd is not None:
                self._span.set_attribute("execution.cost_usd", total_cost_usd)
            if input_value is not None:
                self._span.set_attribute("input.value", input_value)
            if output_value is not None:
                self._span.set_attribute("output.value", output_value)
