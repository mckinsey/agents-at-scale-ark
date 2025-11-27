"""API routes for Ark Event Manager."""

from fastapi import APIRouter

from .events import router as events_router
from .memory import router as memory_router
from .stream import router as stream_router

router = APIRouter()

router.include_router(events_router, prefix="/events", tags=["events"])
router.include_router(memory_router, prefix="/messages", tags=["memory"])
router.include_router(stream_router, prefix="/stream", tags=["stream"])



