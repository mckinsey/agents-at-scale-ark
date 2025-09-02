"""ARK services API endpoints."""
import logging
from typing import Optional, List, Dict, Any
from dataclasses import dataclass

from fastapi import APIRouter, Query, HTTPException
from kubernetes_asyncio import client
from kubernetes_asyncio.client.api_client import ApiClient
from kubernetes_asyncio.client.rest import ApiException

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

router = APIRouter(prefix="/namespaces/{namespace}/ark-services", tags=["ark-services"])


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


async def get_gateway_port_for_route(custom_api: client.CustomObjectsApi, route_spec: Dict[str, Any], gateways: Dict[str, Gateway]) -> Optional[int]:
    """Get the port for a route from its parent gateway.
    
    Returns None if the gateway doesn't exist (route should be skipped).
    Raises an error if the route configuration is invalid.
    """
    parent_refs = route_spec.get("parentRefs", [])
    if not parent_refs:
        raise ValueError("HTTPRoute missing required parentRefs")
    
    gateway_name = parent_refs[0].get("name")
    gateway_namespace = parent_refs[0].get("namespace")
    if not gateway_name or not gateway_namespace:
        raise ValueError("HTTPRoute parentRef missing gateway name or namespace")
    
    cache_key = f"{gateway_namespace}/{gateway_name}"
    if cache_key not in gateways:
        try:
            gateways[cache_key] = await get_gateway(custom_api, gateway_name, gateway_namespace)
        except ApiException as e:
            if e.status == 404:
                # Gateway doesn't exist yet - this is valid if the user has installed services with routes but not installed a gateway
                return None
            raise  # Other errors should bubble up
    
    return gateways[cache_key].port


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
        
        # Cache gateways for this API call only
        gateways: Dict[str, Gateway] = {}
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
                
                # Get port from referenced gateway
                port = await get_gateway_port_for_route(custom_api, spec, gateways)
                
                # Skip route if gateway doesn't exist - this is valid if user installed services before gateway
                if port is None:
                    continue
                
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
    namespace: str,
    list_all_services: Optional[bool] = Query(False, description="List all Helm releases, not just ARK services")
) -> ArkServiceListResponse:
    """
    List ARK services (Helm releases) in a namespace.
    
    Args:
        namespace: The namespace to list ARK services from
        list_all_services: List all Helm releases instead of just ARK services (default: False)
        
    Returns:
        ArkServiceListResponse: List of ARK services in the namespace
    """
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
    namespace: str,
    service_name: str
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


