"""Ark Query Extension (v1) — extract and resolve QueryRef from A2A messages.

Extension spec: ark/api/extensions/query/v1/
"""

import base64
import json
import logging
import re
from dataclasses import dataclass
from typing import Any, Optional

from kubernetes_asyncio import client
from ark_sdk.k8s import create_api_client

from ..executor import (
    AgentConfig,
    ArgumentMatch,
    ExecutionContext,
    ExecutionEngineRequest,
    MCPServerConfig,
    Message,
    Model,
    Parameter,
    ResumeContext,
    ToolApproval,
    ToolApprovalConfig,
)
from ..impersonation import ImpersonationConfig
from ..k8s import SecretClient, apply_impersonation_headers

logger = logging.getLogger(__name__)

QUERY_EXTENSION_URI = (
    "https://github.com/mckinsey/agents-at-scale-ark/tree/main/ark/api/extensions/query/v1"
)
QUERY_EXTENSION_METADATA_KEY = f"{QUERY_EXTENSION_URI}/ref"


@dataclass
class QueryTargetRef:
    type: str
    name: str


@dataclass
class QueryRef:
    name: str
    namespace: str
    # Optional override naming the resource to execute. Sent when the caller
    # dispatches a single team member, whose Query targets the team rather than
    # the member. When absent, the Query's own spec.target is used.
    target: Optional[QueryTargetRef] = None
    conversation_id: str = ""


def _sdk_version() -> str:
    """Installed ark-sdk version, for error messages.

    Read from distribution metadata rather than ark_sdk.__version__, which is the
    OpenAPI generator's placeholder and does not track the released version.
    """
    try:
        from importlib.metadata import version

        return version("ark-sdk")
    except Exception:
        return "unknown"


def _parse_go_duration_to_seconds(duration: str) -> Optional[int]:
    if not duration:
        return None
    total = sum(
        int(v) * {"h": 3600, "m": 60, "s": 1}[u]
        for v, u in re.findall(r"(\d+)([hms])", duration)
    )
    return total or None


def extract_query_ref(message: Any) -> QueryRef:
    """Extract QueryRef from an A2A message's extension metadata.

    Raises ValueError if the extension metadata is missing or malformed.
    """
    metadata = {}
    if isinstance(message, dict):
        metadata = message.get("metadata") or {}
    elif hasattr(message, "metadata") and message.metadata:
        metadata = message.metadata
        if hasattr(metadata, "DESCRIPTOR"):
            # a2a-sdk 1.x's Message.metadata is a protobuf Struct, not a dict
            from google.protobuf.json_format import MessageToDict

            metadata = MessageToDict(metadata)

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

    return QueryRef(
        name=name,
        namespace=namespace,
        target=_extract_target(ref_data),
        conversation_id=_extract_conversation_id(ref_data),
    )


def _extract_conversation_id(ref_data: dict) -> str:
    value = ref_data.get("conversationId")
    if value is None:
        return ""

    if not isinstance(value, str):
        raise ValueError(
            f"QueryRef 'conversationId' must be a string, got: {value}"
        )

    return value


def _extract_target(ref_data: dict) -> Optional[QueryTargetRef]:
    """Parse the optional target override. Absent is fine; malformed is not."""
    target_data = ref_data.get("target")
    if target_data is None:
        return None

    if not isinstance(target_data, dict):
        raise ValueError(f"QueryRef 'target' must be an object, got: {target_data}")

    target_type = target_data.get("type")
    target_name = target_data.get("name")
    if not target_type or not target_name:
        raise ValueError(
            f"QueryRef 'target' must contain 'type' and 'name', got: {target_data}"
        )

    return QueryTargetRef(type=target_type, name=target_name)


def _query_impersonation(query: Any, namespace: str) -> Optional[ImpersonationConfig]:
    """Impersonation for the Query's declared spec.serviceAccount, if it has one.

    Matches the username format the controller uses for the same field, so both
    sides of the A2A boundary resolve resources as the same identity.
    """
    service_account = _get_attr_or_key(query.spec, "service_account", "serviceAccount")
    if not isinstance(service_account, str) or not service_account:
        return None
    return ImpersonationConfig(
        username=f"system:serviceaccount:{namespace}:{service_account}"
    )


