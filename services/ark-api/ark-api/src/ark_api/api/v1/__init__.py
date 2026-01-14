"""API v1 routes."""
from fastapi import APIRouter

from .namespaces import router as namespaces_router
from .secrets import router as secrets_router
from .agents import router as agents_router
from .models import router as models_router
from .teams import router as teams_router
from .queries import router as queries_router
from .tools import router as tools_router
from .mcp_servers import router as mcp_servers_router
from .a2a_servers import router as a2a_servers_router
from .proxy import proxy_router
from .memories import router as memories_router, memory_messages_router
from .conversations import router as conversations_router
from .system_info import router as system_info_router
from .ark_services import router as ark_services_router
from .events import router as events_router
from .evaluations import router as evaluations_router
from .evaluators import router as evaluators_router
from .api_keys import router as api_keys_router
from .a2a_tasks import router as a2a_tasks_router
from .resources import router as resources_router
from .broker import router as broker_router
from .proxy import proxy_router

router = APIRouter(prefix="/v1", tags=["v1"])

# Include all v1 routers
router.include_router(namespaces_router)
router.include_router(secrets_router)
router.include_router(agents_router)
router.include_router(models_router)
router.include_router(teams_router)
router.include_router(queries_router)
router.include_router(tools_router)
router.include_router(mcp_servers_router)
router.include_router(a2a_servers_router)
router.include_router(proxy_router)
router.include_router(a2a_tasks_router)
router.include_router(memories_router)
router.include_router(memory_messages_router)
router.include_router(conversations_router)
router.include_router(system_info_router)
router.include_router(ark_services_router)
router.include_router(events_router)
router.include_router(evaluations_router)
router.include_router(evaluators_router)
router.include_router(api_keys_router)
router.include_router(resources_router)
router.include_router(broker_router)
router.include_router(proxy_router)
