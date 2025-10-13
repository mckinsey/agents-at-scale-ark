"""ARK services API endpoints."""
import logging
from typing import Optional, List
from dataclasses import dataclass

from fastapi import APIRouter, Query, HTTPException
from kubernetes_asyncio import client
from kubernetes_asyncio.client.api_client import ApiClient
from kubernetes_asyncio.client.rest import ApiException
from ark_sdk.k8s import get_context

from ...models.ark_services import (
    ArkService,
    ArkServiceListResponse,
    HTTPRouteInfo
)
from ...utils.ark_services import (
    get_helm_releases,
    get_chart_annotations,
    get_chart_description
)
from ...constants.annotations import (
    SERVICE_ANNOTATION,
    RESOURCES_ANNOTATION,
    LOCALHOST_GATEWAY_PORT_ANNOTATION
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ark-services", tags=["ark-services"])


@dataclass
class Gateway:
    """Gateway information including port."""
    name: str
    namespace: str
    port: int



async def get_gateway(custom_api: client.CustomObjectsApi, gateway_name: str, gateway_namespace: str) -> Gateway:
    """Get gateway object including port from annotation."""
    gateway = await custom_api.get_namespaced_custom_object(
        group="gateway.networking.k8s.io",
        version="v1",
        namespace=gateway_namespace,
        plural="gateways",
        name=gateway_name
    )
    
    annotations = gateway.get("metadata", {}).get("annotations", {})
    port_str = annotations.get(LOCALHOST_GATEWAY_PORT_ANNOTATION)
    
    port = 80  # Default port
    if port_str:
        try:
            port = int(port_str)
        except ValueError as e:
            raise ValueError(f"Invalid port value in gateway {gateway_name}: {port_str}") from e
    
    return Gateway(name=gateway_name, namespace=gateway_namespace, port=port)


async def get_port_for_gateway(gateway_name: str) -> int:
    """Get the port for a gateway based on its name.

    We use a hardcoded port for localhost-gateway because the ark-api
    service account cannot read the localhost-gateway resource in ark-system namespace.

    For localhost-gateway, use port 8080.
    For other gateways, use default port 80.
    """
    if gateway_name == "localhost-gateway":
        return 8080
    return 80


async def get_httproutes_for_ark_service(namespace: str, release_name: str) -> List[HTTPRouteInfo]:
    """Find HTTPRoutes that have Helm release annotations matching the release name."""
    async with ApiClient() as api_client:
        custom_api = client.CustomObjectsApi(api_client)
        
        # List HTTPRoutes in the namespace
        try:
            routes = await custom_api.list_namespaced_custom_object(
                group="gateway.networking.k8s.io",
                version="v1",
                namespace=namespace,
                plural="httproutes"
            )
        except ApiException as e:
            if e.status == 404:
                # Gateway API not installed or HTTPRoutes CRD not found - expected case
                return []
            raise  # Unexpected error (permissions, connection, etc.)
        
        service_routes = []
        
        for route in routes.get("items", []):
            metadata = route.get("metadata", {})
            spec = route.get("spec", {})
            annotations = metadata.get("annotations", {})
            
            # Check if this route has Helm release annotation matching our release name
            helm_release_name = annotations.get("meta.helm.sh/release-name")
            if helm_release_name == release_name:
                rules = spec.get("rules", [])
                hostnames = spec.get("hostnames", [])

                # Get gateway name from parent refs
                parent_refs = spec.get("parentRefs", [])
                gateway_name = parent_refs[0].get("name") if parent_refs else None

                # Get port based on gateway name
                port = await get_port_for_gateway(gateway_name) if gateway_name else 80

                # Create one route entry per hostname
                for hostname in hostnames:
                    url = f"http://{hostname}:{port}" if port != 80 else f"http://{hostname}"
                    service_routes.append(HTTPRouteInfo(
                        name=metadata.get("name", ""),
                        namespace=metadata.get("namespace", ""),
                        url=url,
                        rules=len(rules)
                    ))
        
        return service_routes




@router.get("", response_model=ArkServiceListResponse)
async def list_ark_services(
    list_all_services: Optional[bool] = Query(False, description="List all Helm releases, not just ARK services"),
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")
) -> ArkServiceListResponse:
    """
    List ARK services (Helm releases) in a namespace.

    Args:
        namespace: The namespace to list ARK services from
        list_all_services: List all Helm releases instead of just ARK services (default: False)

    Returns:
        ArkServiceListResponse: List of ARK services in the namespace
    """
    if namespace is None:
        namespace = get_context()["namespace"]

    helm_releases = await get_helm_releases(namespace)
    ark_services = []
    
    for release in helm_releases:
        release_name = release.get("name", "")
        
        # Get chart annotations to check for ARK service annotation
        annotations = get_chart_annotations(release)
        ark_service_annotation = annotations.get(SERVICE_ANNOTATION)
        
        # Get resource types
        resources_annotation = annotations.get(RESOURCES_ANNOTATION, "")
        resources = [r.strip() for r in resources_annotation.split(",") if r.strip()] if resources_annotation else []
        
        # Get the standard chart description
        chart_description = get_chart_description(release)
        
        # By default, only show ARK services (unless list_all_services=true)
        if not list_all_services and not ark_service_annotation:
            continue
        
        # Get HTTPRoutes for this ARK service using release name
        httproutes = await get_httproutes_for_ark_service(namespace, release_name)
        
        ark_service = ArkService(
            name=release_name,
            namespace=namespace,
            chart=release.get("chart", ""),
            chart_version=release.get("chart_version", ""),
            app_version=release.get("app_version", ""),
            status=release.get("status", ""),
            revision=release.get("revision", 0),
            updated=release.get("updated", ""),
            ark_service_type=ark_service_annotation,
            description=chart_description,
            ark_resources=resources,
            httproutes=httproutes
        )
        ark_services.append(ark_service)
    
    return ArkServiceListResponse(
        items=ark_services,
        count=len(ark_services)
    )


@router.get("/{service_name}", response_model=ArkService)
async def get_ark_service(
    service_name: str,
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")
) -> ArkService:
    """
    Get a specific ARK service (Helm release) by name.
    
    Args:
        namespace: The namespace to get the ARK service from
        service_name: The name of the ARK service (Helm release)
        
    Returns:
        ArkService: The ARK service details
    """
    # Reuse the existing logic by getting all services and filtering
    services_response = await list_ark_services(namespace, list_all_services=True)
    
    # Find the service by name
    for service in services_response.items:
        if service.name == service_name:
            return service
    
    # Service not found
    raise HTTPException(status_code=404, detail=f"ARK service '{service_name}' not found in namespace '{namespace}'")


