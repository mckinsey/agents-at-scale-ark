"""Health check endpoints."""
import logging

from fastapi import APIRouter
from kubernetes_asyncio import client
from ark_sdk.k8s import create_api_client

from ..models.health import HealthResponse, ReadinessResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """
    This endpoint always returns a healthy status if the service is running.

    Returns: HealthResponse: Basic health status of the service
    """
    return HealthResponse(status="healthy", service="ark-api")


@router.get("/ready", response_model=ReadinessResponse)
async def readiness_check() -> ReadinessResponse:
    """
    Verifies that the ARK API service is ready to handle requests by testing
    connectivity to the Kubernetes API.

    Returns: ReadinessResponse: Readiness status with Kubernetes connectivity check
    """
    try:
        async with create_api_client() as api:
            v1 = client.VersionApi(api)
            await v1.get_code()
        return ReadinessResponse(status="ready", service="ark-api")
    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        return ReadinessResponse(status="not ready", service="ark-api", error="An internal error occurred during readiness check.")
