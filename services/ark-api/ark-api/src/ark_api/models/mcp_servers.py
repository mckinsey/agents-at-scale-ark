from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, model_serializer

from .common import AvailabilityStatus


class ConfigMapKeyRef(BaseModel):
    key: str
    name: str
    optional: Optional[bool] = None


class SecretKeyRef(BaseModel):
    key: str
    name: str
    optional: Optional[bool] = None


class QueryParameterRef(BaseModel):
    name: str


class ServiceRef(BaseModel):
    name: str
    namespace: Optional[str] = None
    port: Optional[str] = None
    path: Optional[str] = None


class ValueFrom(BaseModel):
    configMapKeyRef: Optional[ConfigMapKeyRef] = None
    secretKeyRef: Optional[SecretKeyRef] = None
    serviceRef: Optional[ServiceRef] = None
    queryParameterRef: Optional[QueryParameterRef] = None


class ValueSource(BaseModel):
    """ValueSource for configuration (supports direct value or valueFrom)."""
    value: Optional[str] = None
    valueFrom: Optional[ValueFrom] = None


class Header(BaseModel):
    name: str
    value: ValueSource


class MCPServerResponse(BaseModel):
    name: str
    namespace: str
    address: Optional[str] = None
    annotations: Optional[Dict[str, str]] = None
    transport: Optional[str] = None
    available: Optional[AvailabilityStatus] = None
    status_message: Optional[str] = None
    tool_count: Optional[int] = None


class MCPServerListResponse(BaseModel):
    items: List[MCPServerResponse]
    total: int


class MCPServerDetailResponse(BaseModel):
    name: str
    namespace: str
    description: Optional[str] = None
    labels: Optional[Dict[str, str]] = None
    annotations: Optional[Dict[str, str]] = None
    available: Optional[AvailabilityStatus] = None
    address: Optional[str] = None
    transport: Optional[str] = None
    headers: Optional[List[Header]]
    tool_count: Optional[int] = None


class MCPTransport(BaseModel):
    type: str
    image: str
    env: Optional[Dict[str, str]] = None
    args: Optional[List[str]] = None
    command: Optional[List[str]] = None


class MCPServerSpec(BaseModel):
    transport: str
    description: Optional[str] = None
    tools: Optional[List[str]] = None
    address: ValueSource
    headers: Optional[List[Header]] = None


class MCPServerCreateRequest(BaseModel):
    name: str
    namespace: str
    labels: Optional[Dict[str, str]] = None
    annotations: Optional[Dict[str, str]] = None
    spec: MCPServerSpec


class MCPServerUpdateRequest(BaseModel):
    labels: Optional[Dict[str, str]] = None
    annotations: Optional[Dict[str, str]] = None
    spec: Optional[MCPServerSpec] = None
