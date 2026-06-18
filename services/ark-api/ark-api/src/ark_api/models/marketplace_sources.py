"""Pydantic models for marketplace sources and the items aggregator."""
import re
from typing import Any, Optional
from urllib.parse import urlparse

from pydantic import BaseModel, field_validator

# ConfigMap data keys must be valid Kubernetes ConfigMap keys.
_KEY_PATTERN = re.compile(r"^[-._a-zA-Z0-9]+$")


def _validate_https_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.netloc:
        raise ValueError("url must be an absolute https URL")
    return value


def _validate_source_name(value: str) -> str:
    if not _KEY_PATTERN.match(value):
        raise ValueError(
            "name must contain only alphanumeric characters, '-', '_' or '.'"
        )
    return value


class MarketplaceSourceCreate(BaseModel):
    """Request body for creating a marketplace source."""

    name: str
    url: str
    displayName: Optional[str] = None

    @field_validator("name")
    @classmethod
    def _check_name(cls, value: str) -> str:
        return _validate_source_name(value)

    @field_validator("url")
    @classmethod
    def _check_url(cls, value: str) -> str:
        return _validate_https_url(value)


class MarketplaceSourceUpdate(BaseModel):
    """Request body for updating a marketplace source."""

    url: str
    displayName: Optional[str] = None

    @field_validator("url")
    @classmethod
    def _check_url(cls, value: str) -> str:
        return _validate_https_url(value)


class MarketplaceSourceResponse(BaseModel):
    """A single marketplace source entry."""

    name: str
    url: str
    displayName: Optional[str] = None


class MarketplaceItemError(BaseModel):
    """Per-source failure detail returned by the aggregator."""

    message: str
    code: str


class MarketplaceItemsSourceResult(BaseModel):
    """Aggregator result for one source: items on success, error on failure."""

    source: str
    displayName: str
    items: Optional[list[dict[str, Any]]] = None
    error: Optional[MarketplaceItemError] = None


class MarketplacePermissionsResponse(BaseModel):
    """Response of the permission probe endpoint."""

    canEdit: bool
