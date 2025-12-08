"""API routes for ark-sessions."""

from fastapi import APIRouter

from ark_sessions.api.messages import router as messages_router
from ark_sessions.api.otlp import router as otlp_router
from ark_sessions.api.sessions import router as sessions_router

router = APIRouter()

# Include all route modules
router.include_router(otlp_router, tags=["telemetry"])
router.include_router(messages_router, tags=["memory"])
router.include_router(sessions_router, tags=["sessions"])

__all__ = ["router"]

