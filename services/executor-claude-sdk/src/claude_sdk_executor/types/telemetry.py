"""Telemetry models for tracking execution metrics."""

from dataclasses import dataclass, field
from typing import Optional, Dict, Any


@dataclass
class ExecutionTelemetry:
    """Telemetry captured from Claude SDK execution.

    Maps to fields from SDK's ResultMessage for full observability.
    This data is used to track costs, performance, and debugging.
    """
    # Session identification
    session_id: Optional[str] = None

    # Timing metrics
    duration_ms: Optional[int] = None      # Total execution time
    duration_api_ms: Optional[int] = None  # Time spent in API calls

    # Usage metrics
    num_turns: Optional[int] = None        # Number of conversation turns
    total_cost_usd: Optional[float] = None # Total cost in USD
    usage: Optional[Dict[str, Any]] = None # Token usage breakdown

    # Structured output from JSON Schema validation
    structured_output: Optional[Dict[str, Any]] = None

    # Error tracking
    is_error: bool = False
    error_message: Optional[str] = None

    # Additional metadata
    metadata: Dict[str, Any] = field(default_factory=dict)

    def merge(self, other: "ExecutionTelemetry") -> None:
        """Merge another telemetry instance into this one.

        Used when combining telemetry from multiple execution phases
        (e.g., main task + critic validation).
        
        Args:
            other: Another ExecutionTelemetry to merge into this one
        """
        if other.session_id:
            self.session_id = other.session_id
        if other.duration_ms:
            self.duration_ms = (self.duration_ms or 0) + other.duration_ms
        if other.duration_api_ms:
            self.duration_api_ms = (self.duration_api_ms or 0) + other.duration_api_ms
        if other.num_turns:
            self.num_turns = (self.num_turns or 0) + other.num_turns
        if other.total_cost_usd:
            self.total_cost_usd = (self.total_cost_usd or 0) + other.total_cost_usd
        if other.usage:
            self.usage = other.usage  # Take latest usage (includes totals)
        if other.structured_output:
            self.structured_output = other.structured_output
        if other.is_error:
            self.is_error = True
            self.error_message = other.error_message
        if other.metadata:
            self.metadata.update(other.metadata)

    def to_dict(self) -> Dict[str, Any]:
        """Convert telemetry to dictionary for serialization."""
        return {
            "session_id": self.session_id,
            "duration_ms": self.duration_ms,
            "duration_api_ms": self.duration_api_ms,
            "num_turns": self.num_turns,
            "total_cost_usd": self.total_cost_usd,
            "usage": self.usage,
            "structured_output": self.structured_output,
            "is_error": self.is_error,
            "error_message": self.error_message,
            "metadata": self.metadata,
        }
