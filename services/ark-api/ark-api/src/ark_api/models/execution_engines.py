"""
ExecutionEngine Pydantic models for API requests and responses.

ExecutionEngines define how agents are executed. There are two modes:

1. Shared Executor Mode (address):
   - Points to a shared service that handles requests for multiple agents
   - The executor receives full agent config on every request
   - Example: LangChain executor service

2. Template Mode (source):
   - Each Agent gets a dedicated pod running the specified container image
   - Config is injected as ARK_CONFIG_* environment variables at startup
   - Supports pre-built images or git-based builds (future)

Key fields:
    - type: Identifier for the execution engine type (e.g., "langchain", "custom")
    - address: For shared executor mode - URL or service reference
    - source: For template mode - container image or git source
    - isAgentic: If true, agents using this template get A2A exposure
    - configSchema: JSON Schema for config values (extracted from image label)
"""
from typing import List, Dict, Optional, Any

from pydantic import BaseModel

from .common import AvailabilityStatus


class GitSource(BaseModel):
    """Git repository source for building agent images.

    Attributes:
        url: Git repository URL (required)
        ref: Git ref (branch, tag, or commit). Defaults to main branch.
        path: Path within repo to Dockerfile. Defaults to root.
    """
    url: str
    ref: Optional[str] = None
    path: Optional[str] = None


class TemplateSource(BaseModel):
    """Source configuration for template-based execution engines.

    Must specify either image OR git, not both.

    Attributes:
        image: Pre-built container image URL (e.g., ghcr.io/org/agent:v1)
        git: Git source for building the image
    """
    image: Optional[str] = None
    git: Optional[GitSource] = None


class ValueSource(BaseModel):
    """Value source for address configuration.

    In the full CRD, this supports ConfigMap/Secret/Service references.
    This model only exposes the direct value for API simplicity.

    Attributes:
        value: Direct URL value (e.g., http://executor:8080)
    """
    value: Optional[str] = None


class ExecutionEngineResponse(BaseModel):
    """Summary response for ExecutionEngine listing.

    Attributes:
        name: Resource name
        namespace: Kubernetes namespace
        type: Engine type identifier
        description: Human-readable description
        isAgentic: Whether agents get A2A exposure
        hasSource: True if template mode, False if shared executor mode
        available: Availability status from conditions
        annotations: Resource annotations
    """
    name: str
    namespace: str
    type: str
    description: Optional[str] = None
    isAgentic: bool = False
    hasSource: bool = False
    available: Optional[AvailabilityStatus] = None
    annotations: Optional[Dict[str, str]] = None


class ExecutionEngineListResponse(BaseModel):
    """Paginated list of execution engines."""
    items: List[ExecutionEngineResponse]
    count: int


class ExecutionEngineDetailResponse(BaseModel):
    """Full details for a single ExecutionEngine.

    Includes address/source configuration and status.
    """
    name: str
    namespace: str
    type: str
    description: Optional[str] = None
    address: Optional[ValueSource] = None
    source: Optional[TemplateSource] = None
    configSchema: Optional[Dict[str, Any]] = None
    isAgentic: bool = False
    available: Optional[AvailabilityStatus] = None
    status: Optional[Dict[str, Any]] = None
    annotations: Optional[Dict[str, str]] = None


class ExecutionEngineCreateRequest(BaseModel):
    """Request body for creating an ExecutionEngine.

    Must specify either address (shared executor) or source (template).

    Attributes:
        name: Unique name for the engine
        type: Engine type identifier
        description: Optional description
        address: For shared executor mode
        source: For template mode (image or git)
        configSchema: JSON Schema for config validation
        isAgentic: Enable A2A exposure for agents using this template
    """
    name: str
    type: str
    description: Optional[str] = None
    address: Optional[ValueSource] = None
    source: Optional[TemplateSource] = None
    configSchema: Optional[Dict[str, Any]] = None
    isAgentic: bool = False


class ExecutionEngineUpdateRequest(BaseModel):
    """Request body for updating an ExecutionEngine.

    All fields are optional - only specified fields are updated.
    """
    type: Optional[str] = None
    description: Optional[str] = None
    address: Optional[ValueSource] = None
    source: Optional[TemplateSource] = None
    configSchema: Optional[Dict[str, Any]] = None
    isAgentic: Optional[bool] = None
