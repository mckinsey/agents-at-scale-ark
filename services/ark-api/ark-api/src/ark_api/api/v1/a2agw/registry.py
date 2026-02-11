import functools
import json
import logging
import os

from a2a.types import AgentCapabilities, AgentCard, AgentSkill
from ark_sdk.client import V1_ALPHA1, with_ark_client
from ark_sdk.k8s import get_namespace

from ark_api.constants.annotations import (
    A2A_SERVER_SKILLS_ANNOTATION,
    A2A_STREAMING_SUPPORTED_ANNOTATION,
)

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

def _parse_bool_annotation(value: object, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes"}:
            return True
        if normalized in {"false", "0", "no"}:
            return False
    return default

def ark_to_agent_card(ark_agent) -> AgentCard:
    metadata = ark_agent.metadata
    annotations = metadata.get('annotations') or {}
    if not isinstance(annotations, dict):
        annotations = {}
    spec = ark_agent.spec
    
    # Create capabilities object
    streaming_supported = _parse_bool_annotation(
        annotations.get(A2A_STREAMING_SUPPORTED_ANNOTATION),
        True,
    )
    capabilities = AgentCapabilities(
        streaming=streaming_supported, pushNotifications=False, stateTransitionHistory=False
    )
    
    skills_list = []
    skills_data = annotations.get(A2A_SERVER_SKILLS_ANNOTATION)
    parsed_skills = []
    if isinstance(skills_data, str) and skills_data:
        try:
            parsed = json.loads(skills_data)
            if isinstance(parsed, list):
                parsed_skills = parsed
        except json.JSONDecodeError:
            logger.warning(f"Unable to parse skills annotation for agent {metadata['name']}")
    elif isinstance(skills_data, list):
        parsed_skills = skills_data

    for idx, skill_dict in enumerate(parsed_skills):
        if isinstance(skill_dict, dict):
            skill_payload = dict(skill_dict)
            skill_payload['id'] = skill_payload.get('id') or f"{metadata['name']}-skill-{idx}"
            skill_payload['name'] = skill_payload.get('name') or f"skill-{idx + 1}"
            skill_payload['description'] = skill_payload.get('description') or "No description"
            raw_tags = skill_payload.get('tags')
            if isinstance(raw_tags, list):
                skill_payload['tags'] = [tag for tag in raw_tags if isinstance(tag, str)]
            else:
                skill_payload['tags'] = []
            try:
                skills_list.append(AgentSkill(**skill_payload))
            except Exception:
                logger.warning(f"Unable to recover skill from annotation: {skill_dict}")
        else:
            logger.warning(f"Unable to recover skill from annotation: {skill_dict}")

    if not skills_list:
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
        defaultInputModes=["text/plain", "application/json"],
        defaultOutputModes=["text/plain", "application/json"],
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
