import importlib.metadata

from fastapi import APIRouter
from kubernetes_asyncio import client
from ark_sdk.k8s import create_api_client

from ark_api.models.system_info import SystemInfo
from .exceptions import handle_k8s_errors


router = APIRouter()


@router.get("/system-info", response_model=SystemInfo)
@handle_k8s_errors(operation="get", resource_type="system info")
async def get_system_info() -> SystemInfo:
    async with create_api_client() as api_client:
        v1 = client.VersionApi(api_client)
        version_info = await v1.get_code()
        
        try:
            ark_api_version = importlib.metadata.version("ark-api")
        except importlib.metadata.PackageNotFoundError:
            ark_api_version = "unknown"
        
        return SystemInfo(
            kubernetes_version=version_info.git_version,
            system_version=f"v{ark_api_version}" # the k8s version has a leading v, add here for consistency
        )