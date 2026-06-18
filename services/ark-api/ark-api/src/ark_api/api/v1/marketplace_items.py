"""Marketplace items aggregator: fetches each source's marketplace.json concurrently."""
import asyncio
import ipaddress
import json
import logging
import socket
import time
from typing import Optional
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends
from kubernetes_asyncio import client
from kubernetes_asyncio.client.rest import ApiException

from ark_sdk.impersonation import ImpersonationConfig

from .client_utils import get_impersonating_api_client
from .exceptions import handle_k8s_errors
from .marketplace_sources import CONFIGMAP_NAME, parse_sources
from ...auth.dependencies import get_impersonation_config
from ...models.marketplace_sources import (
    MarketplaceItemError,
    MarketplaceItemsSourceResult,
)

logger = logging.getLogger(__name__)

PER_SOURCE_TIMEOUT_SECONDS = 10.0
AGGREGATOR_TIMEOUT_SECONDS = 30.0
CACHE_TTL_SECONDS = 3600.0
MAX_CACHE_ENTRIES = 512

# In-process cache per replica, keyed on (namespace, source-name, url); FIFO-bounded.
_items_cache: dict[tuple[str, str, str], tuple[float, list]] = {}

router = APIRouter(
    prefix="/namespaces/{namespace}/marketplace-items",
    tags=["marketplace-items"],
)


async def _resolve_safe_ip(host: str, port: int) -> Optional[str]:
    """
    Best-effort SSRF guard: reject non-routable hosts; RFC-1918 allowed for internal mirrors.
    Resolve once and validate every answer; return one safe IP to pin, else None.
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


def _cache_get(key: tuple[str, str, str]) -> Optional[list]:
    entry = _items_cache.get(key)
    if entry is None:
        return None
    cached_at, items = entry
    if time.monotonic() - cached_at > CACHE_TTL_SECONDS:
        _items_cache.pop(key, None)
        return None
    return items


def _cache_set(key: tuple[str, str, str], items: list) -> None:
    _items_cache.pop(key, None)
    if len(_items_cache) >= MAX_CACHE_ENTRIES:
        oldest = next(iter(_items_cache))
        _items_cache.pop(oldest, None)
    _items_cache[key] = (time.monotonic(), items)


async def _fetch_source(
    http_client: httpx.AsyncClient,
    namespace: str,
    name: str,
    url: str,
    display_name: str,
) -> MarketplaceItemsSourceResult:
    """Fetch one source's items. Never raises — failures map to an error code."""
    cache_key = (namespace, name, url)
    cached = _cache_get(cache_key)
    if cached is not None:
        return MarketplaceItemsSourceResult(source=name, displayName=display_name, items=cached)

    parsed = urlparse(url)
    host = parsed.hostname
    port = parsed.port or 443
    safe_ip = await _resolve_safe_ip(host, port) if host else None
    if safe_ip is None:
        return MarketplaceItemsSourceResult(
            source=name,
            displayName=display_name,
            error=MarketplaceItemError(
                message="source host is not allowed", code="network_error"
            ),
        )

    logger.info("fetching marketplace items for source %s", name)
    try:
        ip_url = httpx.URL(url).copy_with(host=safe_ip)
        response = await http_client.get(
            ip_url,
            headers={"Accept": "application/json", "Host": parsed.netloc},
            extensions={"sni_hostname": host},
        )
        if response.is_redirect:
            return MarketplaceItemsSourceResult(
                source=name,
                displayName=display_name,
                error=MarketplaceItemError(
                    message="redirects are not followed", code="network_error"
                ),
            )
        response.raise_for_status()
        manifest = response.json()
    except httpx.TimeoutException:
        return MarketplaceItemsSourceResult(
            source=name,
            displayName=display_name,
            error=MarketplaceItemError(message="fetch timed out after 10s", code="fetch_timeout"),
        )
    except httpx.HTTPStatusError as e:
        return MarketplaceItemsSourceResult(
            source=name,
            displayName=display_name,
            error=MarketplaceItemError(
                message=f"source returned HTTP {e.response.status_code}", code="http_error"
            ),
        )
    except json.JSONDecodeError:
        return MarketplaceItemsSourceResult(
            source=name,
            displayName=display_name,
            error=MarketplaceItemError(message="source returned invalid JSON", code="parse_error"),
        )
    except httpx.HTTPError as e:
        return MarketplaceItemsSourceResult(
            source=name,
            displayName=display_name,
            error=MarketplaceItemError(message=str(e), code="network_error"),
        )

    items = manifest.get("items", []) if isinstance(manifest, dict) else []
    _cache_set(cache_key, items)
    return MarketplaceItemsSourceResult(source=name, displayName=display_name, items=items)


@router.get("", response_model=list[MarketplaceItemsSourceResult])
@handle_k8s_errors(operation="list", resource_type="marketplace_item")
async def list_marketplace_items(
    namespace: str,
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> list[MarketplaceItemsSourceResult]:
    """Aggregate marketplace items across the namespace's sources. Always HTTP 200."""
    async with get_impersonating_api_client(impersonation) as api:
        core = client.CoreV1Api(api)
        try:
            config_map = await core.read_namespaced_config_map(CONFIGMAP_NAME, namespace)
        except ApiException as e:
            if e.status == 404:
                return []
            raise
        sources = parse_sources(config_map.data or {})

    if not sources:
        return []

    timeout = httpx.Timeout(PER_SOURCE_TIMEOUT_SECONDS)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as http_client:
        tasks: dict[str, asyncio.Task] = {}
        for source in sources:
            # Assign to a held reference (the dict) so the task isn't GC'd mid-flight.
            tasks[source.name] = asyncio.create_task(
                _fetch_source(
                    http_client,
                    namespace,
                    source.name,
                    source.url,
                    source.displayName or source.name,
                )
            )
        await asyncio.wait(tasks.values(), timeout=AGGREGATOR_TIMEOUT_SECONDS)

        results: list[MarketplaceItemsSourceResult] = []
        for source in sources:
            task = tasks[source.name]
            if task.done() and not task.cancelled():
                results.append(task.result())
            else:
                task.cancel()
                results.append(
                    MarketplaceItemsSourceResult(
                        source=source.name,
                        displayName=source.displayName or source.name,
                        error=MarketplaceItemError(
                            message="aggregator deadline exceeded", code="aggregator_timeout"
                        ),
                    )
                )
    return results
