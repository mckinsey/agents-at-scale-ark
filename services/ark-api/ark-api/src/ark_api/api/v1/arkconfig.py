"""API routes for the singleton ArkConfig resource."""
import logging
from typing import Optional

from fastapi import APIRouter, Depends
from kubernetes_asyncio.client import CustomObjectsApi
from kubernetes_asyncio.client.rest import ApiException
from ark_sdk.impersonation import ImpersonationConfig

from ...auth.dependencies import get_impersonation_config
from ...models.arkconfig import ArkConfigResponse, ArkConfigUpdateRequest
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
    return ArkConfigResponse(
        queryTTL=spec.get("queryTTL"),
        exists=True,
    )


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
    """Create or update the singleton ArkConfig with the supplied defaults."""
    spec: dict = {}
    if body.queryTTL is not None and body.queryTTL != "":
        spec["queryTTL"] = body.queryTTL

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
        if "queryTTL" in spec:
            existing_spec["queryTTL"] = spec["queryTTL"]
        else:
            existing_spec.pop("queryTTL", None)
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
