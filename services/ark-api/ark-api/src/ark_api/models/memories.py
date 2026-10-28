"""Pydantic models for Memory resources."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, model_serializer, model_validator

from .common import PaginatedListResponse


class MemoryConfigMapKeyRef(BaseModel):
    key: str
    name: str
    optional: Optional[bool] = None


class MemorySecretKeyRef(BaseModel):
    key: str
    name: str
    optional: Optional[bool] = None


class MemoryServiceRef(BaseModel):
    name: str
    namespace: Optional[str] = None
    port: Optional[str] = None
    path: Optional[str] = None


class MemoryQueryParameterRef(BaseModel):
    name: str


class MemoryValueFrom(BaseModel):
    configMapKeyRef: Optional[MemoryConfigMapKeyRef] = None
    secretKeyRef: Optional[MemorySecretKeyRef] = None
    serviceRef: Optional[MemoryServiceRef] = None
    queryParameterRef: Optional[MemoryQueryParameterRef] = None


class MemoryValueSource(BaseModel):
    value: Optional[str] = None
    valueFrom: Optional[MemoryValueFrom] = None

    @model_validator(mode="after")
    def exactly_one_source(self) -> "MemoryValueSource":
        if (self.value is None) == (self.valueFrom is None):
            raise ValueError("set exactly one of value or valueFrom")
        return self

    @model_serializer(mode="plain")
    def serialize_model(self) -> dict:
        if self.valueFrom is not None:
            return {"valueFrom": self.valueFrom.model_dump(exclude_none=True)}
        return {"value": self.value}


class MemoryAddressSource(BaseModel):
    value: Optional[str] = None
    valueFrom: Optional[MemoryValueFrom] = None


class MemoryHeader(BaseModel):
    name: str
    value: MemoryValueSource


class MemoryHeaderResponse(BaseModel):
    name: str
    value: MemoryAddressSource


class MemorySpec(BaseModel):
    address: MemoryValueSource
    headers: Optional[List[MemoryHeader]] = None


class MemorySpecResponse(BaseModel):
    address: Optional[MemoryAddressSource] = None
    headers: Optional[List[MemoryHeaderResponse]] = None


class MemoryResponse(BaseModel):
    """Response model for memory list items."""
    name: str
    namespace: str
    labels: Optional[Dict[str, str]] = None
    status: Optional[str] = None


class MemoryDetailResponse(BaseModel):
    """Response model for detailed memory information."""
    name: str
    namespace: str
    labels: Optional[Dict[str, str]] = None
    annotations: Optional[Dict[str, str]] = None
    spec: Optional[MemorySpecResponse] = None
    status: Optional[Dict[str, Any]] = None


class MemoryListResponse(PaginatedListResponse):
    """Response model for memory list."""
    items: List[MemoryResponse]


class MemoryCreateRequest(BaseModel):
    """Request model for creating a memory."""
    name: str
    labels: Optional[Dict[str, str]] = None
    annotations: Optional[Dict[str, str]] = None
    spec: MemorySpec


class MemoryUpdateRequest(BaseModel):
    """Request model for updating a memory."""
    labels: Optional[Dict[str, str]] = None
    annotations: Optional[Dict[str, str]] = None
    spec: Optional[MemorySpec] = None