async def resolve_query(
    query_ref: QueryRef,
    user_input: str,
    conversation_id: str = "",
) -> ExecutionEngineRequest:
    """Resolve a QueryRef into a full ExecutionEngineRequest by fetching CRDs from the cluster.

    Resolution chain: Query CRD → Agent CRD → Model CRD + MCPServer CRDs → ExecutionEngineRequest.
    Only a QueryRef crosses A2A — all resources are resolved locally from the cluster.

    Resolution runs as the Query's spec.serviceAccount when it declares one, and as
    the executor's pod service account otherwise. The Query itself is always read
    with the pod's identity, since spec.serviceAccount is only knowable from it.
    """
    from ..client import V1_ALPHA1, with_ark_client
    from ..k8s import init_k8s
    await init_k8s()
    async with with_ark_client(query_ref.namespace, V1_ALPHA1) as ark:
        query = await ark.queries.a_get(query_ref.name, query_ref.namespace)

    impersonation = _query_impersonation(query, query_ref.namespace)
    async with with_ark_client(
        query_ref.namespace, V1_ALPHA1, impersonation=impersonation
    ) as ark:
        return await _resolve_from_query(
            ark, query, query_ref.namespace, user_input, conversation_id,
            target_override=query_ref.target, impersonation=impersonation,
        )


async def fetch_resumption(query_ref: QueryRef) -> Optional[ResumeContext]:
    """Detect a HITL resumption dispatch and rebuild the pending state from the A2ATask.

    The query controller re-dispatches the SAME Query after a human decides on gated tool
    calls. On that re-dispatch the Query's status.response.a2a.taskId still points at the
    (now terminal) HITL A2ATask, whose status.protocolMetadata carries the paused toolCalls +
    ExecutionContext. Returns a ResumeContext to drive the resume path, or None on a fresh
    dispatch / non-HITL task / still-pending approval.
    """
    from ..client import V1_ALPHA1, with_ark_client
    from ..k8s import init_k8s
    await init_k8s()
    try:
        async with with_ark_client(query_ref.namespace, V1_ALPHA1) as ark:
            query = await ark.queries.a_get(query_ref.name, query_ref.namespace)
            status = _get_attr_or_key(query, "status")
            response = _get_attr_or_key(status, "response") if status else None
            a2a = _get_attr_or_key(response, "a2a") if response else None
            task_id = _get_attr_or_key(a2a, "task_id", "taskId") if a2a else None
            if not task_id:
                return None
            task = await ark.a2atasks.a_get(f"a2a-task-{task_id}", query_ref.namespace)
    except Exception as e:
        logger.warning("fetch_resumption: could not load A2ATask: %s", e)
        return None

    spec = _get_attr_or_key(task, "spec")
    # HITL approval tasks carry no a2aServerRef (external-A2AServer tasks do).
    if _get_attr_or_key(spec, "a2a_server_ref", "a2aServerRef") is not None:
        return None

    task_status = _get_attr_or_key(task, "status")
    phase = _get_attr_or_key(task_status, "phase") if task_status else None
    if phase not in ("completed", "failed"):
        return None

    pm = _get_attr_or_key(task_status, "protocol_metadata", "protocolMetadata") or {}
    try:
        tool_calls = json.loads(_get_attr_or_key(pm, "toolCalls") or "[]")
        ctx_raw = _get_attr_or_key(pm, "context")
        context = ExecutionContext(**json.loads(ctx_raw)) if ctx_raw else ExecutionContext()
    except Exception as e:
        logger.warning("fetch_resumption: could not parse protocolMetadata: %s", e)
        return None

    decision = "approved" if phase == "completed" else "rejected"
    rejection_reason = ""
    if decision == "rejected":
        rejection_reason = (
            _get_attr_or_key(task_status, "error")
            or _get_attr_or_key(pm, "rejectionReason")
            or "Tool call rejected by approver"
        )
    return ResumeContext(
        decision=decision,
        rejectionReason=rejection_reason,
        context=context,
        toolCalls=tool_calls,
    )


