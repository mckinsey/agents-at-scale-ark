"""Ark Query Extension (v1) — extract and resolve QueryRef from A2A messages.

Extension spec: ark/api/extensions/query/v1/
"""

import base64
import logging
from dataclasses import dataclass
from typing import Any, Optional

from kubernetes_asyncio import client
from kubernetes_asyncio.client.api_client import ApiClient

from ..executor import (
    AgentConfig,
    ExecutionEngineRequest,
    MCPServerConfig,
    Message,
    Model,
    Parameter,
)
from ..k8s import SecretClient

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
    conversation_id: str = "",
) -> ExecutionEngineRequest:
    """Resolve a QueryRef into a full ExecutionEngineRequest by fetching CRDs from the cluster.

    Resolution chain: Query CRD → Agent CRD → Model CRD + MCPServer CRDs → ExecutionEngineRequest.
    Only a QueryRef crosses A2A — all resources are resolved locally from the cluster.
    """
    from ..client import V1_ALPHA1, with_ark_client
    from ..k8s import init_k8s
    await init_k8s()
    async with with_ark_client(query_ref.namespace, V1_ALPHA1) as ark:
        query = await ark.queries.a_get(query_ref.name, query_ref.namespace)
        return await _resolve_from_query(ark, query, query_ref.namespace, user_input, conversation_id)


async def _resolve_from_query(ark: Any, query: Any, namespace: str, user_input: str, conversation_id: str = "") -> ExecutionEngineRequest:
    target = query.spec.target
    if not target:
        raise ValueError(f"Query '{query.metadata['name']}' has no target")

    if target.type != "agent":
        raise ValueError(
            f"Query extension resolution only supports agent targets, got '{target.type}'"
        )

    agent = await ark.agents.a_get(target.name, namespace)
    agent_config = await _build_agent_config(ark, agent, query, namespace)
    mcp_servers = await _build_mcp_servers(ark, agent, namespace)

    query_annotations = query.metadata.get("annotations", {}) if query.metadata else {}
    execution_engine_annotations = await _resolve_execution_engine_annotations(agent, namespace)

    return ExecutionEngineRequest(
        agent=agent_config,
        userInput=Message(role="user", content=user_input),
        mcpServers=mcp_servers,
        conversationId=conversation_id,
        query_annotations=query_annotations,
        execution_engine_annotations=execution_engine_annotations,
    )


async def _resolve_execution_engine_annotations(agent, namespace: str) -> dict[str, str]:
    ee_ref = getattr(agent.spec, "execution_engine", None) or getattr(agent.spec, "executionEngine", None)
    if not ee_ref:
        return {}
    ee_name = _get_attr_or_key(ee_ref, "name")
    if not ee_name:
        raise ValueError(f"ExecutionEngine reference on agent '{agent.metadata.get('name')}' has no name")
    from ..client import V1_PREALPHA1, with_ark_client
    async with with_ark_client(namespace, V1_PREALPHA1) as prealpha_ark:
        ee = await prealpha_ark.executionengines.a_get(ee_name, namespace)
        return ee.metadata.get("annotations", {}) if ee.metadata else {}


async def _build_agent_config(ark: Any, agent: Any, query: Any, namespace: str) -> AgentConfig:
    spec = agent.spec
    model = Model(name="", type="", config={})

    if spec.model_ref:
        model = await _resolve_model(ark, spec.model_ref, namespace)

    parameters = _resolve_parameters(spec.parameters, query.spec.parameters)

    prompt = spec.prompt or ""
    for param in parameters:
        prompt = prompt.replace(f"{{{param.name}}}", param.value)

    labels = agent.metadata.get("labels", {}) if agent.metadata else {}
    annotations = agent.metadata.get("annotations", {}) if agent.metadata else {}

    return AgentConfig(
        name=agent.metadata.get("name", "unknown") if agent.metadata else "unknown",
        namespace=namespace,
        prompt=prompt,
        description=spec.description or "",
        parameters=parameters,
        model=model,
        labels=labels,
        annotations=annotations,
    )


def _get_attr_or_key(obj: Any, attr_name: str, dict_key: Optional[str] = None) -> Any:
    if dict_key is None:
        dict_key = attr_name
    if isinstance(obj, dict):
        return obj.get(dict_key)
    return getattr(obj, attr_name, None)


