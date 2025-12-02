from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ToolResponse(BaseModel):
    name: str
    namespace: str
    description: Optional[str] = None
    labels: Optional[Dict[str, str]] = None
    annotations: Optional[Dict[str, str]] = None
    type: Optional[str] = None


class ToolListResponse(BaseModel):
    items: List[ToolResponse]
    total: int


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


class ToolSpec(BaseModel):
    description: str
    input_schema: Optional[Dict[str, Any]] = Field(None, alias="inputSchema")
    output_schema: Optional[Dict[str, Any]] = Field(None, alias="outputSchema")
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    implementation: Optional[Dict[str, Any]] = None
    parameters: Optional[List[ToolParameter]] = None
    type: str
    http: Optional[Dict[str, str]] = None
    agent: Optional[Dict[str, str]] = None
    team: Optional[Dict[str, str]] = None


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