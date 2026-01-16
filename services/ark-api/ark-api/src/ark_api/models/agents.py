"""Agent CRD response models."""
from typing import List, Dict, Optional, Any

from pydantic import BaseModel

from .common import AvailabilityStatus


class ExecutionEngineRef(BaseModel):
    """ExecutionEngine reference for running an agent."""
    name: str
    namespace: Optional[str] = None


class ModelRef(BaseModel):
    """Model reference for an agent."""
    name: str
    namespace: Optional[str] = None


class AgentConfigMapKeyRef(BaseModel):
    """Reference to a key in a ConfigMap."""
    key: str
    name: str
    optional: Optional[bool] = None


class AgentSecretKeyRef(BaseModel):
    """Reference to a key in a Secret."""
    key: str
    name: str
    optional: Optional[bool] = None


class AgentQueryParameterRef(BaseModel):
    """Reference to a parameter in a query."""
    name: str


class AgentServiceRef(BaseModel):
    """Reference to a service."""
    name: str
    namespace: Optional[str] = None
    port: Optional[str] = None
    path: Optional[str] = None


class AgentValueFrom(BaseModel):
    """Reference to external sources for parameter values."""
    configMapKeyRef: Optional[AgentConfigMapKeyRef] = None
    secretKeyRef: Optional[AgentSecretKeyRef] = None
    serviceRef: Optional[AgentServiceRef] = None
    queryParameterRef: Optional[AgentQueryParameterRef] = None


class AgentParameter(BaseModel):
    """Parameter for template processing in prompts and inputs."""
    name: str
    value: Optional[str] = None
    valueFrom: Optional[AgentValueFrom] = None


class AgentLabelSelectorRequirement(BaseModel):
    """A label selector requirement is a selector that contains values, a key, and an operator."""
    key: str
    operator: str
    values: Optional[List[str]] = None


class AgentLabelSelector(BaseModel):
    """A label selector is a label query over a set of resources."""
    matchLabels: Optional[Dict[str, str]] = None
    matchExpressions: Optional[List[AgentLabelSelectorRequirement]] = None


class AgentTool(BaseModel):
    """Tool configuration for an agent."""
    type: str  # "built-in", "mcp", "http", "agent", "team", "builtin" (or deprecated "custom")
    name: Optional[str] = None
    labelSelector: Optional[AgentLabelSelector] = None


class AgentHeaderValue(BaseModel):
    """Value configuration for a header."""
    value: Optional[str] = None
    valueFrom: Optional[AgentValueFrom] = None


class AgentHeader(BaseModel):
    """HTTP header configuration."""
    name: str
    value: AgentHeaderValue


class AgentOverride(BaseModel):
    """Header override configuration for models and MCP servers."""
    headers: List[AgentHeader]
    resourceType: str
    labelSelector: Optional[AgentLabelSelector] = None


class Skill(BaseModel):
    """Skill configuration for an A2A agent."""
    id: str
    name: str
    description: Optional[str] = None
    tags: Optional[List[str]] = None


class AgentResponse(BaseModel):
    """Agent resource response model."""
    name: str
    namespace: str
    description: Optional[str] = None
    model_ref: Optional[str] = None
    prompt: Optional[str] = None
    available: Optional[AvailabilityStatus] = None
    annotations: Optional[Dict[str, str]] = None


class AgentListResponse(BaseModel):
    """List of agents response model."""
    items: List[AgentResponse]
    count: int


class AgentCreateRequest(BaseModel):
    """Request model for creating an agent."""
    name: str
    description: Optional[str] = None
    executionEngine: Optional[ExecutionEngineRef] = None
    modelRef: Optional[ModelRef] = None
    parameters: Optional[List[AgentParameter]] = None
    prompt: Optional[str] = None
    tools: Optional[List[AgentTool]] = None
    overrides: Optional[List[AgentOverride]] = None


class AgentUpdateRequest(BaseModel):
    """Request model for updating an agent."""
    description: Optional[str] = None
    executionEngine: Optional[ExecutionEngineRef] = None
    modelRef: Optional[ModelRef] = None
    parameters: Optional[List[AgentParameter]] = None
    prompt: Optional[str] = None
    tools: Optional[List[AgentTool]] = None
    overrides: Optional[List[AgentOverride]] = None


class AgentDetailResponse(BaseModel):
    """Detailed agent response model."""
    name: str
    namespace: str
    description: Optional[str] = None
    executionEngine: Optional[ExecutionEngineRef] = None
    modelRef: Optional[ModelRef] = None
    parameters: Optional[List[AgentParameter]] = None
    prompt: Optional[str] = None
    tools: Optional[List[AgentTool]] = None
    overrides: Optional[List[AgentOverride]] = None
    skills: Optional[List[Skill]] = None
    isA2A: bool = False
    available: Optional[AvailabilityStatus] = None
    status: Optional[Dict[str, Any]] = None
    annotations: Optional[Dict[str, str]] = None