def _extract_value_source_refs(vs: Any) -> tuple[Optional[str], Any, Any]:
    if isinstance(vs, dict):
        if vs.get("value"):
            return vs["value"], None, None
        vf = vs.get("valueFrom") or {}
        return None, vf.get("secretKeyRef"), vf.get("configMapKeyRef")

    if getattr(vs, "value", None):
        return vs.value, None, None
    vf = getattr(vs, "value_from", None) or getattr(vs, "valueFrom", None)
    if not vf:
        return None, None, None
    secret_ref = getattr(vf, "secret_key_ref", None) or getattr(vf, "secretKeyRef", None)
    cm_ref = getattr(vf, "config_map_key_ref", None) or getattr(vf, "configMapKeyRef", None)
    return None, secret_ref, cm_ref


async def _resolve_secret_ref(secret_ref: Any, namespace: str) -> str:
    ref_name = _get_attr_or_key(secret_ref, "name")
    ref_key = _get_attr_or_key(secret_ref, "key")
    if not (ref_name and ref_key):
        return ""
    try:
        sc = SecretClient(namespace=namespace)
        result = await sc.get_secret_value(ref_name, ref_key)
        return base64.b64decode(result["value"]).decode("utf-8")
    except Exception as e:
        logger.warning(f"Failed to resolve secret {ref_name}/{ref_key}: {e}")
        return ""


async def _resolve_configmap_ref(cm_ref: Any, namespace: str) -> str:
    ref_name = _get_attr_or_key(cm_ref, "name")
    ref_key = _get_attr_or_key(cm_ref, "key")
    if not (ref_name and ref_key):
        return ""
    try:
        async with ApiClient() as api:
            v1 = client.CoreV1Api(api)
            cm = await v1.read_namespaced_config_map(name=ref_name, namespace=namespace)
            return (cm.data or {}).get(ref_key, "")
    except Exception as e:
        logger.warning(f"Failed to resolve configmap {ref_name}/{ref_key}: {e}")
        return ""


async def _resolve_value_source(vs: Any, namespace: str) -> str:
    direct_value, secret_ref, cm_ref = _extract_value_source_refs(vs)
    if direct_value:
        return direct_value
    if secret_ref:
        result = await _resolve_secret_ref(secret_ref, namespace)
        if result:
            return result
    if cm_ref:
        return await _resolve_configmap_ref(cm_ref, namespace)
    return ""


async def _resolve_provider_config(provider_config_obj: Any, namespace: str) -> dict[str, Any]:
    config = {}
    api_key_vs = getattr(provider_config_obj, "api_key", None) or getattr(provider_config_obj, "apiKey", None)
    if api_key_vs:
        config["apiKey"] = await _resolve_value_source(api_key_vs, namespace)
    base_url_vs = getattr(provider_config_obj, "base_url", None) or getattr(provider_config_obj, "baseUrl", None)
    if base_url_vs:
        config["baseUrl"] = await _resolve_value_source(base_url_vs, namespace)
    api_version_vs = getattr(provider_config_obj, "api_version", None) or getattr(provider_config_obj, "apiVersion", None)
    if api_version_vs:
        config["apiVersion"] = await _resolve_value_source(api_version_vs, namespace)
    if hasattr(provider_config_obj, "properties") and provider_config_obj.properties:
        config["properties"] = provider_config_obj.properties
    return config


async def _resolve_model(ark: Any, model_ref: Any, namespace: str) -> Model:
    model_name = model_ref.name
    model_namespace = getattr(model_ref, "namespace", None) or namespace

    try:
        model_crd = await ark.models.a_get(model_name, model_namespace)
    except Exception as e:
        logger.warning(f"Failed to resolve model '{model_name}': {e}")
        return Model(name=model_name, type="unknown", config={})

    model_spec = model_crd.spec
    resolved_name = model_name
    if model_spec.model:
        resolved_name = await _resolve_value_source(model_spec.model, model_namespace) or model_name

    provider = getattr(model_spec, "provider", "unknown")
    config = {}
    if model_spec.config:
        provider_config_obj = getattr(model_spec.config, provider, None) or getattr(model_spec.config, "openai", None)
        if provider_config_obj:
            config = await _resolve_provider_config(provider_config_obj, model_namespace)

    return Model(name=resolved_name, type=provider, config={provider: config} if config else {})


