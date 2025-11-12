import functools
import logging
import os

from a2a.types import AgentCapabilities, AgentCard, AgentSkill
from ark_sdk.client import V1_ALPHA1, with_ark_client
from ark_sdk.k8s import get_namespace

logger = logging.getLogger(__name__)

@functools.lru_cache(maxsize=1)
def _get_agent_card_url_components():
    # Use PORT env var (8000 for ark-api) as default, or ARK_A2A_AGENT_CARD_PORT if set
    port = os.getenv('ARK_A2A_AGENT_CARD_PORT', os.getenv('PORT', '8000'))
    host = os.getenv('ARK_A2A_AGENT_CARD_HOST', 'localhost')
    scheme = os.getenv('ARK_A2A_AGENT_CARD_PROTOCOL', 'http')
    path = os.getenv('ARK_A2A_AGENT_CARD_PATH', '')
    logger.info(f"Agent cards will advertise URL: {scheme}://{host}:{port}{path}")
    return scheme, host, port, path

def get_external(agent_name):
    scheme, host, port, path = _get_agent_card_url_components()
    return f"{scheme}://{host}:{port}{path}/a2a/agent/{agent_name}/"

def ark_to_agent_card(ark_agent) -> AgentCard:
    metadata = ark_agent.metadata
    annotations = metadata.get('annotations', {})
    skills = annotations.get('a2a.mckinsey.com/skill', [])
    spec = ark_agent.spec
    
    # Create capabilities object
    capabilities = AgentCapabilities(
        streaming=True, pushNotifications=False, stateTransitionHistory=False
    )
    
    # Create skills from capabilities list or annotations
    skills_list = []
    skills_data = annotations.get('a2a.mckinsey.com/skills', [])

    for idx, skill_dict in enumerate(skills_data):
        if isinstance(skill_dict, dict):
            skill_dict['id'] = skill_dict.get('id') or f"{metadata['name']}-skill-{idx}"
            skill = AgentSkill(**skill_dict)
            skills_list.append(skill)
        else:
            logger.warning(f"Unable to recover skill from annotation: {skill_dict}")
    
    # If no skills, create a default one
    if not skills:
        skills_list.append(
            AgentSkill(
                id=f"{metadata['name']}-default-skill",
                name="General",
                description="General agent capabilities",
                tags=["general"],
            )
        )
    
    return AgentCard(
        name=metadata["name"],
        description=spec.description or "No description",
        capabilities=capabilities,
        skills=skills_list,
        url=get_external(metadata['name']),
        version="1.0.0",
        defaultInputModes=["text"],
        defaultOutputModes=["text"],
    )


class AgentRegistry:
    def __init__(self, namespace: str):
        self._namespace = namespace

    async def get_agent(self, name: str) -> AgentCard | None:
        async with with_ark_client(self._namespace, V1_ALPHA1) as ark_client:
            agent = await ark_client.agents.a_get(name)
            return ark_to_agent_card(agent)

    async def list_agents(self) -> list[AgentCard]:
        async with with_ark_client(self._namespace, V1_ALPHA1) as ark_client:
            agents = await ark_client.agents.a_list()
            return [ark_to_agent_card(a) for a in agents]

    async def find_agents_by_capability(self, capability: str) -> list[AgentCard]:
        agents = await self.list_agents()
        return [agent for agent in agents if any(capability in skill.name for skill in agent.skills)]

@functools.lru_cache(maxsize=1)
def get_registry():
    return AgentRegistry(get_namespace())
