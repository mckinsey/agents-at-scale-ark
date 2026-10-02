"""Pydantic models for Memory resources."""

from typing import List, Dict, Optional, Any
from pydantic import BaseModel

from .common import PaginatedListResponse


class MemoryResponse(BaseModel):
    """Response model for memory list items."""
    name: str
    namespace: str
    description: Optional[str] = None
    status: Optional[str] = None


class MemoryDetailResponse(BaseModel):
    """Response model for detailed memory information."""
    name: str
    namespace: str
    description: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    status: Optional[Dict[str, Any]] = None


class MemoryListResponse(PaginatedListResponse):
    """Response model for memory list."""
    items: List[MemoryResponse]


class MemoryCreateRequest(BaseModel):
    """Request model for creating a memory."""
    name: str
    description: Optional[str] = None
    config: Optional[Dict[str, Any]] = None


class MemoryUpdateRequest(BaseModel):
    """Request model for updating a memory."""
    description: Optional[str] = None
    config: Optional[Dict[str, Any]] = None