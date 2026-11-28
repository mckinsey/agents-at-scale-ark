import logging
import os
import re
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlsplit

import httpx
from kubernetes_asyncio import client
from kubernetes_asyncio.client.rest import ApiException

from ark_sdk.impersonation import ImpersonationConfig

from ..api.v1.client_utils import get_impersonating_api_client
from ..api.v1.marketplace_fetch import SourceBlockedError, SourceRedirectError, fetch_manifest
from ..api.v1.marketplace_items import PER_SOURCE_TIMEOUT_SECONDS, _resolve_auth_header
from ..api.v1.marketplace_sources import CONFIGMAP_NAME, parse_sources
from .errors import describe_error, install_error

logger = logging.getLogger(__name__)

SOURCE_NOT_FOUND = "source-not-found"
ITEM_NOT_FOUND = "item-not-found"
CATALOG_UNAVAILABLE = "catalog-unavailable"
NOT_INSTALLABLE = "not-installable"
REGISTRY_NOT_ALLOWED = "registry-not-allowed"

ALLOWLIST_ENV = "MARKETPLACE_INSTALL_REGISTRY_ALLOWLIST"
PLAIN_HTTP_ENV = "MARKETPLACE_INSTALL_PLAIN_HTTP_REGISTRIES"
DEFAULT_REGISTRY_ALLOWLIST = "oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts/"

OCI_SCHEME = "oci://"
CHART_NAME = re.compile(r"[a-z0-9][a-z0-9._-]*")
RELEASE_NAME = re.compile(r"[a-z0-9]([-a-z0-9]*[a-z0-9])?")
MAX_RELEASE_NAME_LENGTH = 53


@dataclass(frozen=True)
class ResolvedItem:
    source: str
    item: str
    chart_ref: str
    release: str
    plain_http: bool


def _env_list(name: str, default: str = "") -> list[str]:
    return [entry.strip() for entry in os.getenv(name, default).split(",") if entry.strip()]


def registry_allowlist() -> list[str]:
    prefixes = []
    for prefix in _env_list(ALLOWLIST_ENV, DEFAULT_REGISTRY_ALLOWLIST):
        if prefix.startswith(OCI_SCHEME) and prefix.endswith("/") and urlsplit(prefix).netloc:
            prefixes.append(prefix)
        else:
            logger.warning("Ignoring marketplace install registry %r: it must be an oci:// prefix ending in /", prefix)
    return prefixes


def chart_ref_allowed(chart_ref: str) -> bool:
    for prefix in registry_allowlist():
        if chart_ref.startswith(prefix) and CHART_NAME.fullmatch(chart_ref[len(prefix):]):
            return True
    return False


def uses_plain_http(chart_ref: str) -> bool:
    return urlsplit(chart_ref).netloc in _env_list(PLAIN_HTTP_ENV)


def release_name_valid(name: str) -> bool:
    return len(name) <= MAX_RELEASE_NAME_LENGTH and RELEASE_NAME.fullmatch(name) is not None


def _reader(impersonation: Optional[ImpersonationConfig]) -> str:
    return "ark-api cannot" if impersonation is None else "You cannot"


async def _read_source(namespace: str, source: str, impersonation: Optional[ImpersonationConfig]):
    async with get_impersonating_api_client(impersonation) as api:
        core = client.CoreV1Api(api)
        try:
            config_map = await core.read_namespaced_config_map(CONFIGMAP_NAME, namespace)
        except ApiException as e:
            if e.status == 404:
                raise install_error(404, SOURCE_NOT_FOUND, f"Marketplace source {source} was not found") from None
            if e.status == 403:
                raise install_error(
                    502,
                    CATALOG_UNAVAILABLE,
                    f"{_reader(impersonation)} read the marketplace sources of namespace {namespace}",
                ) from None
            logger.warning("Reading marketplace sources failed: %s", describe_error(e))
            raise install_error(502, CATALOG_UNAVAILABLE, "Marketplace sources could not be read") from None
        raw = (config_map.data or {}).get(source)
        if raw is None:
            raise install_error(404, SOURCE_NOT_FOUND, f"Marketplace source {source} was not found")
        try:
            parsed = parse_sources({source: raw})[0]
        except (ValueError, KeyError, TypeError, AttributeError):
            raise install_error(502, CATALOG_UNAVAILABLE, f"Marketplace source {source} is malformed") from None
        header, error = await _resolve_auth_header(core, namespace, parsed)
        if error is not None:
            raise install_error(
                502, CATALOG_UNAVAILABLE, f"{_reader(impersonation)} read the credential of marketplace source {source}"
            )
        return parsed, header


async def _fetch_items(source: str, url: str, header: Optional[dict[str, str]]) -> list:
    timeout = httpx.Timeout(PER_SOURCE_TIMEOUT_SECONDS)
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as http_client:
            manifest = await fetch_manifest(http_client, url, auth_header=header)
    except (SourceBlockedError, SourceRedirectError, httpx.HTTPError, ValueError) as e:
        logger.info("Fetching marketplace source %s failed: %s", source, type(e).__name__)
        raise install_error(502, CATALOG_UNAVAILABLE, f"Marketplace source {source} could not be fetched") from None
    items = manifest.get("items") if isinstance(manifest, dict) else None
    return items if isinstance(items, list) else []


def _find_item(items: list, item: str) -> dict:
    for entry in items:
        if isinstance(entry, dict) and entry.get("name") == item:
            return entry
    raise install_error(404, ITEM_NOT_FOUND, f"Marketplace item {item} was not found")


def _check_item(source: str, item: str, entry: dict) -> ResolvedItem:
    ark = entry.get("ark")
    if not isinstance(ark, dict):
        raise install_error(422, NOT_INSTALLABLE, f"Marketplace item {item} has no chart to install")
    if ark.get("installable") is not True:
        raise install_error(
            422, NOT_INSTALLABLE, f"Marketplace item {item} is not marked as installable from the dashboard"
        )
    chart_ref = ark.get("chartPath")
    if not isinstance(chart_ref, str) or not chart_ref:
        raise install_error(422, NOT_INSTALLABLE, f"Marketplace item {item} has no chart to install")
    if not chart_ref_allowed(chart_ref):
        raise install_error(
            422, REGISTRY_NOT_ALLOWED, f"The chart of marketplace item {item} is not on an allowed registry"
        )
    release = ark.get("helmReleaseName") or item
    if not isinstance(release, str) or not release_name_valid(release):
        raise install_error(422, NOT_INSTALLABLE, f"Marketplace item {item} has an invalid release name")
    return ResolvedItem(
        source=source, item=item, chart_ref=chart_ref, release=release, plain_http=uses_plain_http(chart_ref)
    )


async def resolve(
    namespace: str, source: str, item: str, impersonation: Optional[ImpersonationConfig]
) -> ResolvedItem:
    parsed, header = await _read_source(namespace, source, impersonation)
    items = await _fetch_items(source, parsed.url, header)
    return _check_item(source, item, _find_item(items, item))
