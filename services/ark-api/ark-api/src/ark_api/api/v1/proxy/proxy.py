"""A2A Proxy routes for making agent to agent comunication accesible from outside """
import logging
import os
from multiprocessing import get_context
from token import OP
from ark_api.utils.ark_services import get_headers
from ark_sdk.k8s import get_context
from ark_sdk.client import with_ark_client
from datetime import datetime
from kubernetes_asyncio import client
from kubernetes_asyncio.client.api_client import ApiClient
from posix import preadv
from typing import Optional
import httpx
import resource

from fastapi import APIRouter, Query, Request, Response, HTTPException

from ..exceptions import handle_k8s_errors
from ....models.models import ServiceListResponse
from .proxy_resources import Resource

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/proxy", tags=["proxy"])

PROXY_TIMEOUT = float(os.getenv('PROXY_TIMEOUT', '10.0'))

# CRD configuration
VERSION_A2A = "v1prealpha1"
VERSION_MCP = "v1alpha1"
VERSION = "v1"

async def _get_a2a_server_address(a2a_server_name: str, 
    namespace: Optional[str] = None) -> tuple[str, dict]:
    """Collect A2A Server details from ark resources. If A2A Server requires 
        particular headers, they will be collected and provided back.
    Args:
        a2a_server_name: name of A2A Server inside ark
        namespace: name of namespace where A2A server resource is located in. 
            If no namespace is provided, default will be used

    Returns:
        (mcp_endpoint, headers_required_by_mcp)
    """
    try:
        async with with_ark_client(namespace, VERSION_A2A) as ark_client:
            a2a_server = await ark_client.a2aservers.a_get(a2a_server_name)
            a2a_dict = a2a_server.to_dict()
            status = a2a_dict.get("status", {})
            resolved_address = status.get("lastResolvedAddress")
            spec = a2a_dict.get("spec", {})
            headers = {}
            await get_headers(spec, headers, namespace)
            if not resolved_address:
                raise HTTPException(
                    status_code=500,
                    detail=f"A2A server '{a2a_server_name}' has no resolved address"
                )

            return resolved_address, headers
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        logger.error(f"Failed to resolve A2A server '{a2a_server_name}': {e}")
        raise HTTPException(status_code=400, detail=f"Invalid resource a2a {a2a_server_name}")
    
async def _get_mcp_server_address(mcp_server_name: str, 
    namespace: Optional[str] = None) -> tuple[str, dict]:
    """Collect MCP Resource details from ark resources. If MCP Server requires 
        particular headers, they will be collected and provided back.
    Args:
        mcp_server_name: name of MCP Server inside ark
        namespace: name of namespace where MCP server resource is located in. 
            If no namespace is provided, default will be used

    Returns:
        (mcp_endpoint, headers_required_by_mcp)
    """
    try:
        async with with_ark_client(namespace, VERSION_MCP) as ark_client:
            mcp_server = await ark_client.mcpservers.a_get(mcp_server_name)
            mcp_dict = mcp_server.to_dict()
            status = mcp_dict.get("status", {})
            resolved_address = status.get("resolvedAddress")
            spec = mcp_dict.get("spec", {})
            headers = {}
            await get_headers(spec, headers, namespace)

            if not resolved_address:
                raise HTTPException(
                    status_code=500,
                    detail=f"MCP server '{mcp_server_name}' has no resolved address"
                )
            return resolved_address, headers
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        logger.error(f"Failed to resolve MCP server '{mcp_server_name}': {e}")
        raise HTTPException(status_code=400, detail=f"Invalid resource mcp {mcp_server_name}")

