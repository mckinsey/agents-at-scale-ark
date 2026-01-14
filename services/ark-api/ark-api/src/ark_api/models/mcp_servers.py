from typing import Any, Dict, List, Optional

from pydantic import BaseModel, model_serializer

from .common import AvailabilityStatus


class MCPServerConfigMapKeyRef(BaseModel):
    key: str
    name: str
    optional: Optional[bool] = None


class MCPServerSecretKeyRef(BaseModel):
    key: str
    name: str
    optional: Optional[bool] = None


class MCPServerQueryParameterRef(BaseModel):
    name: str


class MCPServerServiceRef(BaseModel):
    name: str
    namespace: Optional[str] = None
    port: Optional[str] = None
    path: Optional[str] = None


class MCPServerValueFrom(BaseModel):
    configMapKeyRef: Optional[MCPServerConfigMapKeyRef] = None
    secretKeyRef: Optional[MCPServerSecretKeyRef] = None
    serviceRef: Optional[MCPServerServiceRef] = None
    queryParameterRef: Optional[MCPServerQueryParameterRef] = None


class MCPServerValueSource(BaseModel):
    """ValueSource for configuration (supports direct value or valueFrom)."""
    value: Optional[str] = None
    valueFrom: Optional[MCPServerValueFrom] = None

    @model_serializer(mode='plain')  
    def serialize_model(self) -> dict:  
        if self.valueFrom:
            return {
                "valueFrom": self.valueFrom
            }
        else:
            return {
                "value": self.value
            }


class MCPServerHeader(BaseModel):
    name: str
    value: MCPServerValueSource


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
    headers: Optional[List[MCPServerHeader]]
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
    address: MCPServerValueSource
    headers: Optional[List[MCPServerHeader]] = None


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
