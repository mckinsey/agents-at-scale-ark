from pydantic import BaseModel


class ContextResponse(BaseModel):
    namespace: str
    cluster: str | None
    read_only_mode: bool
