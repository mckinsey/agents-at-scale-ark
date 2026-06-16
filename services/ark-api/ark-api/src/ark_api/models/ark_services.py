"""Pydantic models for ARK services API."""
from typing import List, Optional, Dict
from pydantic import BaseModel


class ChartMetadata(BaseModel):
    """Chart metadata from Helm release."""
    annotations: Optional[Dict[str, str]] = None
    description: Optional[str] = None


class HelmRelease(BaseModel):
    """Helm release information for marketplace item detection.

    Represents a Helm release with chart metadata including annotations
    used for marketplace item identification.
    """
    name: str
    namespace: str
    chart: str
    chart_version: str
    app_version: str
    status: str
    revision: int
    updated: str
    chart_metadata: Optional[ChartMetadata] = None


class HelmReleaseListResponse(BaseModel):
    """Response model for listing Helm releases."""
    items: List[HelmRelease]
    count: int


class HTTPRouteInfo(BaseModel):
    """Information about an HTTPRoute associated with a service."""
    name: str
    namespace: str
    url: str  # Ready-to-use URL for the route
    rules: int


class ArkService(BaseModel):
    """Response model for a single ARK service.
    
    An ARK service is essentially a Helm chart with ARK-specific annotations
    that indicate it provides AI capabilities (agents, models, tools, etc.).
    """
    name: str
    namespace: str
    chart: str
    chart_version: Optional[str] = None
    app_version: str
    status: str
    revision: int
    updated: str
    ark_service_type: Optional[str] = None
    description: Optional[str] = None
    ark_resources: List[str] = []  # Resource types this service provides (agent, service, model, etc.)
    httproutes: List[HTTPRouteInfo] = []


class ArkServiceListResponse(BaseModel):
    """Response model for a list of ARK services."""
    items: List[ArkService]
    count: int