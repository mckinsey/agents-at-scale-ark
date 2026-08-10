"""Ark configuration API endpoints, backed by Kubernetes ConfigMaps."""
import logging
from fastapi import APIRouter, Query, Depends
from typing import Optional
from ark_sdk.client import with_ark_client
from ark_sdk.k8s import ConfigurationClient
from ark_sdk.impersonation import ImpersonationConfig
from ark_sdk.models.kubernetes import (
    ConfigurationCreateRequest,
    ConfigurationUpdateRequest,
    ConfigurationResponse,
    ConfigurationListResponse,
    ConfigurationReference,
    ConfigurationReferenceListResponse
)
from .exceptions import handle_k8s_errors
from ...auth.dependencies import get_impersonation_config
from ...services.configuration_references import (
    REFERRING_RESOURCES,
    find_config_map_references
)

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/configurations", tags=["configurations"])

VERSION = "v1alpha1"

@router.get("", response_model=ConfigurationListResponse)
@handle_k8s_errors(operation="list", resource_type="configuration")
async def list_configurations(namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)"), impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config)) -> ConfigurationListResponse:
    """List all configurations in namespace using ark-sdk."""
    client = ConfigurationClient(namespace=namespace, impersonation=impersonation)
    result = await client.list_configurations()
    return ConfigurationListResponse(**result)

@router.post("", response_model=ConfigurationResponse)
@handle_k8s_errors(operation="create", resource_type="configuration")
async def create_configuration(body: ConfigurationCreateRequest, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)"), impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config)) -> ConfigurationResponse:
    """Create a new configuration using ark-sdk."""
    client = ConfigurationClient(namespace=namespace, impersonation=impersonation)
    result = await client.create_configuration(
        name=body.name,
        value=body.value,
        description=body.description,
        alias=body.alias,
        labels=body.labels
    )
    return ConfigurationResponse(**result)

@router.get("/{configuration_name}", response_model=ConfigurationResponse)
@handle_k8s_errors(operation="get", resource_type="configuration")
async def get_configuration(configuration_name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)"), impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config)) -> ConfigurationResponse:
    """Get a specific configuration using ark-sdk."""
    client = ConfigurationClient(namespace=namespace, impersonation=impersonation)
    result = await client.get_configuration(configuration_name)
    return ConfigurationResponse(**result)

@router.put("/{configuration_name}", response_model=ConfigurationResponse)
@handle_k8s_errors(operation="update", resource_type="configuration")
async def update_configuration(configuration_name: str, body: ConfigurationUpdateRequest, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)"), impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config)) -> ConfigurationResponse:
    """Update a configuration using ark-sdk."""
    client = ConfigurationClient(namespace=namespace, impersonation=impersonation)
    result = await client.update_configuration(
        configuration_name,
        value=body.value,
        description=body.description,
        alias=body.alias,
        labels=body.labels
    )
    return ConfigurationResponse(**result)

@router.delete("/{configuration_name}")
@handle_k8s_errors(operation="delete", resource_type="configuration")
async def delete_configuration(configuration_name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)"), impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config)):
    """Delete a configuration using ark-sdk."""
    client = ConfigurationClient(namespace=namespace, impersonation=impersonation)
    await client.delete_configuration(configuration_name)
    return {"message": "Configuration deleted successfully"}

@router.get("/{configuration_name}/references", response_model=ConfigurationReferenceListResponse)
@handle_k8s_errors(operation="list references for", resource_type="configuration")
async def list_configuration_references(configuration_name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)"), impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config)) -> ConfigurationReferenceListResponse:
    """List the Ark resources that read this configuration."""
    client = ConfigurationClient(namespace=namespace, impersonation=impersonation)
    await client.get_configuration(configuration_name)

    references = []
    async with with_ark_client(namespace, VERSION, impersonation=impersonation) as ark_client:
        for kind, attribute in REFERRING_RESOURCES:
            for resource in await getattr(ark_client, attribute).a_list():
                resource_dict = resource.to_dict()
                spec = resource_dict.get("spec") or {}
                for field in find_config_map_references(spec, configuration_name):
                    references.append(ConfigurationReference(
                        kind=kind,
                        name=resource_dict.get("metadata", {}).get("name"),
                        field=field
                    ))

    return ConfigurationReferenceListResponse(items=references, count=len(references))
