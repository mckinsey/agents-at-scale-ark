"""Main API router."""
from fastapi import APIRouter

from .v1 import router as v1_router
from .v1.openai import router as openai_router
from .v1.a2a_gateway import router as a2a_gateway_router
from .health import router as health_router

router = APIRouter()

# Include health endpoints (non-versioned)
router.include_router(health_router)

# Include A2A Gateway endpoints (at root level, not under /api/v1)
router.include_router(a2a_gateway_router)

# Include versioned routers
router.include_router(v1_router)

# Include OpenAI endpoints (at root level for correct paths)
router.include_router(openai_router)