"""A2A Gateway routes for agent-to-agent communication."""
import logging
from datetime import UTC, datetime

from fastapi import APIRouter

from .a2agw.manager import DynamicManager
from .a2agw.registry import get_registry

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


def _agent_capability_uris(agent) -> list[str]:
    capability_uris = set()
    for skill in agent.skills:
        if isinstance(getattr(skill, "name", None), str) and skill.name.startswith("https://"):
            capability_uris.add(skill.name)
        tags = getattr(skill, "tags", None) or []
        if isinstance(tags, list):
            for tag in tags:
                if isinstance(tag, str) and tag.startswith("https://"):
                    capability_uris.add(tag)
    return sorted(capability_uris)


@router.get("/agents", response_model=list[dict])
async def list_agents():
    """List all available agents for A2A communication."""
    agents = await get_registry().list_agents()
    return [
        {
            "name": agent.name,
            "description": agent.description,
            "capabilities": [skill.name for skill in agent.skills],
            "capabilityUris": _agent_capability_uris(agent),
            "host": "localhost",
            "agent-card": f"/a2a/agent/{agent.name}/.well-known/agent-card.json",
            "agent-card-legacy": f"/a2a/agent/{agent.name}/.well-known/agent.json",
            "created_at": datetime.now(UTC).isoformat(),
            "metadata": {"type": "analytical", "version": agent.version},
        }
        for agent in agents
    ]

