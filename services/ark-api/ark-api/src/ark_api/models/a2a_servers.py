from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class A2AServerResponse(BaseModel):
    name: str
    namespace: str
    description: Optional[str] = None
    labels: Optional[Dict[str, str]] = None
    address: Optional[str] = None
    annotations: Optional[Dict[str, str]] = None
    ready: Optional[bool] = None
    discovering: Optional[bool] = None
    status_message: Optional[str] = None


class A2AServerListResponse(BaseModel):
    items: List[A2AServerResponse]
    total: int


class A2AServerDetailResponse(BaseModel):
    name: str
    namespace: str
    description: Optional[str] = None
    labels: Optional[Dict[str, str]] = None
    annotations: Optional[Dict[str, str]] = None
    spec: Optional[Dict[str, Any]] = None
    status: Optional[Dict[str, Any]] = None


class AddressModel(BaseModel):
    value: Optional[str] = None
    value_from: Optional[Dict[str, Any]] = Field(None, alias="valueFrom")


class HeaderValue(BaseModel):
    value: Optional[str] = None
    value_from: Optional[Dict[str, Any]] = Field(None, alias="valueFrom")


class Header(BaseModel):
    name: str
    value: HeaderValue


class A2AServerSpec(BaseModel):
    address: AddressModel
    headers: Optional[List[Header]] = None
    description: Optional[str] = None
    max_discovery_time: Optional[str] = Field(None, alias="maxDiscoveryTime")


class A2AServerCreateRequest(BaseModel):
    name: str
    namespace: str
    description: Optional[str] = None
    labels: Optional[Dict[str, str]] = None
    annotations: Optional[Dict[str, str]] = None
    spec: A2AServerSpec


class A2AServerUpdateRequest(BaseModel):
    description: Optional[str] = None
    labels: Optional[Dict[str, str]] = None
    annotations: Optional[Dict[str, str]] = None
    spec: Optional[A2AServerSpec] = None
