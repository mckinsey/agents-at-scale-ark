from typing import Literal

from pydantic import BaseModel


class PermissionsResponse(BaseModel):
    status: Literal["ok", "unavailable"]
    reason: str | None = None
    rules: dict[str, list[str]] = {}


class ContextResponse(BaseModel):
    namespace: str
    cluster: str | None
    read_only_mode: bool
    permissions: PermissionsResponse | None = None
