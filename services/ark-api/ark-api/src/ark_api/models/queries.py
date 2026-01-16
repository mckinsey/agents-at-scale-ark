"""Pydantic models for Query resources."""

from typing import List, Dict, Optional, Any, Union
from datetime import datetime
from pydantic import BaseModel
from enum import Enum
from openai.types.chat import ChatCompletionMessageParam
from .agents import AgentOverride


class InputType(str, Enum):
    """Input type enumeration."""
    USER = "user"
    MESSAGES = "messages"


class Memory(BaseModel):
    """Memory reference for a query."""
    name: str
    namespace: Optional[str] = None


class QueryConfigMapKeyRef(BaseModel):
    """Reference to a key in a ConfigMap."""
    key: str
    name: str = ""
    optional: Optional[bool] = None


class QuerySecretKeyRef(BaseModel):
    """Reference to a key in a Secret."""
    key: str
    name: str = ""
    optional: Optional[bool] = None


class QueryValueFrom(BaseModel):
    """Reference to external sources for parameter values."""
    configMapKeyRef: Optional[QueryConfigMapKeyRef] = None
    secretKeyRef: Optional[QuerySecretKeyRef] = None


class QueryParameter(BaseModel):
    """Parameter for template processing in prompts and inputs."""
    name: str
    value: Optional[str] = None
    valueFrom: Optional[QueryValueFrom] = None


class QueryLabelSelectorRequirement(BaseModel):
    """A label selector requirement."""
    key: str
    operator: str
    values: Optional[List[str]] = None


class QueryLabelSelector(BaseModel):
    """Label selector for resources."""
    matchExpressions: Optional[List[QueryLabelSelectorRequirement]] = None
    matchLabels: Optional[Dict[str, str]] = None


class Target(BaseModel):
    """Target for a query."""
    name: str
    type: str  # "agent", "team", "model", "tool"


class QueryResponseContent(BaseModel):
    """Response content from a query target."""
    content: Optional[str] = None
    target: Optional[Target] = None


class QueryResponse(BaseModel):
    """Basic query response for list operations."""
    name: str
    namespace: str
    type: Optional[InputType] = InputType.USER
    input: Union[str, List[ChatCompletionMessageParam]]
    memory: Optional[Memory] = None
    sessionId: Optional[str] = None
    conversationId: Optional[str] = None
    status: Optional[Dict[str, Any]] = None
    creationTimestamp: Optional[datetime] = None


class QueryListResponse(BaseModel):
    """Response for listing queries."""
    items: List[QueryResponse]
    count: int


class QueryCreateRequest(BaseModel):
    """Request body for creating a query."""
    name: str
    type: Optional[InputType] = InputType.USER
    input: Union[str, List[ChatCompletionMessageParam]]
    memory: Optional[Memory] = None
    parameters: Optional[List[QueryParameter]] = None
    selector: Optional[QueryLabelSelector] = None
    serviceAccount: Optional[str] = None
    sessionId: Optional[str] = None
    conversationId: Optional[str] = None
    target: Optional[Target] = None
    timeout: Optional[str] = None
    ttl: Optional[str] = None
    cancel: Optional[bool] = None
    overrides: Optional[List[AgentOverride]] = None
    evaluators: Optional[List[Memory]] = None
    evaluatorSelector: Optional[QueryLabelSelector] = None
    metadata: Optional[Dict[str, Any]] = None


class QueryUpdateRequest(BaseModel):
    """Request body for updating a query."""
    type: Optional[InputType] = None
    input: Optional[Union[str, List[ChatCompletionMessageParam]]] = None
    memory: Optional[Memory] = None
    parameters: Optional[List[QueryParameter]] = None
    selector: Optional[QueryLabelSelector] = None
    serviceAccount: Optional[str] = None
    sessionId: Optional[str] = None
    conversationId: Optional[str] = None
    target: Optional[Target] = None
    timeout: Optional[str] = None
    ttl: Optional[str] = None
    cancel: Optional[bool] = None
    overrides: Optional[List[AgentOverride]] = None


class QueryDetailResponse(BaseModel):
    """Detailed query response."""
    name: str
    namespace: str
    type: Optional[InputType] = InputType.USER
    input: Union[str, List[ChatCompletionMessageParam]]
    memory: Optional[Memory] = None
    parameters: Optional[List[QueryParameter]] = None
    selector: Optional[QueryLabelSelector] = None
    serviceAccount: Optional[str] = None
    sessionId: Optional[str] = None
    conversationId: Optional[str] = None
    target: Optional[Target] = None
    timeout: Optional[str] = None
    ttl: Optional[str] = None
    cancel: Optional[bool] = None
    overrides: Optional[List[AgentOverride]] = None
    metadata: Optional[Dict[str, Any]] = None
    status: Optional[Dict[str, Any]] = None


class ArkOpenAICompletionsMetadata(BaseModel):
    """Ark-specific metadata for OpenAI chat completions.

    Passed via the 'ark' key in request metadata as a JSON string.
    Follows the pattern used by OpenAI for provider-specific extensions.
    """
    annotations: Optional[Dict[str, str]] = None
