"""OAuth token-exchange client.

POSTs `grant_type=authorization_code` (with `code`, `redirect_uri`,
`code_verifier`, and `resource`) to the MCP server's token endpoint,
authenticating via HTTP Basic with the registered client credentials.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


class TokenExchangeError(Exception):
    """Raised when the token endpoint returns non-2xx or a malformed payload."""

    def __init__(self, message: str, error_code: Optional[str] = None):
        super().__init__(message)
        self.error_code = error_code or message


@dataclass
class TokenResponse:
    access_token: str
    refresh_token: Optional[str]
    expires_in: Optional[int]
    raw: dict


async def exchange_code(
    *,
    token_endpoint: str,
    code: str,
    redirect_uri: str,
    code_verifier: str,
    resource: str,
    client_id: str,
    client_secret: str,
    timeout_seconds: int,
    client: Optional[httpx.AsyncClient] = None,
) -> TokenResponse:
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "code_verifier": code_verifier,
        "resource": resource,
    }

    owns_client = client is None
    http = client or httpx.AsyncClient(timeout=timeout_seconds)
    try:
        response = await http.post(
            token_endpoint,
            data=data,
            auth=httpx.BasicAuth(client_id, client_secret),
            headers={"Accept": "application/json"},
        )
    finally:
        if owns_client:
            await http.aclose()

    if response.status_code >= 400:
        try:
            payload = response.json()
        except ValueError:
            payload = {}
        error = payload.get("error") or f"http_{response.status_code}"
        description = payload.get("error_description")
        message = f"{error}: {description}" if description else error
        raise TokenExchangeError(message, error_code=error)

    try:
        payload = response.json()
    except ValueError as exc:
        raise TokenExchangeError("token endpoint response was not JSON") from exc

    access_token = payload.get("access_token")
    if not access_token:
        raise TokenExchangeError("token endpoint response missing access_token")

    expires_in_raw = payload.get("expires_in")
    expires_in: Optional[int]
    if expires_in_raw is None:
        expires_in = None
    else:
        try:
            expires_in = int(expires_in_raw)
        except (TypeError, ValueError):
            expires_in = None

    return TokenResponse(
        access_token=access_token,
        refresh_token=payload.get("refresh_token"),
        expires_in=expires_in,
        raw=payload,
    )
