"""API routes for the singleton ArkConfig resource."""
import logging
from typing import Optional

from fastapi import APIRouter, Depends
from kubernetes_asyncio.client import CustomObjectsApi
from kubernetes_asyncio.client.rest import ApiException
from ark_sdk.impersonation import ImpersonationConfig

from ...auth.dependencies import get_impersonation_config
from ...models.arkconfig import ArkConfigMemoryRef, ArkConfigResponse, ArkConfigUpdateRequest
from .client_utils import get_impersonating_api_client
from .exceptions import handle_k8s_errors

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/arkconfig", tags=["arkconfig"])

GROUP = "ark.mckinsey.com"
VERSION = "v1alpha1"
PLURAL = "arkconfigs"
SINGLETON_NAME = "default"


def _to_response(cr: dict) -> ArkConfigResponse:
    spec = cr.get("spec") or {}
    memory = spec.get("defaultMemory")
    named = isinstance(memory, dict) and memory.get("name")
    return ArkConfigResponse(
        queryTTL=spec.get("queryTTL"),
        defaultMemory=ArkConfigMemoryRef(name=memory["name"]) if named else None,
        exists=True,
    )


def _requested_spec_updates(body: ArkConfigUpdateRequest) -> dict:
    """Map each field the request actually carried to its new spec value.

    A value of None means "clear this field". Fields the request omitted are
    absent from the result and left untouched on the stored resource, so the
    dashboard saving a TTL cannot wipe a defaultMemory set with kubectl.
    """
    updates: dict = {}
    if "queryTTL" in body.model_fields_set:
        updates["queryTTL"] = body.queryTTL or None
    if "defaultMemory" in body.model_fields_set:
        updates["defaultMemory"] = (
            {"name": body.defaultMemory.name} if body.defaultMemory else None
        )
    return updates


@router.get("", response_model=ArkConfigResponse)
@handle_k8s_errors(operation="get", resource_type="arkconfig")
async def get_arkconfig(impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config)) -> ArkConfigResponse:
    """Return the singleton ArkConfig. If it does not exist, return defaults with exists=false."""
    async with get_impersonating_api_client(impersonation) as api_client:
        custom_api = CustomObjectsApi(api_client)
        try:
            cr = await custom_api.get_cluster_custom_object(
                group=GROUP,
                version=VERSION,
                plural=PLURAL,
                name=SINGLETON_NAME,
            )
        except ApiException as e:
            if e.status == 404:
                return ArkConfigResponse(queryTTL=None, exists=False)
            raise
    return _to_response(cr)


@router.put("", response_model=ArkConfigResponse)
@handle_k8s_errors(operation="update", resource_type="arkconfig")
async def upsert_arkconfig(body: ArkConfigUpdateRequest, impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config)) -> ArkConfigResponse:
    """Create or update the singleton ArkConfig with the fields the request carried.

    Fields the request omitted are left untouched; send a field as null to clear it.
    """
    updates = _requested_spec_updates(body)
    spec = {key: value for key, value in updates.items() if value is not None}

    async with get_impersonating_api_client(impersonation) as api_client:
        custom_api = CustomObjectsApi(api_client)
        try:
            existing = await custom_api.get_cluster_custom_object(
                group=GROUP,
                version=VERSION,
                plural=PLURAL,
                name=SINGLETON_NAME,
            )
        except ApiException as e:
            if e.status != 404:
                raise
            existing = None

        if existing is None:
            cr_body = {
                "apiVersion": f"{GROUP}/{VERSION}",
                "kind": "ArkConfig",
                "metadata": {"name": SINGLETON_NAME},
                "spec": spec,
            }
            created = await custom_api.create_cluster_custom_object(
                group=GROUP,
                version=VERSION,
                plural=PLURAL,
                body=cr_body,
            )
            return _to_response(created)

        existing_spec = existing.get("spec") or {}
        for key, value in updates.items():
            if value is None:
                existing_spec.pop(key, None)
            else:
                existing_spec[key] = value
        existing["spec"] = existing_spec

        updated = await custom_api.replace_cluster_custom_object(
            group=GROUP,
            version=VERSION,
            plural=PLURAL,
            name=SINGLETON_NAME,
            body=existing,
        )
        return _to_response(updated)


@router.delete("", status_code=204)
@handle_k8s_errors(operation="delete", resource_type="arkconfig")
async def delete_arkconfig(impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config)) -> None:
    """Delete the singleton ArkConfig, restoring hardcoded defaults."""
    async with get_impersonating_api_client(impersonation) as api_client:
        custom_api = CustomObjectsApi(api_client)
        try:
            await custom_api.delete_cluster_custom_object(
                group=GROUP,
                version=VERSION,
                plural=PLURAL,
                name=SINGLETON_NAME,
            )
        except ApiException as e:
            if e.status == 404:
                return None
            raise
    return None
