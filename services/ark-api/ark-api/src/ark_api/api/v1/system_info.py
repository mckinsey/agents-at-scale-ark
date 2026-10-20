import asyncio
import importlib.metadata

from fastapi import APIRouter
from kubernetes_asyncio import client
from ark_sdk.k8s import create_api_client

from ark_api.models.system_info import SystemInfo
from . import argo_server
from .exceptions import handle_k8s_errors


router = APIRouter()


async def _get_argo_version(argo_server_url: str):
    return await argo_server.get_argo_server_version(argo_server_url) if argo_server_url else None


@router.get("/system-info", response_model=SystemInfo)
@handle_k8s_errors(operation="get", resource_type="system info")
async def get_system_info() -> SystemInfo:
    async with create_api_client() as api_client:
        v1 = client.VersionApi(api_client)
        argo_server_url = argo_server.get_argo_server_url()

        version_info, argo_version = await asyncio.gather(
            v1.get_code(), _get_argo_version(argo_server_url)
        )

        try:
            ark_api_version = importlib.metadata.version("ark-api")
        except importlib.metadata.PackageNotFoundError:
            ark_api_version = "unknown"

        return SystemInfo(
            kubernetes_version=version_info.git_version,
            system_version=f"v{ark_api_version}", # the k8s version has a leading v, add here for consistency
            argo_server_version_supported=argo_server.is_version_supported(argo_version),
        )