async def _resolve_from_query(
    ark: Any,
    query: Any,
    namespace: str,
    user_input: str,
    conversation_id: str = "",
    target_override: Optional[QueryTargetRef] = None,
    impersonation: Optional[ImpersonationConfig] = None,
) -> ExecutionEngineRequest:
    # An explicit target from the caller wins over the Query's own target: the
    # caller is dispatching one member of a team, whose Query targets the team.
    target = target_override or query.spec.target
    if not target:
        raise ValueError(f"Query '{query.metadata['name']}' has no target")

    target_type = _get_attr_or_key(target, "type")
    target_name = _get_attr_or_key(target, "name")

    if target_type != "agent":
        if target_override is None:
            raise ValueError(
                f"Query extension resolution only supports agent targets, got '{target_type}'. "
                "Executing a member of a team requires the caller to send a query extension "
                "'target', which this ark-sdk supports but the caller did not send; upgrading "
                f"Ark provides it. This engine runs ark-sdk {_sdk_version()}."
            )
        raise ValueError(
            f"Query extension target override only supports agent targets, got '{target_type}'"
        )

    if target_override is not None:
        await _authorize_override(ark, query, namespace, target_name)

    agent = await ark.agents.a_get(target_name, namespace)
    agent_config = await _build_agent_config(ark, agent, query, namespace, impersonation)
    mcp_servers = await _build_mcp_servers(ark, agent, namespace, impersonation)

    query_annotations = query.metadata.get("annotations", {}) if query.metadata else {}
    execution_engine_annotations = await _resolve_execution_engine_annotations(agent, namespace, impersonation)

    raw_ttl = getattr(query.spec, "ttl", None)
    message_ttl_seconds = _parse_go_duration_to_seconds(raw_ttl) if isinstance(raw_ttl, str) else None

    return ExecutionEngineRequest(
        agent=agent_config,
        userInput=Message(role="user", content=user_input),
        mcpServers=mcp_servers,
        conversationId=conversation_id,
        query_annotations=query_annotations,
        execution_engine_annotations=execution_engine_annotations,
        message_ttl_seconds=message_ttl_seconds,
    )


async def _authorize_override(ark: Any, query: Any, namespace: str, agent_name: str) -> None:
    """Reject an override naming an agent the Query's own target does not reach."""
    declared = query.spec.target
    declared_type = _get_attr_or_key(declared, "type") if declared else None
    declared_name = _get_attr_or_key(declared, "name") if declared else None
    query_name = query.metadata["name"]

    if declared is None:
        raise ValueError(
            f"Query '{query_name}' has no spec.target, so agent '{agent_name}' cannot be "
            f"authorised as a sub-target: a query that resolves its target by selector "
            f"cannot delegate to a team member in ark-sdk {_sdk_version()}"
        )

    if declared_type != "team":
        raise ValueError(
            f"Query '{query_name}' targets {declared_type} '{declared_name}', so agent "
            f"'{agent_name}' cannot be executed as a sub-target: only team targets may delegate"
        )

    if not await _team_reaches_agent(ark, namespace, declared_name, agent_name):
        raise ValueError(
            f"Agent '{agent_name}' is not a member or selector of team '{declared_name}' "
            f"targeted by query '{query_name}'"
        )


async def _team_reaches_agent(ark: Any, namespace: str, team_name: str, agent_name: str) -> bool:
    """Whether a team transitively contains an agent, as a member or as its selector."""
    visited: set[str] = set()
    pending = [team_name]

    while pending:
        name = pending.pop(0)
        if name in visited:
            continue
        visited.add(name)

        team = await ark.teams.a_get(name, namespace)
        selector = getattr(team.spec, "selector", None)
        if selector is not None and _get_attr_or_key(selector, "agent") == agent_name:
            return True

        for member in getattr(team.spec, "members", None) or []:
            member_type = _get_attr_or_key(member, "type")
            member_name = _get_attr_or_key(member, "name")
            if member_type == "agent" and member_name == agent_name:
                return True
            if member_type == "team" and member_name:
                pending.append(member_name)

    return False


