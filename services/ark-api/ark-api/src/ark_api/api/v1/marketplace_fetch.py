"""Shared credentialed manifest fetch: SSRF guard, IP pinning, header building."""

import asyncio
import base64
import ipaddress
import socket
from typing import Optional
from urllib.parse import urlparse

import httpx

from ...models.marketplace_sources import AuthScheme

MAX_REDIRECTS = 5


class SourceBlockedError(Exception):
    """The source host resolved to a non-routable/blocked address (SSRF guard)."""


class SourceRedirectError(Exception):
    """The source redirect chain could not be followed safely."""


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


def _origin(url: str) -> tuple[str, str, int]:
    parsed = urlparse(url)
    return parsed.scheme, (parsed.hostname or ""), (parsed.port or 443)


async def _get_pinned(
    http_client: httpx.AsyncClient,
    url: str,
    auth_header: Optional[dict[str, str]],
) -> httpx.Response:
    """GET one URL against a validated IP, keeping the original Host/SNI."""
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
    return await http_client.get(
        ip_url,
        headers=headers,
        extensions={"sni_hostname": host},
    )


async def fetch_manifest(
    http_client: httpx.AsyncClient,
    url: str,
    *,
    auth_header: Optional[dict[str, str]] = None,
) -> object:
    """Fetch a manifest with the SSRF guard applied and the IP pinned.

    Redirects are followed one hop at a time so every hop is re-validated: the target
    must be https, its host must pass the SSRF guard, and the Authorization header is
    dropped as soon as the origin changes, so a credential only ever reaches the
    configured host. Raises SourceBlockedError, SourceRedirectError, or httpx/JSON
    errors for callers to map.
    """
    current = url
    origin = _origin(url)
    header = auth_header

    for _ in range(MAX_REDIRECTS + 1):
        response = await _get_pinned(http_client, current, header)
        if not response.is_redirect:
            response.raise_for_status()
            return response.json()

        location = response.headers.get("location")
        if not location:
            raise SourceRedirectError("redirect is missing a location")
        current = str(httpx.URL(current).join(location))
        next_origin = _origin(current)
        if next_origin[0] != "https":
            raise SourceRedirectError("redirect target must be an https URL")
        if next_origin != origin:
            header = None
            origin = next_origin

    raise SourceRedirectError("too many redirects")
