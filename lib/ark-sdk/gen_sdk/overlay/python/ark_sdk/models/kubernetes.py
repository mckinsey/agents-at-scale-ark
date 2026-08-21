"""Kubernetes-related response models."""
from typing import List, Dict, Optional

from pydantic import BaseModel, field_validator

from ..annotations import filter_ark_annotations
from ..labels import validate_tag


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

    @field_validator("annotations")
    @classmethod
    def _filter_annotations(cls, value: Optional[Dict[str, str]]) -> Dict[str, str]:
        return filter_ark_annotations(value)


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
    keys: List[str] = []  # Names of the keys in the secret data (never the values)
    annotations: Optional[Dict[str, str]] = None

    @field_validator("annotations")
    @classmethod
    def _filter_annotations(cls, value: Optional[Dict[str, str]]) -> Dict[str, str]:
        return filter_ark_annotations(value)


class ConfigurationResponse(BaseModel):
    """Configuration response model."""
    name: str
    id: str
    value: Optional[str] = None
    description: Optional[str] = None
    alias: Optional[str] = None
    labels: List[str] = []


class ConfigurationListResponse(BaseModel):
    """List of configurations response model."""
    items: List[ConfigurationResponse]
    count: int


class ConfigurationCreateRequest(BaseModel):
    """Request model for creating a configuration."""
    name: str
    value: str
    description: Optional[str] = None
    alias: Optional[str] = None
    labels: List[str] = []

    @field_validator("labels")
    @classmethod
    def _validate_labels(cls, value: List[str]) -> List[str]:
        return [validate_tag(label) for label in value]


class ConfigurationUpdateRequest(BaseModel):
    """Request model for updating a configuration."""
    value: str
    description: Optional[str] = None
    alias: Optional[str] = None
    labels: List[str] = []

    @field_validator("labels")
    @classmethod
    def _validate_labels(cls, value: List[str]) -> List[str]:
        return [validate_tag(label) for label in value]


class ConfigurationReference(BaseModel):
    """A resource that reads a configuration."""
    kind: str
    name: str
    field: str


class ConfigurationReferenceListResponse(BaseModel):
    """Resources that read a configuration."""
    items: List[ConfigurationReference]
    count: int
