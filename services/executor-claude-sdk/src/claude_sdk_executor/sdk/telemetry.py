"""Telemetry capture utilities for Claude SDK execution."""

import logging
from typing import Any, Optional

from ..types.telemetry import ExecutionTelemetry

logger = logging.getLogger(__name__)


def capture_telemetry(message: Any) -> ExecutionTelemetry:
    """Capture telemetry from a Claude SDK ResultMessage.
    
    Args:
        message: ResultMessage from Claude SDK
        
    Returns:
        ExecutionTelemetry with captured metrics
    """
    telemetry = ExecutionTelemetry()
    
    telemetry.session_id = getattr(message, 'session_id', None)
    telemetry.total_cost_usd = getattr(message, 'total_cost_usd', None)
    telemetry.duration_ms = getattr(message, 'duration_ms', None)
    telemetry.duration_api_ms = getattr(message, 'duration_api_ms', None)
    telemetry.num_turns = getattr(message, 'num_turns', None)
    telemetry.usage = getattr(message, 'usage', None)
    
    # Check for errors
    if hasattr(message, 'subtype') and message.subtype == "error_during_execution":
        telemetry.is_error = True
        telemetry.error_message = getattr(message, 'result', 'Unknown error')
    
    return telemetry


def merge_telemetry(base: ExecutionTelemetry, additional: ExecutionTelemetry) -> ExecutionTelemetry:
    """Merge two telemetry instances.
    
    Used to combine telemetry from multiple phases (main task + critic).
    
    Args:
        base: Base telemetry to merge into
        additional: Additional telemetry to add
        
    Returns:
        Merged telemetry (same as base, modified in place)
    """
    base.merge(additional)
    return base
