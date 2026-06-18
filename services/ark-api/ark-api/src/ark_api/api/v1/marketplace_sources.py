"""Marketplace sources CRUD and permission probe backed by a namespaced ConfigMap."""
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from kubernetes_asyncio import client
from kubernetes_asyncio.client.rest import ApiException

from ark_sdk.impersonation import ImpersonationConfig

from .client_utils import get_impersonating_api_client
from .exceptions import handle_k8s_errors
from ...auth.dependencies import get_impersonation_config
from ...models.marketplace_sources import (
    MarketplacePermissionsResponse,
    MarketplaceSourceCreate,
    MarketplaceSourceResponse,
    MarketplaceSourceUpdate,
)

logger = logging.getLogger(__name__)

CONFIGMAP_NAME = "marketplace-sources"
MERGE_PATCH = "application/merge-patch+json"
APPLY_PATCH = "application/apply-patch+yaml"
# Per-key field manager: keeps each source independently owned under SSA.
FIELD_MANAGER_PREFIX = "ark-api-source-"

router = APIRouter(
    prefix="/namespaces/{namespace}/marketplace-sources",
    tags=["marketplace-sources"],
)


def _encode_value(url: str, display_name: Optional[str]) -> str:
    value: dict[str, str] = {"url": url}
    if display_name:
        value["displayName"] = display_name
    return json.dumps(value)


def _apply_body(name: str, value_json: str) -> dict:
    """Single-key ConfigMap manifest for server-side apply."""
    return {
        "apiVersion": "v1",
        "kind": "ConfigMap",
        "metadata": {"name": CONFIGMAP_NAME},
        "data": {name: value_json},
    }


def parse_sources(data: dict[str, str]) -> list[MarketplaceSourceResponse]:
    sources: list[MarketplaceSourceResponse] = []
    for name, raw in data.items():
        value = json.loads(raw)
        sources.append(
            MarketplaceSourceResponse(
                name=name,
                url=value["url"],
                displayName=value.get("displayName"),
            )
        )
    return sources


@router.get("/permissions", response_model=MarketplacePermissionsResponse)
async def get_marketplace_source_permissions(
    namespace: str,
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> MarketplacePermissionsResponse:
    """Probe edit permission via SSAR. Fail-closed: canEdit=False on any error."""
    try:
        async with get_impersonating_api_client(impersonation) as api:
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
            return MarketplacePermissionsResponse(canEdit=bool(result.status.allowed))
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
        return parse_sources(config_map.data or {})


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
        value = json.loads(data[name])
        return MarketplaceSourceResponse(
            name=name, url=value["url"], displayName=value.get("displayName")
        )


@router.post("", response_model=MarketplaceSourceResponse, status_code=201)
@handle_k8s_errors(operation="create", resource_type="marketplace_source")
async def create_marketplace_source(
    namespace: str,
    body: MarketplaceSourceCreate,
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> MarketplaceSourceResponse:
    """Create a source via server-side apply (creates the ConfigMap if absent)."""
    value_json = _encode_value(body.url, body.displayName)
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
        await core.patch_namespaced_config_map(
            CONFIGMAP_NAME,
            namespace,
            _apply_body(body.name, value_json),
            field_manager=f"{FIELD_MANAGER_PREFIX}{body.name}",
            force=True,
            _content_type=APPLY_PATCH,
        )
    return MarketplaceSourceResponse(
        name=body.name, url=body.url, displayName=body.displayName
    )


@router.patch("/{name}", response_model=MarketplaceSourceResponse)
@handle_k8s_errors(operation="update", resource_type="marketplace_source")
async def update_marketplace_source(
    namespace: str,
    name: str,
    body: MarketplaceSourceUpdate,
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> MarketplaceSourceResponse:
    """Update a source via server-side apply. Replaces the value (omitting displayName clears it)."""
    value_json = _encode_value(body.url, body.displayName)
    async with get_impersonating_api_client(impersonation) as api:
        core = client.CoreV1Api(api)
        config_map = await core.read_namespaced_config_map(CONFIGMAP_NAME, namespace)
        if name not in (config_map.data or {}):
            raise HTTPException(status_code=404, detail=f"marketplace source '{name}' not found")
        await core.patch_namespaced_config_map(
            CONFIGMAP_NAME,
            namespace,
            _apply_body(name, value_json),
            field_manager=f"{FIELD_MANAGER_PREFIX}{name}",
            force=True,
            _content_type=APPLY_PATCH,
        )
    return MarketplaceSourceResponse(
        name=name, url=body.url, displayName=body.displayName
    )


@router.delete("/{name}", status_code=204)
@handle_k8s_errors(operation="delete", resource_type="marketplace_source")
async def delete_marketplace_source(
    namespace: str,
    name: str,
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> None:
    """Delete a marketplace source entry by removing its ConfigMap data key."""
    async with get_impersonating_api_client(impersonation) as api:
        core = client.CoreV1Api(api)
        config_map = await core.read_namespaced_config_map(CONFIGMAP_NAME, namespace)
        if name not in (config_map.data or {}):
            raise HTTPException(status_code=404, detail=f"marketplace source '{name}' not found")
        await core.patch_namespaced_config_map(
            CONFIGMAP_NAME,
            namespace,
            {"data": {name: None}},
            _content_type=MERGE_PATCH,
        )
