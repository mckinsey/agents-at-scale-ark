"""Type definitions for Claude SDK Executor.

Re-exports types from ark-sdk for compatibility and adds Claude-specific types.
"""

# Re-export types from ark-sdk for compatibility
from ark_sdk.executor import (
    Parameter,
    Model,
    AgentConfig,
    Message,
    ExecutionEngineRequest,
    ExecutionEngineResponse,
    BaseExecutor,
)

# ExecutionProfileConfig may not exist in older ark-sdk versions
try:
    from ark_sdk.executor import ExecutionProfileConfig
except ImportError:
    # Define locally if not available
    from pydantic import BaseModel
    from typing import Dict, Any, List, Optional

    class ExecutionProfileConfig(BaseModel):
        """Resolved execution profile passed to executor."""
        name: str
        namespace: str
        workspace: Optional[Dict[str, Any]] = None
        preExecute: List[Dict[str, Any]] = []
        execution: Optional[Dict[str, Any]] = None
        critic: Optional[Dict[str, Any]] = None
        postExecute: List[Dict[str, Any]] = []
        onFailure: List[Dict[str, Any]] = []
        sdkConfig: Optional[Dict[str, Any]] = None

        class Config:
            extra = "allow"

from .claude_config import ClaudeSdkConfig, MCPServerConfig, ClaudeCriticConfig
from .telemetry import ExecutionTelemetry

__all__ = [
    # ark-sdk types
    "Parameter",
    "Model",
    "AgentConfig",
    "Message",
    "ExecutionEngineRequest",
    "ExecutionEngineResponse",
    "ExecutionProfileConfig",
    "BaseExecutor",
    # Claude-specific types
    "ClaudeSdkConfig",
    "MCPServerConfig",
    "ClaudeCriticConfig",
    "ExecutionTelemetry",
]
