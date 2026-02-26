import functools
import json
import logging
import os

from a2a.types import AgentCapabilities, AgentCard, AgentSkill
from ark_sdk.client import V1_ALPHA1, with_ark_client
from ark_sdk.k8s import get_namespace

from ark_api.constants.annotations import (
    A2A_EXPERIMENTAL_ENABLED_ANNOTATION,
    A2A_SERVER_SKILLS_ANNOTATION,
    A2A_STREAMING_SUPPORTED_ANNOTATION,
    parse_bool_annotation,
)

logger = logging.getLogger(__name__)

A2A_STRUCTURED_DELEGATION_CAPABILITY_URI = "https://ark.mckinsey.com/extensions/structured-delegation/v1"
A2A_STRUCTURED_DELEGATION_SKILL_NAME = "structured-delegation"

@functools.lru_cache(maxsize=1)
def _get_agent_card_url_components():
    port = os.getenv('ARK_A2A_AGENT_CARD_PORT', os.getenv('PORT', '8000'))
    host = os.getenv('ARK_A2A_AGENT_CARD_HOST', 'localhost')
    scheme = os.getenv('ARK_A2A_AGENT_CARD_PROTOCOL', 'http')
    path = os.getenv('ARK_A2A_AGENT_CARD_PATH', '')
    logger.info(f"Agent cards will advertise URL: {scheme}://{host}:{port}{path}")
    return scheme, host, port, path

def get_external(agent_name):
    scheme, host, port, path = _get_agent_card_url_components()
    return f"{scheme}://{host}:{port}{path}/a2a/agent/{agent_name}/"

def _safe_metadata(ark_agent) -> dict:
    metadata = getattr(ark_agent, "metadata", None)
    if isinstance(metadata, dict):
        return metadata
    if hasattr(metadata, "__dict__"):
        return metadata.__dict__
    if metadata is not None:
        try:
            return dict(metadata)
        except (TypeError, ValueError):
            pass
    return {}


def _supports_structured_delegation(annotations: dict) -> bool:
    return parse_bool_annotation(annotations.get(A2A_EXPERIMENTAL_ENABLED_ANNOTATION), False)


def _has_structured_delegation_signal(skills: list[AgentSkill]) -> bool:
    for skill in skills:
        if getattr(skill, "name", None) == A2A_STRUCTURED_DELEGATION_SKILL_NAME:
            return True
        if getattr(skill, "id", None) == A2A_STRUCTURED_DELEGATION_CAPABILITY_URI:
            return True
        raw_tags = getattr(skill, "tags", None)
        if isinstance(raw_tags, list) and A2A_STRUCTURED_DELEGATION_CAPABILITY_URI in raw_tags:
            return True
    return False

def ark_to_agent_card(ark_agent) -> AgentCard:
    metadata = _safe_metadata(ark_agent)
    annotations = metadata.get('annotations') or {}
    if not isinstance(annotations, dict):
        annotations = {}
    spec = getattr(ark_agent, "spec", None) or ark_agent
    agent_name = metadata.get("name", "")

    streaming_supported = parse_bool_annotation(
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
            logger.warning("Unable to parse skills annotation for agent %s", agent_name)
    elif isinstance(skills_data, list):
        parsed_skills = skills_data

    for idx, skill_dict in enumerate(parsed_skills):
        if isinstance(skill_dict, dict):
            skill_payload = dict(skill_dict)
            skill_payload['id'] = skill_payload.get('id') or f"{agent_name}-skill-{idx}"
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
                logger.warning("Unable to recover skill from annotation: %s", skill_dict)
        else:
            logger.warning("Unable to recover skill from annotation: %s", skill_dict)

    if not skills_list:
        skills_list.append(
            AgentSkill(
                id=f"{agent_name}-default-skill",
                name="General",
                description="General agent capabilities",
                tags=["general"],
            )
        )

    if _supports_structured_delegation(annotations) and not _has_structured_delegation_signal(skills_list):
        skills_list.append(
            AgentSkill(
                id=A2A_STRUCTURED_DELEGATION_CAPABILITY_URI,
                name=A2A_STRUCTURED_DELEGATION_SKILL_NAME,
                description="Supports structured delegation payloads: message, history, contextId, and input fallback.",
                tags=[A2A_STRUCTURED_DELEGATION_CAPABILITY_URI],
            )
        )

    description = getattr(spec, "description", None) or "No description"

    return AgentCard(
        name=agent_name,
        description=description,
        capabilities=capabilities,
        skills=skills_list,
        url=get_external(agent_name),
        version="1.0.0",
        defaultInputModes=["text/plain", "application/json"],
        defaultOutputModes=["text/plain", "application/json"],
    )


class AgentRegistry:
    def __init__(self, namespace: str):
        self._namespace = namespace

    async def get_agent(self, name: str) -> AgentCard | None:
        try:
            async with with_ark_client(self._namespace, V1_ALPHA1) as ark_client:
                agent = await ark_client.agents.a_get(name)
                return ark_to_agent_card(agent)
        except Exception:
            logger.debug("Agent %s not found or inaccessible", name)
            return None

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
