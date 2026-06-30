"""Marketplace sources CRUD and permission probe backed by a namespaced ConfigMap."""

import base64
import json
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
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
from ...auth.dependencies import get_impersonation_config
from ...models.marketplace_sources import (
    AuthScheme,
    MarketplacePermissionsResponse,
    MarketplaceSourceAuthInfo,
    MarketplaceSourceCreate,
    MarketplaceSourceParsed,
    MarketplaceSourceResponse,
    MarketplaceSourceUpdate,
)

logger = logging.getLogger(__name__)

CONFIGMAP_NAME = "marketplace-sources"
SECRET_KEY = "value"
MERGE_PATCH = "application/merge-patch+json"
APPLY_PATCH = "application/apply-patch+yaml"
# Per-key field manager: keeps each source independently owned under SSA.
FIELD_MANAGER_PREFIX = "ark-api-source-"
VALIDATE_TIMEOUT_SECONDS = 10.0

router = APIRouter(
    prefix="/namespaces/{namespace}/marketplace-sources",
    tags=["marketplace-sources"],
)


def derive_secret_name(source_name: str) -> str:
    """Deterministic per-source credential Secret name."""
    return f"marketplace-source-{source_name}-auth"


def _encode_value(
    url: str,
    display_name: Optional[str],
    scheme: Optional[AuthScheme],
    secret_ref: Optional[str],
) -> str:
    value: dict[str, object] = {"url": url}
    if display_name:
        value["displayName"] = display_name
    if scheme and secret_ref:
        value["auth"] = {"scheme": scheme, "secretRef": secret_ref}
    return json.dumps(value)


def _apply_configmap_body(name: str, value_json: str) -> dict:
    """Single-key ConfigMap manifest for server-side apply."""
    return {
        "apiVersion": "v1",
        "kind": "ConfigMap",
        "metadata": {"name": CONFIGMAP_NAME},
        "data": {name: value_json},
    }


def _apply_secret_body(name: str, value: str) -> dict:
    """Single-key Secret manifest for server-side apply."""
    return {
        "apiVersion": "v1",
        "kind": "Secret",
        "metadata": {"name": name},
        "type": "Opaque",
        "stringData": {SECRET_KEY: value},
    }


def parse_sources(data: dict[str, str]) -> list[MarketplaceSourceParsed]:
    sources: list[MarketplaceSourceParsed] = []
    for name, raw in data.items():
        sources.append(_parse_entry(name, raw))
    return sources


def _parse_entry(name: str, raw: str) -> MarketplaceSourceParsed:
    value = json.loads(raw)
    auth = value.get("auth") or {}
    return MarketplaceSourceParsed(
        name=name,
        url=value["url"],
        displayName=value.get("displayName"),
        scheme=auth.get("scheme"),
        secretRef=auth.get("secretRef"),
    )


def _to_response(parsed: MarketplaceSourceParsed) -> MarketplaceSourceResponse:
    auth = MarketplaceSourceAuthInfo(scheme=parsed.scheme) if parsed.scheme else None
    return MarketplaceSourceResponse(
        name=parsed.name,
        url=parsed.url,
        displayName=parsed.displayName,
        auth=auth,
        hasCredential=bool(parsed.secretRef),
    )


async def _validate_source(url: str, auth_header: Optional[dict[str, str]]) -> None:
    """Test-fetch the manifest before saving; map failures to 400 (credential never echoed)."""
    timeout = httpx.Timeout(VALIDATE_TIMEOUT_SECONDS)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as http_client:
        try:
            await fetch_manifest(http_client, url, auth_header=auth_header)
        except SourceBlockedError:
            raise HTTPException(status_code=400, detail="source host is not allowed")
        except SourceRedirectError:
            raise HTTPException(
                status_code=400, detail="source returned a redirect, which is not followed"
            )
        except httpx.HTTPStatusError as e:
            raise HTTPException(
                status_code=400,
                detail=f"source returned HTTP {e.response.status_code}",
            )
        except httpx.TimeoutException:
            raise HTTPException(status_code=400, detail="source fetch timed out")
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="source returned invalid JSON")
        except httpx.HTTPError:
            raise HTTPException(status_code=400, detail="source is unreachable")


async def _read_secret_value(core, namespace: str, secret_ref: str) -> str:
    secret = await core.read_namespaced_secret(secret_ref, namespace)
    raw = (secret.data or {}).get(SECRET_KEY)
    if raw is None:
        raise HTTPException(
            status_code=400, detail="existing credential Secret is missing its value"
        )
    return base64.b64decode(raw).decode()