def _build_query_param_map(query_params: Optional[list]) -> dict[str, str]:
    param_map: dict[str, str] = {}
    if not query_params:
        return param_map
    for qp in query_params:
        name = _get_attr_or_key(qp, "name")
        value = _get_attr_or_key(qp, "value")
        if name and value:
            param_map[name] = value
    return param_map


def _resolve_param_value(param: Any, query_param_map: dict[str, str]) -> str:
    value = _get_attr_or_key(param, "value")
    if value:
        return value
    value_from = getattr(param, "value_from", None)
    if value_from:
        qp_ref = getattr(value_from, "query_parameter_ref", None)
        if qp_ref:
            ref_name = getattr(qp_ref, "name", None)
            if ref_name and ref_name in query_param_map:
                return query_param_map[ref_name]
    name = _get_attr_or_key(param, "name")
    return query_param_map.get(name, "") if name else ""


def _resolve_parameters(
    agent_params: Optional[list],
    query_params: Optional[list],
) -> list[Parameter]:
    query_param_map = _build_query_param_map(query_params)
    if not agent_params:
        return []
    resolved = []
    for param in agent_params:
        name = _get_attr_or_key(param, "name")
        if name:
            value = _resolve_param_value(param, query_param_map)
            resolved.append(Parameter(name=name, value=value or ""))
    return resolved


async def _resolve_mcp_server(ark: Any, server_name: str, namespace: str) -> Optional[MCPServerConfig]:
    server_namespace = namespace
    try:
        server_crd = await ark.mcpservers.a_get(server_name, server_namespace)
    except Exception as e:
        logger.warning(f"Failed to resolve MCPServer '{server_name}': {e}")
        return None

    spec = server_crd.spec
    url = await _resolve_value_source(spec.address, server_namespace)
    if not url:
        logger.warning(f"MCPServer '{server_name}' has no resolvable address")
        return None

    headers: dict[str, str] = {}
    if spec.headers:
        for header in spec.headers:
            header_name = _get_attr_or_key(header, "name")
            header_value_source = _get_attr_or_key(header, "value")
            if header_name and header_value_source:
                resolved = await _resolve_value_source(header_value_source, server_namespace)
                if resolved:
                    headers[header_name] = resolved

    transport = getattr(spec, "transport", "http") or "http"
    timeout = getattr(spec, "timeout", "30s") or "30s"

    return MCPServerConfig(
        name=server_name,
        url=url,
        transport=transport,
        timeout=timeout,
        headers=headers,
        tools=[],
    )


async def _build_mcp_servers(ark: Any, agent: Any, namespace: str) -> list[MCPServerConfig]:
    if not agent.spec.tools:
        return []

    server_tools: dict[str, list[str]] = {}
    for agent_tool in agent.spec.tools:
        tool_name = getattr(agent_tool, "name", None)
        if not tool_name:
            continue

        try:
            tool_crd = await ark.tools.a_get(tool_name, namespace)
            tool_spec = tool_crd.spec

            if getattr(tool_spec, "type", None) != "mcp":
                continue

            mcp_ref = getattr(tool_spec, "mcp", None)
            if not mcp_ref:
                continue

            server_ref = getattr(mcp_ref, "mcp_server_ref", None) or getattr(mcp_ref, "mcpServerRef", None)
            if not server_ref:
                continue

            server_name = _get_attr_or_key(server_ref, "name")
            mcp_tool_name = _get_attr_or_key(mcp_ref, "tool_name") or _get_attr_or_key(mcp_ref, "toolName")

            if server_name and mcp_tool_name:
                if server_name not in server_tools:
                    server_tools[server_name] = []
                server_tools[server_name].append(mcp_tool_name)
        except Exception as e:
            logger.warning(f"Failed to resolve tool '{tool_name}': {e}")

    servers: list[MCPServerConfig] = []
    for server_name, tool_names in server_tools.items():
        server_config = await _resolve_mcp_server(ark, server_name, namespace)
        if server_config:
            server_config.tools = tool_names
            servers.append(server_config)

    return servers


