from pydantic import BaseModel, Field


class CapabilitiesResponse(BaseModel):
    can_create_namespace: bool = False


class ContextResponse(BaseModel):
    namespace: str
    cluster: str | None
    read_only_mode: bool
    capabilities: CapabilitiesResponse = Field(default_factory=CapabilitiesResponse)
