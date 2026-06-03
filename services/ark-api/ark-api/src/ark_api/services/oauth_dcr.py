"""RFC 7591 Dynamic Client Registration client.

POSTs the configured `redirect_uri` to the MCP server's registration
endpoint and validates the response. Rejects responses that:
  - Echo a `redirect_uris` array not containing the configured URI.
  - Use a `token_endpoint_auth_method` other than `client_secret_basic`
    (public-client `none` is intentionally out of scope).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


SUPPORTED_AUTH_METHOD = "client_secret_basic"


class DcrError(Exception):
    """Raised when the registration response violates the contract or the IdP returns non-2xx."""


@dataclass
class DcrResult:
    client_id: str
    client_secret: str
    raw_response: dict


def _redirect_uri_was_honoured(payload: dict, configured: str) -> bool:
    registered = payload.get("redirect_uris")
    if registered is None:
        return False
    if not isinstance(registered, list):
        return False
    return configured in registered


async def register_client(
    *,
    registration_endpoint: str,
    redirect_uri: str,
    timeout_seconds: int,
    client_name: str = "ark",
    client: Optional[httpx.AsyncClient] = None,
) -> DcrResult:
    body = {
        "client_name": client_name,
        "redirect_uris": [redirect_uri],
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "token_endpoint_auth_method": SUPPORTED_AUTH_METHOD,
    }

    owns_client = client is None
    http = client or httpx.AsyncClient(timeout=timeout_seconds)
    try:
        response = await http.post(
            registration_endpoint,
            json=body,
            headers={"Accept": "application/json"},
        )
    finally:
        if owns_client:
            await http.aclose()

    if response.status_code >= 400:
        raise DcrError(
            f"DCR failed with HTTP {response.status_code}: {response.text[:512]}"
        )

    try:
        payload = response.json()
    except ValueError as exc:
        raise DcrError(f"DCR response was not JSON: {response.text[:256]}") from exc

    if not _redirect_uri_was_honoured(payload, redirect_uri):
        raise DcrError(
            "DCR response did not register the configured redirect_uri "
            f"(expected {redirect_uri!r}, response: {payload.get('redirect_uris')!r})"
        )

    auth_method = payload.get("token_endpoint_auth_method") or SUPPORTED_AUTH_METHOD
    if auth_method != SUPPORTED_AUTH_METHOD:
        raise DcrError(
            f"DCR response used unsupported token_endpoint_auth_method {auth_method!r}; "
            f"only {SUPPORTED_AUTH_METHOD!r} is accepted"
        )

    client_id = payload.get("client_id")
    client_secret = payload.get("client_secret")
    if not client_id or not client_secret:
        raise DcrError("DCR response missing client_id or client_secret")

    return DcrResult(client_id=client_id, client_secret=client_secret, raw_response=payload)
