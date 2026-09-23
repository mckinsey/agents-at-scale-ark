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
#
# The subtype blocks are all Dict[str, Any] rather than being typed per
# subtype. This model is a passthrough to the Tool CR, whose schema and webhook
# are the authority on their shape, and a narrower value type here does not add
# validation - it only rejects or mangles specs the cluster would accept. That
# is not hypothetical: http was Dict[str, str], and an http spec carrying
# headers or bodyParameters (both lists) failed the request outright. agent,
# team and builtin happen to hold only {name: str} today, so str-valued
# mappings work for them by luck rather than by design; uniform Any means a new
# nested field in any subtype cannot reintroduce this bug.
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
    http: Optional[Dict[str, Any]] = None
    mcp: Optional[Dict[str, Any]] = None
    agent: Optional[Dict[str, Any]] = None
    team: Optional[Dict[str, Any]] = None
    builtin: Optional[Dict[str, Any]] = None


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