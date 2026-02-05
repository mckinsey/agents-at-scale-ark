"""Export models for Ark API."""
from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum


class ResourceType(str, Enum):
    """Supported resource types for export."""
    AGENTS = "agents"
    TEAMS = "teams"
    MODELS = "models"
    QUERIES = "queries"
    A2A = "a2a"
    MCP = "mcp"
    WORKFLOWS = "workflows"
    EVALUATORS = "evaluators"
    EVALUATIONS = "evaluations"


class ExportRequest(BaseModel):
    """Request model for exporting resources."""
    resource_types: List[ResourceType] = Field(
        description="List of resource types to export"
    )
    resource_ids: Optional[Dict[str, List[str]]] = Field(
        None,
        description="Optional map of resource type to specific resource IDs to export"
    )
    namespace: Optional[str] = Field(
        None,
        description="Namespace to export from (defaults to current context)"
    )


class ExportAllRequest(BaseModel):
    """Request model for exporting all resources."""
    namespace: Optional[str] = Field(
        None,
        description="Namespace to export from (defaults to current context)"
    )


class ExportResponse(BaseModel):
    """Response model for export operations."""
    export_id: str = Field(description="Unique identifier for this export")
    timestamp: datetime = Field(description="Timestamp when export was created")
    resource_counts: Dict[str, int] = Field(
        description="Count of resources exported by type"
    )
    filename: str = Field(description="Suggested filename for the export")


class ExportHistoryResponse(BaseModel):
    """Response model for export history."""
    last_export: Optional[datetime] = Field(
        None,
        description="Timestamp of the last export"
    )
    export_count: int = Field(
        default=0,
        description="Total number of exports performed"
    )


class ResourceExportItem(BaseModel):
    """Individual resource item for export."""
    name: str = Field(description="Resource name")
    namespace: str = Field(description="Resource namespace")
    kind: str = Field(description="Resource kind")
    yaml_content: str = Field(description="YAML representation of the resource")