"""Proxy endpoint for forwarding requests to other services in the cluster."""
import logging
import httpx
from fastapi import APIRouter, Request, Response, HTTPException
from typing import Any

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/proxy", tags=["proxy"])


async def _proxy_request_impl(
    service_name: str,
    api_path: str,
    request: Request,
) -> Response:
    """
    Internal implementation for proxying requests to other services in the cluster.

    Args:
        service_name: Name of the Kubernetes service to proxy to
        api_path: API path to forward to the service
        request: FastAPI request object

    Returns:
        Response from the target service

    Raises:
        HTTPException: If the request to the target service fails
    """
    target_url = f"http://{service_name}/{api_path}"

    query_params = dict(request.query_params)
    if query_params:
        target_url += "?" + "&".join(f"{k}={v}" for k, v in query_params.items())

    logger.info(f"Proxying {request.method} request to {target_url}")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.request(
                method=request.method,
                url=target_url,
                headers=dict(request.headers),
                content=await request.body(),
                params=query_params,
            )

            filtered_headers = {
                k: v for k, v in response.headers.items()
                if k.lower() not in ["transfer-encoding"]
            }

            return Response(
                content=response.content,
                status_code=response.status_code,
                headers=filtered_headers,
            )
    except httpx.RequestError as e:
        logger.error(f"Error proxying request to {target_url}: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to proxy request to {service_name}: {str(e)}"
        )


@router.get("/{service_name}/{api_path:path}")
async def proxy_request_get(
    service_name: str,
    api_path: str,
    request: Request,
) -> Response:
    """Proxy GET requests to other services in the cluster."""
    return await _proxy_request_impl(service_name, api_path, request)


@router.post("/{service_name}/{api_path:path}")
async def proxy_request_post(
    service_name: str,
    api_path: str,
    request: Request,
) -> Response:
    """Proxy POST requests to other services in the cluster."""
    return await _proxy_request_impl(service_name, api_path, request)


@router.put("/{service_name}/{api_path:path}")
async def proxy_request_put(
    service_name: str,
    api_path: str,
    request: Request,
) -> Response:
    """Proxy PUT requests to other services in the cluster."""
    return await _proxy_request_impl(service_name, api_path, request)


@router.delete("/{service_name}/{api_path:path}")
async def proxy_request_delete(
    service_name: str,
    api_path: str,
    request: Request,
) -> Response:
    """Proxy DELETE requests to other services in the cluster."""
    return await _proxy_request_impl(service_name, api_path, request)


@router.patch("/{service_name}/{api_path:path}")
async def proxy_request_patch(
    service_name: str,
    api_path: str,
    request: Request,
) -> Response:
    """Proxy PATCH requests to other services in the cluster."""
    return await _proxy_request_impl(service_name, api_path, request)


@router.head("/{service_name}/{api_path:path}")
async def proxy_request_head(
    service_name: str,
    api_path: str,
    request: Request,
) -> Response:
    """Proxy HEAD requests to other services in the cluster."""
    return await _proxy_request_impl(service_name, api_path, request)


@router.options("/{service_name}/{api_path:path}")
async def proxy_request_options(
    service_name: str,
    api_path: str,
    request: Request,
) -> Response:
    """Proxy OPTIONS requests to other services in the cluster."""
    return await _proxy_request_impl(service_name, api_path, request)
