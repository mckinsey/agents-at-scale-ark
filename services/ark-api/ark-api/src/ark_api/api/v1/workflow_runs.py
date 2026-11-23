import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query
from kubernetes_asyncio.client import CoreV1Api
from kubernetes_asyncio.client.rest import ApiException
from ark_sdk.impersonation import ImpersonationConfig

from ...auth.dependencies import get_impersonation_config
from ...models.workflow_runs import WorkflowRun, WorkflowRunLog, WorkflowRunNode, WorkflowRunParameter
from ...services.sensitive_data_filter import redact
from .client_utils import create_dynamic_client, get_impersonating_api_client
from .exceptions import handle_k8s_errors
from .resources import WORKFLOW_POD_LABEL
from .workflow_lifecycle import WORKFLOW_API_VERSION, WORKFLOW_KIND

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/resources", tags=["workflow-runs"])

NODE_ID_ANNOTATION = "workflows.argoproj.io/node-id"
TRACE_ID_ANNOTATION = "workflows.argoproj.io/trace-id"
SPAN_ID_ANNOTATION = "workflows.argoproj.io/span-id"
DEFAULT_LOG_LINES = 50
MAX_LOG_LINES = 1000
LIVE_LOG_TAIL_LINES = 5000
LOG_CONTAINER = "main"
ARGO_EXECUTOR_LOG_MARKER = " argo=true"


@router.get(
    "/apis/argoproj.io/v1alpha1/namespaces/{namespace}/workflows/{workflow_name}/run",
    response_model=WorkflowRun,
)
@handle_k8s_errors(operation="get", resource_type="workflow")
async def get_workflow_run(
    namespace: str,
    workflow_name: str,
    log_lines: int = Query(DEFAULT_LOG_LINES, ge=0, le=MAX_LOG_LINES, description="Log lines to include per node, from the end"),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> WorkflowRun:
    """
    Get a workflow run with its nodes, parameters, timings, trace IDs and a log excerpt per node.

    Parameters, messages and logs have credentials redacted.

    Examples:
        - GET /v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/my-workflow/run
    """
    async with get_impersonating_api_client(impersonation) as api:
        dynamic_client = await create_dynamic_client(api)
        workflow_resource = await dynamic_client.resources.get(api_version=WORKFLOW_API_VERSION, kind=WORKFLOW_KIND)
        workflow = (await workflow_resource.get(name=workflow_name, namespace=namespace)).to_dict()

        core_v1 = CoreV1Api(api)
        pods = await core_v1.list_namespaced_pod(
            namespace=namespace,
            label_selector=f"{WORKFLOW_POD_LABEL}={workflow_name}",
        )
        pods_by_node = {
            (pod.metadata.annotations or {}).get(NODE_ID_ANNOTATION): pod for pod in pods.items
        }

        status = workflow.get("status") or {}
        ordered_nodes = sorted((status.get("nodes") or {}).items(), key=lambda item: item[1].get("startedAt") or "")
        nodes = []
        for node_id, node in ordered_nodes:
            pod = pods_by_node.get(node_id)
            log = None
            if log_lines and node.get("type") == "Pod":
                log = await _node_log(core_v1, namespace, node_id, pod, log_lines)
            nodes.append(_workflow_run_node(node_id, node, pod, log))

        metadata = workflow.get("metadata") or {}
        return WorkflowRun(
            name=metadata.get("name", workflow_name),
            namespace=metadata.get("namespace", namespace),
            uid=metadata.get("uid", ""),
            phase=status.get("phase"),
            started_at=status.get("startedAt"),
            finished_at=status.get("finishedAt"),
            message=_redacted(status.get("message")),
            trace_id=next((node.trace_id for node in nodes if node.trace_id), None),
            nodes=nodes,
        )


async def _node_log(
    core_v1: CoreV1Api,
    namespace: str,
    node_id: str,
    pod,
    log_lines: int,
) -> Optional[WorkflowRunLog]:
    if pod is None:
        return None
    try:
        text = await core_v1.read_namespaced_pod_log(
            name=pod.metadata.name,
            namespace=namespace,
            container=LOG_CONTAINER,
            tail_lines=LIVE_LOG_TAIL_LINES,
        )
    except ApiException as e:
        if e.status == 403:
            raise
        logger.info(f"No live logs for node {node_id}: {e}")
        return None
    return _log_excerpt(text or "", log_lines, "pod")


def _log_excerpt(text: str, log_lines: int, source: str) -> WorkflowRunLog:
    lines = [line for line in text.splitlines() if ARGO_EXECUTOR_LOG_MARKER not in line]
    return WorkflowRunLog(
        excerpt=redact("\n".join(lines[-log_lines:])),
        truncated=len(lines) > log_lines,
        source=source,
    )


def _workflow_run_node(node_id: str, node: dict, pod, log: Optional[WorkflowRunLog]) -> WorkflowRunNode:
    annotations = (pod.metadata.annotations or {}) if pod is not None else {}
    outputs = node.get("outputs") or {}
    return WorkflowRunNode(
        id=node_id,
        name=node.get("name", ""),
        display_name=node.get("displayName"),
        template_name=node.get("templateName") or (node.get("templateRef") or {}).get("template"),
        type=node.get("type", ""),
        phase=node.get("phase"),
        started_at=node.get("startedAt"),
        finished_at=node.get("finishedAt"),
        message=_redacted(node.get("message")),
        boundary_id=node.get("boundaryID"),
        children=node.get("children") or [],
        inputs=_parameters(node.get("inputs")),
        outputs=_parameters(outputs),
        exit_code=outputs.get("exitCode"),
        pod_name=pod.metadata.name if pod is not None else None,
        trace_id=annotations.get(TRACE_ID_ANNOTATION),
        span_id=annotations.get(SPAN_ID_ANNOTATION),
        log=log,
    )


def _parameters(section: Optional[dict]) -> list:
    parameters = []
    for parameter in (section or {}).get("parameters") or []:
        name = parameter.get("name", "")
        value = parameter.get("value")
        parameters.append(WorkflowRunParameter(name=name, value=redact({name: value})[name]))
    return parameters


def _redacted(value: Optional[str]) -> Optional[str]:
    return redact(value) if value else value
