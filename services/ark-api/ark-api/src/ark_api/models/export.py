"""Export models for Ark API."""
from datetime import datetime
from typing import List, Optional, Dict, Any, Literal, get_args
from pydantic import BaseModel, Field


ResourceType = Literal[
    "agents",
    "teams",
    "models",
    "queries",
    "a2a",
    "mcpservers",
    "workflows",
    "evaluators",
    "evaluations"
]

ALL_RESOURCE_TYPES = list(get_args(ResourceType))


class ExportRequest(BaseModel):
    """Request model for exporting resources."""
    resource_types: Optional[List[ResourceType]] = Field(
        None,
        description="List of resource types to export. If not specified, exports all resource types"
    )
    resource_ids: Optional[Dict[str, List[str]]] = Field(
        None,
        description="Optional map of resource type to specific resource IDs to export"
    )
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