async def _resolve_execution_engine_annotations(
    agent,
    namespace: str,
    impersonation: Optional[ImpersonationConfig] = None,
) -> dict[str, str]:
    ee_ref = getattr(agent.spec, "execution_engine", None) or getattr(agent.spec, "executionEngine", None)
    if not ee_ref:
        return {}
    ee_name = _get_attr_or_key(ee_ref, "name")
    if not ee_name:
        raise ValueError(f"ExecutionEngine reference on agent '{agent.metadata.get('name')}' has no name")
    from ..client import V1_PREALPHA1, with_ark_client
    async with with_ark_client(namespace, V1_PREALPHA1, impersonation=impersonation) as prealpha_ark:
        ee = await prealpha_ark.executionengines.a_get(ee_name, namespace)
        return ee.metadata.get("annotations", {}) if ee.metadata else {}


async def _build_agent_config(
    ark: Any,
    agent: Any,
    query: Any,
    namespace: str,
    impersonation: Optional[ImpersonationConfig] = None,
) -> AgentConfig:
    spec = agent.spec
    model = Model(name="", type="", config={})

    if spec.model_ref:
        model = await _resolve_model(ark, spec.model_ref, namespace, impersonation)

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


def _extract_value_source_refs(vs: Any) -> tuple[Optional[str], Any, Any, Any]:
    if isinstance(vs, dict):
        if vs.get("value"):
            return vs["value"], None, None, None
        vf = vs.get("valueFrom") or {}
        return None, vf.get("secretKeyRef"), vf.get("configMapKeyRef"), vf.get("serviceRef")

    if getattr(vs, "value", None):
        return vs.value, None, None, None
    vf = getattr(vs, "value_from", None) or getattr(vs, "valueFrom", None)
    if not vf:
        return None, None, None, None
    secret_ref = getattr(vf, "secret_key_ref", None) or getattr(vf, "secretKeyRef", None)
    cm_ref = getattr(vf, "config_map_key_ref", None) or getattr(vf, "configMapKeyRef", None)
    service_ref = getattr(vf, "service_ref", None) or getattr(vf, "serviceRef", None)
    return None, secret_ref, cm_ref, service_ref


async def _resolve_service_ref(
    service_ref: Any,
    namespace: str,
    impersonation: Optional[ImpersonationConfig] = None,
) -> str:
    """Resolve a ServiceReference to an in-cluster URL, matching the Go executor's
    common.ResolveServiceReference: http://<name>.<ns>.svc.cluster.local:<port><path>,
    where port may be a named service port."""
    name = _get_attr_or_key(service_ref, "name")
    if not name:
        return ""
    ns = _get_attr_or_key(service_ref, "namespace") or namespace
    port_ref = _get_attr_or_key(service_ref, "port")
    path = _get_attr_or_key(service_ref, "path") or ""
    try:
        async with create_api_client() as api:
            v1 = client.CoreV1Api(apply_impersonation_headers(api, impersonation))
            svc = await v1.read_namespaced_service(name=name, namespace=ns)
        ports = (svc.spec.ports or []) if svc.spec else []
        port: Optional[int] = None
        if port_ref:
            for p in ports:
                if p.name == port_ref:
                    port = p.port
                    break
            if port is None:
                try:  # allow a numeric port given directly
                    port = int(port_ref)
                except (TypeError, ValueError):
                    logger.warning(f"ServiceRef {ns}/{name}: port '{port_ref}' not found")
                    return ""
        elif ports:
            port = ports[0].port
        else:
            logger.warning(f"ServiceRef {ns}/{name}: service has no ports")
            return ""
        url = f"http://{name}.{ns}.svc.cluster.local:{port}"
        if path:
            url += path if path.startswith("/") else f"/{path}"
        return url
    except Exception as e:
        logger.warning(f"Failed to resolve serviceRef {ns}/{name}: {e}")
        return ""


