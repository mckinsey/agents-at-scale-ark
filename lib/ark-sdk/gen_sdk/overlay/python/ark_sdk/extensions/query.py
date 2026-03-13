"""Ark Query Extension (v1) — extract and resolve QueryRef from A2A messages.

Extension spec: ark/api/extensions/query/v1/
"""

import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from ..executor import (
    AgentConfig,
    ExecutionEngineRequest,
    Message,
    Model,
    Parameter,
    ToolDefinition,
)

logger = logging.getLogger(__name__)

QUERY_EXTENSION_URI = (
    "https://github.com/mckinsey/agents-at-scale-ark/tree/main/ark/api/extensions/query/v1"
)
QUERY_EXTENSION_METADATA_KEY = f"{QUERY_EXTENSION_URI}/ref"


@dataclass
class QueryRef:
    name: str
    namespace: str


def extract_query_ref(message: Any) -> QueryRef:
    """Extract QueryRef from an A2A message's extension metadata.

    Raises ValueError if the extension metadata is missing or malformed.
    """
    metadata = {}
    if hasattr(message, "metadata") and message.metadata:
        metadata = message.metadata

    ref_data = metadata.get(QUERY_EXTENSION_METADATA_KEY)
    if not ref_data or not isinstance(ref_data, dict):
        raise ValueError(
            f"Missing or invalid Ark query extension metadata at key '{QUERY_EXTENSION_METADATA_KEY}'"
        )

    name = ref_data.get("name")
    namespace = ref_data.get("namespace")
    if not name or not namespace:
        raise ValueError(
            f"QueryRef must contain 'name' and 'namespace', got: {ref_data}"
        )

    return QueryRef(name=name, namespace=namespace)


async def resolve_query(
    query_ref: QueryRef,
    user_input: str,
) -> ExecutionEngineRequest:
    """Resolve a QueryRef into a full ExecutionEngineRequest by fetching CRDs from the cluster.

    Replicates the resolution chain from the Go completions engine:
    Query CRD → Agent CRD → Model CRD + Tool CRDs → ExecutionEngineRequest
    """
    from ..client import V1_ALPHA1, with_ark_client

    async with with_ark_client(query_ref.namespace, V1_ALPHA1) as ark:
        query = await ark.queries.a_get(query_ref.name, query_ref.namespace)
        return await _resolve_from_query(ark, query, query_ref.namespace, user_input)


async def _resolve_from_query(ark, query, namespace: str, user_input: str) -> ExecutionEngineRequest:
    target = query.spec.target
    if not target:
        raise ValueError(f"Query '{query.metadata['name']}' has no target")

    if target.type != "agent":
        raise ValueError(
            f"Query extension resolution only supports agent targets, got '{target.type}'"
        )

    agent = await ark.agents.a_get(target.name, namespace)
    agent_config = await _build_agent_config(ark, agent, query, namespace)
    tools = await _build_tool_definitions(ark, agent, namespace)
    history = _build_history(query)

    return ExecutionEngineRequest(
        agent=agent_config,
        userInput=Message(role="user", content=user_input),
        history=history,
        tools=tools,
    )


async def _build_agent_config(ark, agent, query, namespace: str) -> AgentConfig:
    spec = agent.spec
    model = Model(name="", type="", config={})

    if spec.model_ref:
        model = await _resolve_model(ark, spec.model_ref, namespace)

    parameters = _resolve_parameters(spec.parameters, query.spec.parameters)

    prompt = spec.prompt or ""
    for param in parameters:
        prompt = prompt.replace(f"{{{param.name}}}", param.value)

    labels = agent.metadata.get("labels", {}) if agent.metadata else {}

    return AgentConfig(
        name=agent.metadata.get("name", "unknown") if agent.metadata else "unknown",
        namespace=namespace,
        prompt=prompt,
        description=spec.description or "",
        parameters=parameters,
        model=model,
        labels=labels,
    )


async def _resolve_model(ark, model_ref, namespace: str) -> Model:
    model_name = model_ref.name
    model_namespace = getattr(model_ref, "namespace", None) or namespace

    try:
        model_crd = await ark.models.a_get(model_name, model_namespace)
    except Exception as e:
        logger.warning(f"Failed to resolve model '{model_name}': {e}")
        return Model(name=model_name, type="unknown", config={})

    model_spec = model_crd.spec
    resolved_name = model_name
    if model_spec.model and hasattr(model_spec.model, "value"):
        resolved_name = model_spec.model.value or model_name

    provider = getattr(model_spec, "provider", "unknown")
    config = {}
    if model_spec.config:
        config_dict = model_spec.config.to_dict() if hasattr(model_spec.config, "to_dict") else {}
        provider_config = config_dict.get(provider, config_dict.get("openai", {}))
        if isinstance(provider_config, dict):
            config = {
                k: v for k, v in provider_config.items()
                if k not in ("apiKey", "api_key", "auth")
            }

    return Model(name=resolved_name, type=provider, config=config)


def _resolve_parameters(
    agent_params: Optional[list],
    query_params: Optional[list],
) -> List[Parameter]:
    resolved = []
    query_param_map: Dict[str, str] = {}
    if query_params:
        for qp in query_params:
            name = getattr(qp, "name", None) or (qp.get("name") if isinstance(qp, dict) else None)
            value = getattr(qp, "value", None) or (qp.get("value") if isinstance(qp, dict) else None)
            if name and value:
                query_param_map[name] = value

    if not agent_params:
        return resolved

    for param in agent_params:
        name = getattr(param, "name", None) or (param.get("name") if isinstance(param, dict) else None)
        value = getattr(param, "value", None) or (param.get("value") if isinstance(param, dict) else None)

        if not value:
            value_from = getattr(param, "value_from", None)
            if value_from:
                qp_ref = getattr(value_from, "query_parameter_ref", None)
                if qp_ref:
                    ref_name = getattr(qp_ref, "name", None)
                    if ref_name and ref_name in query_param_map:
                        value = query_param_map[ref_name]

        if not value:
            value = query_param_map.get(name, "")

        if name:
            resolved.append(Parameter(name=name, value=value or ""))

    return resolved


async def _build_tool_definitions(ark, agent, namespace: str) -> List[ToolDefinition]:
    tools = []
    if not agent.spec.tools:
        return tools

    for agent_tool in agent.spec.tools:
        tool_name = getattr(agent_tool, "name", None)
        if not tool_name:
            continue

        try:
            tool_crd = await ark.tools.a_get(tool_name, namespace)
            tool_spec = tool_crd.spec

            description = getattr(agent_tool, "description", None) or tool_spec.description or ""
            input_schema = tool_spec.input_schema or {}

            display_name = tool_name
            partial = getattr(agent_tool, "partial", None)
            if partial and hasattr(partial, "name") and partial.name:
                display_name = partial.name

            tools.append(ToolDefinition(
                name=display_name,
                description=description,
                parameters=input_schema,
            ))
        except Exception as e:
            logger.warning(f"Failed to resolve tool '{tool_name}': {e}")

    return tools


def _build_history(query) -> List[Message]:
    return []
