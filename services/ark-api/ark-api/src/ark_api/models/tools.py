from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from .common import PaginatedListResponse


class ToolResponse(BaseModel):
    name: str
    namespace: str
    description: Optional[str] = None
    labels: Optional[Dict[str, str]] = None
    annotations: Optional[Dict[str, str]] = None
    type: Optional[str] = None


class ToolListResponse(PaginatedListResponse):
    items: List[ToolResponse]


class ToolDetailResponse(BaseModel):
    name: str
    namespace: str
    description: Optional[str] = None
    labels: Optional[Dict[str, str]] = None
    annotations: Optional[Dict[str, str]] = None
    spec: Optional[Dict[str, Any]] = None
    status: Optional[Dict[str, Any]] = None


class ToolParameter(BaseModel):
    name: str
    type: str
    description: Optional[str] = None
    required: Optional[bool] = None
    default: Optional[Any] = None
    enum: Optional[List[str]] = None
    format: Optional[str] = None
    pattern: Optional[str] = None


# update_tool assigns spec wholesale from this model, so every block a Tool can
# carry has to be listed here. A field missing from this list is silently
# dropped from the stored Tool on a typed PUT.
class ToolSpec(BaseModel):
    description: str
    input_schema: Optional[Dict[str, Any]] = Field(None, alias="inputSchema")
    output_schema: Optional[Dict[str, Any]] = Field(None, alias="outputSchema")
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    implementation: Optional[Dict[str, Any]] = None
    parameters: Optional[List[ToolParameter]] = None
    annotations: Optional[Dict[str, Any]] = None
    type: str
    # Dict[str, Any] rather than Dict[str, str]: an http spec carries lists
    # (headers, bodyParameters), which a str-valued mapping rejects outright.
    http: Optional[Dict[str, Any]] = None
    mcp: Optional[Dict[str, Any]] = None
    agent: Optional[Dict[str, str]] = None
    team: Optional[Dict[str, str]] = None
    builtin: Optional[Dict[str, str]] = None


class ToolCreateRequest(BaseModel):
    name: str
    namespace: str
    labels: Optional[Dict[str, str]] = None
    annotations: Optional[Dict[str, str]] = None
    spec: ToolSpec


class ToolUpdateRequest(BaseModel):
    labels: Optional[Dict[str, str]] = None
    annotations: Optional[Dict[str, str]] = None
    spec: Optional[ToolSpec] = None