async def _resolve_secret_ref(
    secret_ref: Any,
    namespace: str,
    impersonation: Optional[ImpersonationConfig] = None,
) -> str:
    ref_name = _get_attr_or_key(secret_ref, "name")
    ref_key = _get_attr_or_key(secret_ref, "key")
    if not (ref_name and ref_key):
        return ""
    try:
        sc = SecretClient(namespace=namespace, impersonation=impersonation)
        result = await sc.get_secret_value(ref_name, ref_key)
        return base64.b64decode(result["value"]).decode("utf-8")
    except Exception as e:
        logger.warning(f"Failed to resolve secret {ref_name}/{ref_key}: {e}")
        return ""


async def _resolve_configmap_ref(
    cm_ref: Any,
    namespace: str,
    impersonation: Optional[ImpersonationConfig] = None,
) -> str:
    ref_name = _get_attr_or_key(cm_ref, "name")
    ref_key = _get_attr_or_key(cm_ref, "key")
    if not (ref_name and ref_key):
        return ""
    try:
        async with create_api_client() as api:
            v1 = client.CoreV1Api(apply_impersonation_headers(api, impersonation))
            cm = await v1.read_namespaced_config_map(name=ref_name, namespace=namespace)
            return (cm.data or {}).get(ref_key, "")
    except Exception as e:
        logger.warning(f"Failed to resolve configmap {ref_name}/{ref_key}: {e}")
        return ""


async def _resolve_value_source(
    vs: Any,
    namespace: str,
    impersonation: Optional[ImpersonationConfig] = None,
) -> str:
    direct_value, secret_ref, cm_ref, service_ref = _extract_value_source_refs(vs)
    if direct_value:
        return direct_value
    if secret_ref:
        result = await _resolve_secret_ref(secret_ref, namespace, impersonation)
        if result:
            return result
    if cm_ref:
        return await _resolve_configmap_ref(cm_ref, namespace, impersonation)
    if service_ref:
        return await _resolve_service_ref(service_ref, namespace, impersonation)
    return ""


async def _resolve_provider_config(
    provider_config_obj: Any,
    namespace: str,
    impersonation: Optional[ImpersonationConfig] = None,
) -> dict[str, Any]:
    config = {}
    api_key_vs = getattr(provider_config_obj, "api_key", None) or getattr(provider_config_obj, "apiKey", None)
    if api_key_vs:
        config["apiKey"] = await _resolve_value_source(api_key_vs, namespace, impersonation)
    base_url_vs = getattr(provider_config_obj, "base_url", None) or getattr(provider_config_obj, "baseUrl", None)
    if base_url_vs:
        config["baseUrl"] = await _resolve_value_source(base_url_vs, namespace, impersonation)
    api_version_vs = getattr(provider_config_obj, "api_version", None) or getattr(provider_config_obj, "apiVersion", None)
    if api_version_vs:
        config["apiVersion"] = await _resolve_value_source(api_version_vs, namespace, impersonation)
    if hasattr(provider_config_obj, "properties") and provider_config_obj.properties:
        config["properties"] = provider_config_obj.properties
    return config


async def _resolve_model(
    ark: Any,
    model_ref: Any,
    namespace: str,
    impersonation: Optional[ImpersonationConfig] = None,
) -> Model:
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
        resolved_name = await _resolve_value_source(model_spec.model, model_namespace, impersonation) or model_name

    provider = getattr(model_spec, "provider", "unknown")
    config = {}
    if model_spec.config:
        provider_config_obj = getattr(model_spec.config, provider, None) or getattr(model_spec.config, "openai", None)
        if provider_config_obj:
            config = await _resolve_provider_config(provider_config_obj, model_namespace, impersonation)

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


async def _resolve_mcp_server(
    ark: Any,
    server_name: str,
    namespace: str,
    impersonation: Optional[ImpersonationConfig] = None,
) -> Optional[MCPServerConfig]:
    server_namespace = namespace
    try:
        server_crd = await ark.mcpservers.a_get(server_name, server_namespace)
    except Exception as e:
        logger.warning(f"Failed to resolve MCPServer '{server_name}': {e}")
        return None

    spec = server_crd.spec
    url = await _resolve_value_source(spec.address, server_namespace, impersonation)
    if not url:
        logger.warning(f"MCPServer '{server_name}' has no resolvable address")
        return None

    headers: dict[str, str] = {}
    if spec.headers:
        for header in spec.headers:
            header_name = _get_attr_or_key(header, "name")
            header_value_source = _get_attr_or_key(header, "value")
            if header_name and header_value_source:
                resolved = await _resolve_value_source(header_value_source, server_namespace, impersonation)
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


