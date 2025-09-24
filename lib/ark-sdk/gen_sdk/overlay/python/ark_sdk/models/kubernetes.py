"""Kubernetes-related response models."""
from typing import List, Dict, Optional

from pydantic import BaseModel


class NamespaceResponse(BaseModel):
    """Kubernetes namespace response model."""
    name: str


class NamespaceListResponse(BaseModel):
    """List of namespaces response model."""
    items: List[NamespaceResponse]
    count: int


class NamespaceCreateRequest(BaseModel):
    """Request model for creating a namespace."""
    name: str


class ContextResponse(BaseModel):
    """Response model for current Kubernetes context."""
    namespace: str
    cluster: Optional[str]


class SecretResponse(BaseModel):
    """Kubernetes secret response model."""
    name: str
    id: str
    annotations: Optional[Dict[str, str]] = None


class SecretListResponse(BaseModel):
    """List of secrets response model."""
    items: List[SecretResponse]
    count: int


class SecretCreateRequest(BaseModel):
    """Request model for creating a secret."""
    name: str
    string_data: Dict[str, str]
    type: Optional[str] = "Opaque"


class SecretUpdateRequest(BaseModel):
    """Request model for updating a secret."""
    string_data: Dict[str, str]


class SecretDetailResponse(BaseModel):
    """Detailed secret response model."""
    name: str
    id: str
    type: str
    secret_length: int  # Total length of all secret data in bytes
    annotations: Optional[Dict[str, str]] = None
