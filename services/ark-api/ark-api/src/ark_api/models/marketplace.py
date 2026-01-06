"""
Marketplace Pydantic models for API requests and responses.

The marketplace feature allows users to:
1. Manage external marketplace sources (URLs to marketplace.json files)
2. Add local agent template implementations
3. Install items from marketplace into Ark as ExecutionEngine CRDs
"""
from typing import List, Dict, Optional, Any
from datetime import datetime

from pydantic import BaseModel, Field


class MarketplaceSourceBase(BaseModel):
    """Base fields for a marketplace source."""
    url: str = Field(..., description="URL to the marketplace JSON file")
    name: Optional[str] = Field(None, description="Display name (auto-detected if not provided)")


class MarketplaceSourceCreate(MarketplaceSourceBase):
    """Request body for adding a marketplace source."""
    pass


class MarketplaceSource(MarketplaceSourceBase):
    """A configured external marketplace source."""
    name: str = Field(..., description="Display name of the source")
    enabled: bool = Field(True, description="Whether the source is enabled")
    addedAt: datetime = Field(..., description="When the source was added")


class MarketplaceSourceListResponse(BaseModel):
    """Response for listing marketplace sources."""
    sources: List[MarketplaceSource]


class MarketplaceItemArk(BaseModel):
    """Ark-specific configuration for a marketplace item."""
    image: str = Field(..., description="Container image URL")
    agentic: bool = Field(True, description="Whether the executor supports agentic mode")


class MarketplaceItemBase(BaseModel):
    """Base fields for a marketplace item."""
    name: str = Field(..., description="Unique identifier (lowercase, hyphens only)")
    type: str = Field(..., description="Item type (executor, service, agent, tool, team)")
    displayName: str = Field(..., description="Human-readable display name")
    description: str = Field(..., description="Item description")
    version: str = Field(..., description="Version string")
    author: str = Field(..., description="Author name")
    tags: List[str] = Field(default_factory=list, description="Tags for categorization")
    category: str = Field(..., description="Category (e.g., development, observability)")
    ark: MarketplaceItemArk = Field(..., description="Ark-specific configuration")


class MarketplaceItemCreate(MarketplaceItemBase):
    """Request body for creating a local marketplace item."""
    pass


class MarketplaceItemUpdate(BaseModel):
    """Request body for updating a local marketplace item."""
    displayName: Optional[str] = None
    description: Optional[str] = None
    version: Optional[str] = None
    author: Optional[str] = None
    tags: Optional[List[str]] = None
    category: Optional[str] = None
    ark: Optional[MarketplaceItemArk] = None


class MarketplaceItem(MarketplaceItemBase):
    """A marketplace item with source and installation info."""
    source: str = Field(..., description="Source name (e.g., 'Local', 'Ark Community')")
    installed: bool = Field(False, description="Whether the item is installed")
    installedNamespace: Optional[str] = Field(None, description="Namespace where installed")
    createdAt: Optional[datetime] = Field(None, description="When the item was created")
    updatedAt: Optional[datetime] = Field(None, description="When the item was last updated")


class MarketplaceItemListResponse(BaseModel):
    """Response for listing marketplace items."""
    items: List[MarketplaceItem]
    total: int


class LocalMarketplaceItemListResponse(BaseModel):
    """Response for listing local marketplace items only."""
    items: List[MarketplaceItem]
    total: int


class MarketplaceInstallRequest(BaseModel):
    """Request body for installing a marketplace item."""
    namespace: str = Field(..., description="Namespace to install into")


class MarketplaceInstallResponse(BaseModel):
    """Response after installing a marketplace item."""
    status: str = Field(..., description="Installation status")
    type: str = Field(..., description="Item type")
    name: str = Field(..., description="Installed resource name")
    namespace: str = Field(..., description="Installed namespace")


class ExternalMarketplaceJson(BaseModel):
    """Schema for external marketplace.json files."""
    version: str = Field(..., description="Marketplace schema version")
    marketplace: str = Field(..., description="Marketplace name")
    items: List[Dict[str, Any]] = Field(default_factory=list, description="List of items")


class MarketplaceCategoriesResponse(BaseModel):
    """Response for listing available categories."""
    categories: List[str]
