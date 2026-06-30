"""Marketplace items aggregator: fetches each source's marketplace.json concurrently.

Credential Secrets are read under the caller's impersonated identity (no access = no
fetch, so the credential can't be borrowed) and the header is attached only to that
source's fetch. Credential values are never logged.
"""
import asyncio
import base64
import json
import logging
import time
from typing import Optional

import httpx
from fastapi import APIRouter, Depends
from kubernetes_asyncio import client
from kubernetes_asyncio.client.rest import ApiException

from ark_sdk.impersonation import ImpersonationConfig

from .client_utils import get_impersonating_api_client
from .exceptions import handle_k8s_errors
from .marketplace_fetch import (
    SourceBlockedError,
    SourceRedirectError,
    build_auth_header,
    fetch_manifest,
)
from .marketplace_sources import CONFIGMAP_NAME, SECRET_KEY, parse_sources
from ...auth.dependencies import get_impersonation_config
from ...models.marketplace_sources import (
    MarketplaceItemError,
    MarketplaceItemsSourceResult,
    MarketplaceSourceParsed,
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


def _error_result(
    name: str, display_name: str, message: str, code: str
) -> MarketplaceItemsSourceResult:
    return MarketplaceItemsSourceResult(
        source=name,
        displayName=display_name,
        error=MarketplaceItemError(message=message, code=code),
    )


async def _resolve_auth_header(
    core,
    namespace: str,
    source: MarketplaceSourceParsed,
) -> tuple[Optional[dict[str, str]], Optional[MarketplaceItemsSourceResult]]:
    """Read the source's credential Secret under impersonation and build its header.

    Returns (header, None) when usable, or (None, error_result) when the caller cannot
    read the referenced credential.
    """
    display_name = source.displayName or source.name
    if not source.secretRef or not source.scheme:
        return None, None
    try:
        secret = await core.read_namespaced_secret(source.secretRef, namespace)
    except ApiException:
        # 403 (no access), 404 (missing), or any other failure: the caller may
        # not use this credential. Never log the source's secret reference value.
        logger.info("credential not accessible for source %s", source.name)
        return None, _error_result(
            source.name, display_name, "credential is not accessible", "auth_error"
        )
    raw = (secret.data or {}).get(SECRET_KEY)
    if raw is None:
        return None, _error_result(
            source.name, display_name, "credential is not accessible", "auth_error"
        )
    try:
        value = base64.b64decode(raw).decode()
    except ValueError:
        logger.info("credential malformed for source %s", source.name)
        return None, _error_result(
            source.name, display_name, "credential is not accessible", "auth_error"
        )
    return build_auth_header(source.scheme, value), None


async def _fetch_source(
    http_client: httpx.AsyncClient,
    namespace: str,
    name: str,
    url: str,
    display_name: str,
    auth_header: Optional[dict[str, str]],
) -> MarketplaceItemsSourceResult:
    """Fetch one source's items. Never raises — failures map to an error code."""
    cache_key = (namespace, name, url)
    cached = _cache_get(cache_key)
    if cached is not None:
        return MarketplaceItemsSourceResult(source=name, displayName=display_name, items=cached)

    logger.info("fetching marketplace items for source %s", name)
    try:
        manifest = await fetch_manifest(http_client, url, auth_header=auth_header)
    except SourceBlockedError:
        return _error_result(name, display_name, "source host is not allowed", "network_error")
    except SourceRedirectError:
        return _error_result(name, display_name, "redirects are not followed", "network_error")
    except httpx.TimeoutException:
        return _error_result(name, display_name, "fetch timed out after 10s", "fetch_timeout")
    except httpx.HTTPStatusError as e:
        status = e.response.status_code
        if status in (401, 403):
            return _error_result(name, display_name, "authentication failed", "auth_error")
        return _error_result(
            name, display_name, f"source returned HTTP {status}", "http_error"
        )
    except json.JSONDecodeError:
        return _error_result(name, display_name, "source returned invalid JSON", "parse_error")
    except httpx.HTTPError as e:
        return _error_result(name, display_name, str(e), "network_error")

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
    auth_headers: dict[str, Optional[dict[str, str]]] = {}
    auth_errors: dict[str, MarketplaceItemsSourceResult] = {}
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
        # Resolve each credential under impersonation while the client is open.
        for source in sources:
            header, error = await _resolve_auth_header(core, namespace, source)
            if error is not None:
                auth_errors[source.name] = error
            else:
                auth_headers[source.name] = header

    timeout = httpx.Timeout(PER_SOURCE_TIMEOUT_SECONDS)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as http_client:
        tasks: dict[str, asyncio.Task] = {}
        for source in sources:
            if source.name in auth_errors:
                continue
            # Assign to a held reference (the dict) so the task isn't GC'd mid-flight.
            tasks[source.name] = asyncio.create_task(
                _fetch_source(
                    http_client,
                    namespace,
                    source.name,
                    source.url,
                    source.displayName or source.name,
                    auth_headers.get(source.name),
                )
            )
        if tasks:
            await asyncio.wait(tasks.values(), timeout=AGGREGATOR_TIMEOUT_SECONDS)

        results: list[MarketplaceItemsSourceResult] = []
        for source in sources:
            if source.name in auth_errors:
                results.append(auth_errors[source.name])
                continue
            task = tasks[source.name]
            if task.done() and not task.cancelled():
                results.append(task.result())
            else:
                task.cancel()
                results.append(
                    _error_result(
                        source.name,
                        source.displayName or source.name,
                        "aggregator deadline exceeded",
                        "aggregator_timeout",
                    )
                )
    return results