async def _proxy_request(
    target_url: str,
    request: Request,
    headers_to_forward: Optional[dict] = None
) -> Response:
    """Proxy an HTTP request to a target URL and provide back the response.
    
    Args:
        target_url: endpoint where the request will be forwarded to 
        request: the whole request to forward
        headers_to_forward: dictionary of headers to add at the request's headers before forwarding it

    Returns:
        Response: Proxied response from the target endpoing
    """
    # Prepare headers to forward (exclude hop-by-hop headers)
    headers = {}
    req_ignore_headers = ["host", "content-length", "authorization"]
    hop_by_hop_headers = [
        "connection", "keep-alive", "proxy-authenticate",
        "proxy-authorization", "te", "trailers", "transfer-encoding", "upgrade"   
    ]
    
    
    for header_name, header_value in request.headers.items():
        header_lower = header_name.lower()
        if header_lower not in hop_by_hop_headers and header_lower not in req_ignore_headers:
            headers[header_name] = header_value
    
    # Add any additional headers from server spec (e.g., auth headers)
    if headers_to_forward:
        headers.update(headers_to_forward)
    
    # Read request body if present
    body = await request.body()
    timeout = httpx.Timeout(
        timeout=PROXY_TIMEOUT,
        read=None,
        write=None,
    )
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            response = await client.request(
                method=request.method,
                url=target_url,
                headers=headers,
                content=body if body else None,
                params=dict(request.query_params) if request.query_params else None
            )
            return Response(
                content=response.content,
                status_code=response.status_code,
                headers={
                    key: value for key, value in response.headers.items()
                    if key.lower() not in hop_by_hop_headers
                },
                media_type=response.headers.get("content-type")
            )
        except httpx.RequestError as e:
            logger.error(f"Proxy request failed: {e}")
            raise HTTPException(
                status_code=502,
                detail=f"Failed to proxy request to server: {str(e)}"
            )

@router.get("/services", response_model=ServiceListResponse)
async def list_services(
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")
) -> ServiceListResponse:
    """List services available for proxying in the current namespace."""
    if namespace is None:
        namespace = get_context()["namespace"]

    async with ApiClient() as api_client:
        v1 = client.CoreV1Api(api_client)
        services = await v1.list_namespaced_service(namespace=namespace)
        service_names = [svc.metadata.name for svc in services.items]
        return ServiceListResponse(services=service_names)

@router.options("/{resource}/{server_name}")
@router.post("/{resource}/{server_name}")
@router.get("/{resource}/{server_name}")
async def proxy_server(
    resource: Resource,
    server_name: str,
    request: Request,
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")
) -> Response:
    """
    Proxy requests to a specific resource inside your agentic cluster.
    The goal is to expose over public internet your agentic resources in
    order to perform testing of the resource itself.
    
    Args:
        server_name: Name of the agentic resource. Supported only a2a and mcp.
        path: Remaining path after the server name (will be forwarded as-is)
        request: The incoming FastAPI request
        namespace: The namespace containing the agentic resource
        
    Returns:
        Response: Proxied response from the agentic resource
    """
    # Get the A2A server's resolved address
    if resource == Resource.A2A:
        resource_url, additional_headers = await _get_a2a_server_address(server_name, namespace)
    elif resource == Resource.MCP:
        resource_url, additional_headers = await _get_mcp_server_address(server_name, namespace)
    else: 
        #resource == Resource.SERVICES
        resource_url = f"http://{server_name}"
        additional_headers = {}
    
    logger.info(f"Forwarding at {request.method} {resource_url}")
    return await _proxy_request(resource_url, request, additional_headers)
        
    
    # Construct the target path
    #target_path = f"/{path}" if path else "/"

@router.options("/{resource}/{server_name}/{path:path}")
@router.get("/{resource}/{server_name}/{path:path}")
@router.post("/{resource}/{server_name}/{path:path}")  
async def proxy_server_path(resource: Resource,
    server_name: str,
    request: Request, 
    path: str,
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")):

    if resource == Resource.A2A:
        resource_url, additional_headers = await _get_a2a_server_address(server_name, namespace)
    elif resource == Resource.MCP:
        resource_url, additional_headers = await _get_mcp_server_address(server_name, namespace)
    else:
        #resource == Resource.SERVICES:
        resource_url = f"http://{server_name}"
        additional_headers = {}
    
    resource_url = f"{resource_url}/{path}" if resource_url[-1]!= "/" \
        else f"{resource_url}{path}"
    logger.info(f"Forwarding at {request.method} {resource_url}")
    return await _proxy_request(resource_url, request, additional_headers)

@router.delete("/services/{service_name}/{api_path:path}")
@router.patch("/services/{service_name}/{api_path:path}")
@router.head("/services/{service_name}/{api_path:path}")
async def proxy_services(
    service_name: str,
    api_path: str,
    request: Request,
) -> Response:
    """Proxy DELETE, PATCH, HEAD requests to other services in the cluster."""
    resource_url = f"http://{service_name}/{api_path}"
    # Forward the request to the resolved resource URL
    return await _proxy_request(resource_url, request)