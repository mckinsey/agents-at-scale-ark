"""Request and response models for the MCP auth endpoints."""
from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


FlowState = Literal["pending", "authorized", "failed", "expired"]


class AuthStartRequest(BaseModel):
    force: Optional[bool] = Field(
        default=None,
        description=(
            "Bypass the Authorized preflight and force fresh DCR "
            "even when the Secret carries cached client credentials"
        ),
    )
    scopes: Optional[List[str]] = Field(
        default=None,
        description=(
            "Explicit scopes to request. An empty array opts out of scope negotiation; "
            "omit the field entirely to fall back to status.authorization.scopesSupported."
        ),
    )
    redirect_on_complete: bool = Field(
        default=False,
        description=(
            "When true (used by the dashboard), the callback redirects the browser "
            "back to the dashboard instead of rendering the HTML completion page. "
            "Defaults to false, preserving the CLI's HTML-completion behaviour."
        ),
    )


class AuthStartResponse(BaseModel):
    auth_id: str
    authorization_url: str
    flow_expires_at: str = Field(
        description="RFC 3339 UTC cache-entry deadline; distinct from the token expiry returned by auth/status",
    )


class AuthStatusResponse(BaseModel):
    state: FlowState
    message: Optional[str] = None
    controller_state: Optional[str] = Field(
        default=None,
        description="Current MCPServer status.authorization.state from the controller",
    )
    controller_message: Optional[str] = Field(
        default=None,
        description="Latest Available condition message from the controller",
    )
    expires_at: Optional[str] = Field(
        default=None,
        description="RFC 3339 UTC token expiry (only present once state == authorized)",
    )


class AuthLogoutRequest(BaseModel):
    keep_client: Optional[bool] = None
    delete_secret: Optional[bool] = None


class AuthLogoutResponse(BaseModel):
    noop: bool = False
    deleted: bool = False
    cleared_keys: List[str] = Field(default_factory=list)
