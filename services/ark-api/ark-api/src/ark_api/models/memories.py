"""Pydantic models for Memory resources."""

from typing import Any, Dict, List, Optional, Self

from pydantic import BaseModel, ConfigDict, model_serializer, model_validator

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


class MemoryAddressValueFrom(BaseModel):
    model_config = ConfigDict(extra="forbid")

    configMapKeyRef: Optional[MemoryConfigMapKeyRef] = None
    secretKeyRef: Optional[MemorySecretKeyRef] = None
    serviceRef: Optional[MemoryServiceRef] = None


class MemoryHeaderValueFrom(BaseModel):
    model_config = ConfigDict(extra="forbid")

    configMapKeyRef: Optional[MemoryConfigMapKeyRef] = None
    secretKeyRef: Optional[MemorySecretKeyRef] = None
    queryParameterRef: Optional[MemoryQueryParameterRef] = None


class _MemoryValueSourceWrite(BaseModel):
    value: Optional[str] = None
    valueFrom: Optional[BaseModel] = None

    @model_validator(mode="after")
    def exactly_one_source(self) -> Self:
        if (self.value is None) == (self.valueFrom is None):
            raise ValueError("set exactly one of value or valueFrom")
        if self.value is not None and not self.value:
            raise ValueError("value must not be empty")
        if self.valueFrom is not None and len(self.valueFrom.model_dump(exclude_none=True)) != 1:
            raise ValueError("valueFrom must set exactly one source")
        return self

    @model_serializer(mode="plain")
    def serialize_model(self) -> dict:
        if self.valueFrom is not None:
            return {"valueFrom": self.valueFrom.model_dump(exclude_none=True)}
        return {"value": self.value}


class MemoryAddressValueSource(_MemoryValueSourceWrite):
    valueFrom: Optional[MemoryAddressValueFrom] = None


class MemoryHeaderValueSource(_MemoryValueSourceWrite):
    valueFrom: Optional[MemoryHeaderValueFrom] = None


class MemoryHeader(BaseModel):
    name: str
    value: MemoryHeaderValueSource


class MemoryValueFrom(BaseModel):
    configMapKeyRef: Optional[MemoryConfigMapKeyRef] = None
    secretKeyRef: Optional[MemorySecretKeyRef] = None
    serviceRef: Optional[MemoryServiceRef] = None
    queryParameterRef: Optional[MemoryQueryParameterRef] = None


class MemoryValueSourceResponse(BaseModel):
    value: Optional[str] = None
    valueFrom: Optional[MemoryValueFrom] = None


class MemoryHeaderResponse(BaseModel):
    name: str
    value: MemoryValueSourceResponse


class MemorySpec(BaseModel):
    address: MemoryAddressValueSource
    headers: Optional[List[MemoryHeader]] = None


class MemorySpecResponse(BaseModel):
    address: Optional[MemoryValueSourceResponse] = None
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
