"""A2A Gateway routes for agent-to-agent communication."""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Request

from ark_sdk.impersonation import ImpersonationConfig
from ark_sdk.k8s import get_namespace

from ...auth.dependencies import get_impersonation_config
from .a2agw.manager import DynamicManager
from .a2agw.registry import AgentRegistry, external_forwarded_base_from_headers

logger = logging.getLogger(__name__)

router = APIRouter(tags=["a2a-gateway"])

# Create a singleton DynamicManager instance
_a2a_manager = None


def get_a2a_manager() -> DynamicManager:
    """Get or create the A2A DynamicManager instance."""
    global _a2a_manager
    if _a2a_manager is None:
        _a2a_manager = DynamicManager()
    return _a2a_manager


@router.get("/agents", response_model=list[dict])
async def list_agents(
    request: Request,
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
):
    """List all available agents for A2A communication."""
    # Prefix the agent-card link with the request's external base URL when a
    # forwarding gateway is path-routing this deployment; otherwise fall back to
    # the root-relative path (single-tenant / root hosting).
    headers = {key.lower(): value for key, value in request.headers.items()}
    forwarded_base = external_forwarded_base_from_headers(headers)
    # This listing is RBAC-filtered per user. DynamicManager's routing table is
    # deliberately not: it is a process-wide cache shared by every user, so it
    # syncs as the service account and may route agents a given user cannot list.
    agents = await AgentRegistry(get_namespace(), impersonation).list_agents()
    return [
        {
            "name": agent.name,
            "description": agent.description,
            "capabilities": [skill.name for skill in agent.skills],
            "host": "localhost",
            "agent-card": f"{forwarded_base}/a2a/agent/{agent.name}/.well-known/agent.json",
            "created_at": datetime.utcnow().isoformat(),
            "metadata": {"type": "analytical", "version": agent.version},
        }
        for agent in agents
    ]