async def _write_secret(core, namespace: str, secret_ref: str, value: str) -> None:
    await core.patch_namespaced_secret(
        secret_ref,
        namespace,
        _apply_secret_body(secret_ref, value),
        field_manager=f"{FIELD_MANAGER_PREFIX}{secret_ref}",
        force=True,
        _content_type=APPLY_PATCH,
    )


async def _delete_secret(core, namespace: str, secret_ref: str) -> None:
    try:
        await core.delete_namespaced_secret(secret_ref, namespace)
    except ApiException as e:
        if e.status != 404:
            raise


async def _can_edit_sources(api, namespace: str) -> bool:
    review = client.V1SelfSubjectAccessReview(
        spec=client.V1SelfSubjectAccessReviewSpec(
            resource_attributes=client.V1ResourceAttributes(
                namespace=namespace,
                verb="update",
                resource="configmaps",
                name=CONFIGMAP_NAME,
            )
        )
    )
    result = await client.AuthorizationV1Api(api).create_self_subject_access_review(review)
    return bool(result.status and result.status.allowed)


async def _authorize_edit(api, namespace: str) -> None:
    if not await _can_edit_sources(api, namespace):
        raise HTTPException(
            status_code=403, detail="not authorized to edit marketplace sources"
        )


@router.get("/permissions", response_model=MarketplacePermissionsResponse)
async def get_marketplace_source_permissions(
    namespace: str,
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> MarketplacePermissionsResponse:
    """Probe edit permission via SSAR. Fail-closed: canEdit=False on any error."""
    try:
        async with get_impersonating_api_client(impersonation) as api:
            return MarketplacePermissionsResponse(
                canEdit=await _can_edit_sources(api, namespace)
            )
    except Exception:
        logger.warning("marketplace-sources permission probe failed", exc_info=True)
        return MarketplacePermissionsResponse(canEdit=False)


@router.get("", response_model=list[MarketplaceSourceResponse])
@handle_k8s_errors(operation="list", resource_type="marketplace_source")
async def list_marketplace_sources(
    namespace: str,
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> list[MarketplaceSourceResponse]:
    """List marketplace sources for a namespace. Missing ConfigMap returns []."""
    async with get_impersonating_api_client(impersonation) as api:
        core = client.CoreV1Api(api)
        try:
            config_map = await core.read_namespaced_config_map(CONFIGMAP_NAME, namespace)
        except ApiException as e:
            if e.status == 404:
                return []
            raise
        return [_to_response(p) for p in parse_sources(config_map.data or {})]


@router.get("/{name}", response_model=MarketplaceSourceResponse)
@handle_k8s_errors(operation="get", resource_type="marketplace_source")
async def get_marketplace_source(
    namespace: str,
    name: str,
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> MarketplaceSourceResponse:
    """Get a single marketplace source by name."""
    async with get_impersonating_api_client(impersonation) as api:
        core = client.CoreV1Api(api)
        config_map = await core.read_namespaced_config_map(CONFIGMAP_NAME, namespace)
        data = config_map.data or {}
        if name not in data:
            raise HTTPException(status_code=404, detail=f"marketplace source '{name}' not found")
        return _to_response(_parse_entry(name, data[name]))


@router.post("", response_model=MarketplaceSourceResponse, status_code=201)
@handle_k8s_errors(operation="create", resource_type="marketplace_source")
async def create_marketplace_source(
    namespace: str,
    body: MarketplaceSourceCreate,
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> MarketplaceSourceResponse:
    """Create a source via server-side apply. With a credential: validate it, store it
    in a per-source Secret, and write only ``{scheme, secretRef}`` to the ConfigMap.
    """
    scheme: Optional[AuthScheme] = None
    secret_ref: Optional[str] = None
    if body.auth is not None and not body.auth.credential:
        raise HTTPException(status_code=400, detail="auth.credential is required")

    async with get_impersonating_api_client(impersonation) as api:
        core = client.CoreV1Api(api)
        try:
            config_map = await core.read_namespaced_config_map(CONFIGMAP_NAME, namespace)
            if body.name in (config_map.data or {}):
                raise HTTPException(
                    status_code=409, detail=f"marketplace source '{body.name}' already exists"
                )
        except ApiException as e:
            if e.status != 404:
                raise
        if body.auth is not None:
            await _authorize_edit(api, namespace)
            scheme = body.auth.scheme
            secret_ref = derive_secret_name(body.name)
            auth_header = build_auth_header(scheme, body.auth.credential)
            await _validate_source(body.url, auth_header)
            await _write_secret(core, namespace, secret_ref, body.auth.credential)
        value_json = _encode_value(body.url, body.displayName, scheme, secret_ref)
        await core.patch_namespaced_config_map(
            CONFIGMAP_NAME,
            namespace,
            _apply_configmap_body(body.name, value_json),
            field_manager=f"{FIELD_MANAGER_PREFIX}{body.name}",
            force=True,
            _content_type=APPLY_PATCH,
        )
    return _to_response(
        MarketplaceSourceParsed(
            name=body.name,
            url=body.url,
            displayName=body.displayName,
            scheme=scheme,
            secretRef=secret_ref,
        )
    )


@router.patch("/{name}", response_model=MarketplaceSourceResponse)
@handle_k8s_errors(operation="update", resource_type="marketplace_source")
async def update_marketplace_source(
    namespace: str,
    name: str,
    body: MarketplaceSourceUpdate,
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> MarketplaceSourceResponse:
    """Update a source via server-side apply. Omitting ``auth`` makes it anonymous and
    deletes the credential Secret; changing the URL or scheme requires re-supplying the
    credential (the existing Secret is never carried to a new URL).
    """
    async with get_impersonating_api_client(impersonation) as api:
        core = client.CoreV1Api(api)
        config_map = await core.read_namespaced_config_map(CONFIGMAP_NAME, namespace)
        if name not in (config_map.data or {}):
            raise HTTPException(status_code=404, detail=f"marketplace source '{name}' not found")
        existing = _parse_entry(name, config_map.data[name])

        scheme: Optional[AuthScheme] = None
        secret_ref: Optional[str] = None
        auth_header: Optional[dict[str, str]] = None
        credential_to_write: Optional[str] = None

        if body.auth is not None:
            await _authorize_edit(api, namespace)
            scheme = body.auth.scheme
            secret_ref = existing.secretRef or derive_secret_name(name)
            if body.auth.credential:
                credential_to_write = body.auth.credential
            else:
                # Keep-existing: only valid when nothing security-relevant moved.
                if not existing.secretRef:
                    raise HTTPException(
                        status_code=400, detail="auth.credential is required"
                    )
                if body.url != existing.url:
                    raise HTTPException(
                        status_code=400,
                        detail="re-supply the credential when changing the source URL",
                    )
                if existing.scheme != scheme:
                    raise HTTPException(
                        status_code=400,
                        detail="re-supply the credential when changing the auth scheme",
                    )
                credential_to_write = await _read_secret_value(
                    core, namespace, existing.secretRef
                )
            auth_header = build_auth_header(scheme, credential_to_write)
            await _validate_source(body.url, auth_header)

        if body.auth is not None:
            await _write_secret(core, namespace, secret_ref, credential_to_write)
        elif existing.secretRef:
            await _delete_secret(core, namespace, existing.secretRef)

        value_json = _encode_value(body.url, body.displayName, scheme, secret_ref)
        await core.patch_namespaced_config_map(
            CONFIGMAP_NAME,
            namespace,
            _apply_configmap_body(name, value_json),
            field_manager=f"{FIELD_MANAGER_PREFIX}{name}",
            force=True,
            _content_type=APPLY_PATCH,
        )
    return _to_response(
        MarketplaceSourceParsed(
            name=name,
            url=body.url,
            displayName=body.displayName,
            scheme=scheme,
            secretRef=secret_ref,
        )
    )


@router.delete("/{name}", status_code=204)
@handle_k8s_errors(operation="delete", resource_type="marketplace_source")
async def delete_marketplace_source(
    namespace: str,
    name: str,
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> None:
    """Delete a source: remove its ConfigMap key and its credential Secret."""
    async with get_impersonating_api_client(impersonation) as api:
        core = client.CoreV1Api(api)
        config_map = await core.read_namespaced_config_map(CONFIGMAP_NAME, namespace)
        if name not in (config_map.data or {}):
            raise HTTPException(status_code=404, detail=f"marketplace source '{name}' not found")
        existing = _parse_entry(name, config_map.data[name])
        await core.patch_namespaced_config_map(
            CONFIGMAP_NAME,
            namespace,
            {"data": {name: None}},
            _content_type=MERGE_PATCH,
        )
        if existing.secretRef:
            await _delete_secret(core, namespace, existing.secretRef)