def _extract_approval(obj: Any) -> Optional[dict]:
    """Pull approval fields (required/timeout/onTimeout/argumentMatches) from a CRD object or dict."""
    if obj is None:
        return None
    required = _get_attr_or_key(obj, "required")
    timeout = _get_attr_or_key(obj, "timeout")
    on_timeout = _get_attr_or_key(obj, "on_timeout") or _get_attr_or_key(obj, "onTimeout")
    matches = _get_attr_or_key(obj, "argument_matches") or _get_attr_or_key(obj, "argumentMatches") or []
    out_matches = []
    for m in matches:
        arg = _get_attr_or_key(m, "argument")
        pat = _get_attr_or_key(m, "pattern")
        if arg is not None and pat is not None:
            out_matches.append(ArgumentMatch(argument=str(arg), pattern=str(pat)))
    return {
        "required": bool(required),
        "timeout": str(timeout) if timeout else "",
        "onTimeout": str(on_timeout) if on_timeout else "",
        "argumentMatches": out_matches,
    }


def _merge_approval(tool_a: Optional[dict], agent_a: Optional[dict]) -> Optional[ToolApprovalConfig]:
    """Merge Tool-CRD + agent-tool approval (mirrors Go mergeApprovalConfig). Returns a config
    only when approval is required. Agent cannot unset required; agent overrides timeout/onTimeout;
    argumentMatches are unioned."""
    if not tool_a and not agent_a:
        return None
    t = tool_a or {}
    a = agent_a or {}
    required = bool(t.get("required")) or bool(a.get("required"))
    if not required:
        return None
    timeout = a.get("timeout") or t.get("timeout") or ""
    on_timeout = a.get("onTimeout") or t.get("onTimeout") or ""
    matches = list(t.get("argumentMatches") or []) + list(a.get("argumentMatches") or [])
    return ToolApprovalConfig(required=True, timeout=timeout, onTimeout=on_timeout, argumentMatches=matches)


async def _build_mcp_servers(
    ark: Any,
    agent: Any,
    namespace: str,
    impersonation: Optional[ImpersonationConfig] = None,
) -> list[MCPServerConfig]:
    if not agent.spec.tools:
        return []

    server_tools: dict[str, list[str]] = {}
    server_approvals: dict[str, dict[str, ToolApprovalConfig]] = {}
    dropped: list[str] = []
    for agent_tool in agent.spec.tools:
        tool_name = getattr(agent_tool, "name", None)
        if not tool_name:
            continue

        try:
            tool_crd = await ark.tools.a_get(tool_name, namespace)
            tool_spec = tool_crd.spec

            tool_type = getattr(tool_spec, "type", None)
            if tool_type != "mcp":
                if tool_type:
                    dropped.append(f"{tool_name} ({tool_type})")
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
                # HITL: merge Tool-CRD + agent-tool approval; record only if required.
                merged = _merge_approval(
                    _extract_approval(getattr(tool_spec, "approval", None)),
                    _extract_approval(getattr(agent_tool, "approval", None)),
                )
                if merged is not None:
                    server_approvals.setdefault(server_name, {})[mcp_tool_name] = merged
        except Exception as e:
            logger.warning(f"Failed to resolve tool '{tool_name}': {e}")

    if dropped:
        agent_name = agent.metadata.get("name", "unknown") if agent.metadata else "unknown"
        logger.warning(
            f"Agent '{agent_name}': this executor receives only mcp tools; these "
            f"tools were not available to the agent: {', '.join(dropped)}"
        )

    servers: list[MCPServerConfig] = []
    for server_name, tool_names in server_tools.items():
        server_config = await _resolve_mcp_server(ark, server_name, namespace, impersonation)
        if server_config:
            server_config.tools = tool_names
            server_config.approvals = [
                ToolApproval(tool=t, approval=cfg)
                for t, cfg in server_approvals.get(server_name, {}).items()
            ]
            servers.append(server_config)

    return servers


