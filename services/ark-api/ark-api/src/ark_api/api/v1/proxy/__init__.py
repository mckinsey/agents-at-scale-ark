from .proxy import router as proxy_router
# Re-export names used by tests and external patching
from .proxy import get_context, ApiClient, client  # noqa: F401