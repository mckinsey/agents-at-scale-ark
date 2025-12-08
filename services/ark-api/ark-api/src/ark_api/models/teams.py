"""Team CRD response models."""
from typing import List, Dict, Optional, Any

from pydantic import BaseModel, Field

from .common import AvailabilityStatus


class TeamMember(BaseModel):
    """Team member configuration."""
    name: str
    type: str


class GraphEdge(BaseModel):
    """Graph edge configuration."""
    from_: str = Field(..., alias='from')
    to: str

    model_config = {
        "populate_by_name": True
    }


class Graph(BaseModel):
    """Team workflow graph configuration."""
    edges: List[GraphEdge]


class Selector(BaseModel):
    """Team selector configuration."""
    agent: Optional[str] = None
    selectorPrompt: Optional[str] = None


class TeamResponse(BaseModel):
    """Team resource response model."""
    name: str
    namespace: str
    description: Optional[str] = None
    strategy: Optional[str] = None
    members_count: Optional[int] = None
    status: Optional[str] = None


class TeamListResponse(BaseModel):
    """List of teams response model."""
    items: List[TeamResponse]
    count: int


class TeamCreateRequest(BaseModel):
    """Request model for creating a team."""
    name: str
    description: Optional[str] = None
    members: List[TeamMember]
    strategy: str
    graph: Optional[Graph] = None
    maxTurns: Optional[int] = None
    selector: Optional[Selector] = None


class TeamUpdateRequest(BaseModel):
    """Request model for updating a team."""
    description: Optional[str] = None
    members: Optional[List[TeamMember]] = None
    strategy: Optional[str] = None
    graph: Optional[Graph] = None
    maxTurns: Optional[int] = None
    selector: Optional[Selector] = None


class TeamDetailResponse(BaseModel):
    """Detailed team response model."""
    name: str
    namespace: str
    description: Optional[str] = None
    members: List[TeamMember]
    strategy: str
    graph: Optional[Graph] = None
    maxTurns: Optional[int] = None
    selector: Optional[Selector] = None
    available: Optional[AvailabilityStatus] = None
    status: Optional[Dict[str, Any]] = None