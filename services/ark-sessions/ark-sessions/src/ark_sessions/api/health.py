"""Health check handlers."""

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    service: str


async def health_check() -> HealthResponse:
    """Health check endpoint."""
    return HealthResponse(status="healthy", service="ark-sessions")

