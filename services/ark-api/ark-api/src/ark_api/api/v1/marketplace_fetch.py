"""Shared credentialed manifest fetch: SSRF guard, IP pinning, header building."""

import asyncio
import base64
import ipaddress
import socket
from typing import Optional
from urllib.parse import urlparse

import httpx

from ...models.marketplace_sources import AuthScheme


class SourceBlockedError(Exception):
    """The source host resolved to a non-routable/blocked address (SSRF guard)."""


class SourceRedirectError(Exception):
    """The source responded with a redirect; credentialed fetches never follow."""


async def resolve_safe_ip(host: str, port: int) -> Optional[str]:
    """Best-effort SSRF guard: reject non-routable hosts (RFC-1918 allowed for internal
    mirrors). Resolve once, validate every answer, return one safe IP to pin, else None.
    """
    try:
        infos = await asyncio.to_thread(
            socket.getaddrinfo, host, port, type=socket.SOCK_STREAM
        )
    except socket.gaierror:
        return None
    if not infos:
        return None
    safe_ip: Optional[str] = None
    for info in infos:
        addr = ipaddress.ip_address(info[4][0])
        if (
            addr.is_loopback
            or addr.is_link_local
            or addr.is_multicast
            or addr.is_reserved
            or addr.is_unspecified
        ):
            return None
        if safe_ip is None:
            safe_ip = str(info[4][0])
    return safe_ip


def build_auth_header(scheme: AuthScheme, value: str) -> dict[str, str]:
    """Build the Authorization header for a scheme. Never logged."""
    if scheme == "bearer":
        return {"Authorization": f"Bearer {value}"}
    # HTTP Basic with empty username + credential as password (Azure DevOps PAT).
    token = base64.b64encode(f":{value}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


async def fetch_manifest(
    http_client: httpx.AsyncClient,
    url: str,
    *,
    auth_header: Optional[dict[str, str]] = None,
) -> object:
    """Fetch a manifest with the SSRF guard applied and the IP pinned.

    The Authorization header reaches only the configured host: the request targets the
    validated IP with the original Host/SNI, and a redirect is an error (never followed).
    Raises SourceBlockedError, SourceRedirectError, or httpx/JSON errors for callers to map.
    """
    parsed = urlparse(url)
    host = parsed.hostname
    port = parsed.port or 443
    safe_ip = await resolve_safe_ip(host, port) if host else None
    if safe_ip is None:
        raise SourceBlockedError("source host is not allowed")

    headers = {"Accept": "application/json", "Host": parsed.netloc}
    if auth_header:
        headers.update(auth_header)

    ip_url = httpx.URL(url).copy_with(host=safe_ip)
    response = await http_client.get(
        ip_url,
        headers=headers,
        extensions={"sni_hostname": host},
    )
    if response.is_redirect:
        raise SourceRedirectError("redirects are not followed")
    response.raise_for_status()
    return response.json()
