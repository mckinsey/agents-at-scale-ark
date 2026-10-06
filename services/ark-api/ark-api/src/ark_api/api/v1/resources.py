"""Generic Kubernetes resources API endpoints."""
import logging
import re
import yaml

from collections import deque
from datetime import datetime, timezone
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse, PlainTextResponse
from typing import Optional
from kubernetes_asyncio import client
from kubernetes_asyncio.client import CoreV1Api
from kubernetes_asyncio.client.rest import ApiException
from kubernetes_asyncio.dynamic import DynamicClient
from kubernetes_asyncio.dynamic.exceptions import ResourceNotFoundError
from ark_sdk.k8s import get_context
from ark_sdk.impersonation import ImpersonationConfig

from ...auth.dependencies import get_impersonation_config
from ...constants.query_param_descriptions import (
    NAMESPACE_DESCRIPTION,
    LABEL_SELECTOR_DESCRIPTION,
)
from ...models.pod_logs import LogWindow
from ...models.resources import AccessReviewRequest, AccessReviewResponse
from .client_utils import get_impersonating_api_client
from .exceptions import handle_k8s_errors
from .pagination import MAX_PAGE_LIMIT
from .workflow_lifecycle import (
    WORKFLOW_API_VERSION,
    WORKFLOW_KIND,
    LifecyclePreconditionError,
    formulate_resubmit_workflow,
    formulate_resume_workflow,
    formulate_retry_workflow,
    validate_stoppable,
    validate_suspendable,
    workflow_pod_suffix,
)

MERGE_PATCH_CONTENT_TYPE = "application/merge-patch+json"

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/resources", tags=["resources"])

WORKFLOW_PHASE_LABEL = "workflows.argoproj.io/phase"
WORKFLOW_TEMPLATE_LABEL = "workflows.argoproj.io/workflow-template"

# `notin` for "pending" also matches resources where the label is absent
# entirely, which covers a workflow the controller hasn't reconciled yet.
WORKFLOW_STATUS_LABEL_SELECTORS = {
    "succeeded": f"{WORKFLOW_PHASE_LABEL}=Succeeded",
    "running": f"{WORKFLOW_PHASE_LABEL}=Running",
    "failed": f"{WORKFLOW_PHASE_LABEL} in (Failed,Error)",
    "pending": f"{WORKFLOW_PHASE_LABEL} notin (Running,Succeeded,Failed,Error)",
}


def _create_resource_response(data: dict, request: Request) -> Response:
    accept_header = request.headers.get("accept", "application/json")

    if "application/yaml" in accept_header or "text/yaml" in accept_header:
        yaml_content = yaml.safe_dump(data, default_flow_style=False, sort_keys=False)
        return Response(content=yaml_content, media_type="application/yaml")

    return JSONResponse(content=data)


@router.get("/api/{version}/{kind}/{resource_name}")
@handle_k8s_errors(operation="get", resource_type="resource")
async def get_core_resource(
    request: Request,
    version: str,
    kind: str,
    resource_name: str,
    namespace: Optional[str] = Query(None, description=NAMESPACE_DESCRIPTION),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config)
) -> Response:
    """
    Get a core Kubernetes resource by name.

    Args:
        version: API version (e.g., 'v1')
        kind: Kubernetes Kind (e.g., 'Pod', 'Service', 'ConfigMap')
        resource_name: The name of the resource
        namespace: The namespace (defaults to current context)

    Returns:
        Response: The raw Kubernetes resource as JSON

    Examples:
        - GET /v1/resources/api/v1/Pod/my-pod
        - GET /v1/resources/api/v1/Service/my-service
    """
    if namespace is None:
        namespace = get_context()["namespace"]

    async with get_impersonating_api_client(impersonation) as api:
        dynamic_client = await DynamicClient(api)

        api_resource = await dynamic_client.resources.get(
            api_version=version,
            kind=kind
        )

        resource = await api_resource.get(name=resource_name, namespace=namespace)

        return _create_resource_response(resource.to_dict(), request)


@router.get("/api/{version}/{kind}")
@handle_k8s_errors(operation="list", resource_type="resource")
async def list_core_resources(
    request: Request,
    version: str,
    kind: str,
    namespace: Optional[str] = Query(None, description=NAMESPACE_DESCRIPTION),
    label_selector: Optional[str] = Query(None, alias="labelSelector", description=LABEL_SELECTOR_DESCRIPTION),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config)
) -> Response:
    """
    List core Kubernetes resources.

    Args:
        version: API version (e.g., 'v1')
        kind: Kubernetes Kind (e.g., 'Pod', 'Service', 'ConfigMap')
        namespace: The namespace (defaults to current context)
        label_selector: Label selector for filtering resources (e.g., 'app.kubernetes.io/instance=phoenix')

    Returns:
        Response: List of raw Kubernetes resources as JSON

    Examples:
        - GET /v1/resources/api/v1/Pod
        - GET /v1/resources/api/v1/Service
        - GET /v1/resources/api/v1/Service?labelSelector=app.kubernetes.io/instance=phoenix
    """
    if namespace is None:
        namespace = get_context()["namespace"]

    async with get_impersonating_api_client(impersonation) as api:
        dynamic_client = await DynamicClient(api)

        api_resource = await dynamic_client.resources.get(
            api_version=version,
            kind=kind
        )

        resources = await api_resource.get(namespace=namespace, label_selector=label_selector)

        return _create_resource_response(resources.to_dict(), request)


@router.get("/apis/{group}/{version}/{kind}/{resource_name}")
@handle_k8s_errors(operation="get", resource_type="resource")
async def get_grouped_resource(
    request: Request,
    group: str,
    version: str,
    kind: str,
    resource_name: str,
    namespace: Optional[str] = Query(None, description=NAMESPACE_DESCRIPTION),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config)
) -> Response:
    """
    Get a grouped Kubernetes resource by name.

    Args:
        group: API group (e.g., 'apps', 'batch', 'ark.mckinsey.com')
        version: API version (e.g., 'v1', 'v1alpha1')
        kind: Kubernetes Kind (e.g., 'Deployment', 'Job', 'WorkflowTemplate')
        resource_name: The name of the resource
        namespace: The namespace (defaults to current context)

    Returns:
        Response: The raw Kubernetes resource as JSON

    Examples:
        - GET /v1/resources/apis/apps/v1/Deployment/my-deployment
        - GET /v1/resources/apis/batch/v1/Job/my-job
        - GET /v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate/sparkly-bear
    """
    if namespace is None:
        namespace = get_context()["namespace"]

    api_version = f"{group}/{version}"
    logger.info(f"Getting resource: api_version={api_version}, kind={kind}, name={resource_name}, namespace={namespace}")

    async with get_impersonating_api_client(impersonation) as api:
        dynamic_client = await DynamicClient(api)

        api_resource = await dynamic_client.resources.get(
            api_version=api_version,
            kind=kind
        )

        resource = await api_resource.get(name=resource_name, namespace=namespace)

        return _create_resource_response(resource.to_dict(), request)


@router.get("/apis/{group}/{version}/{kind}")
@handle_k8s_errors(operation="list", resource_type="resource")
async def list_grouped_resources(
    request: Request,
    group: str,
    version: str,
    kind: str,
    namespace: Optional[str] = Query(None, description=NAMESPACE_DESCRIPTION),
    label_selector: Optional[str] = Query(None, alias="labelSelector", description=LABEL_SELECTOR_DESCRIPTION),
    workflowName: Optional[str] = Query(None, description="Filter by workflow name (partial match, case insensitive)"),
    workflowTemplateName: Optional[str] = Query(None, description="Filter by workflow template name (exact match)"),
    status: Optional[str] = Query(None, description="Filter by workflow status (case insensitive). Options: running, succeeded, failed (which matches both failed and error), pending"),
    limit: Optional[int] = Query(None, ge=1, le=MAX_PAGE_LIMIT, description="Maximum number of items to return per page (omit for the full list)"),
    continue_token: Optional[str] = Query(None, alias="continue", description="Continuation token returned by the previous page"),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config)
) -> Response:
    """
    List grouped Kubernetes resources with optional filtering and cursor pagination.

    Args:
        group: API group (e.g., 'apps', 'batch', 'ark.mckinsey.com')
        version: API version (e.g., 'v1', 'v1alpha1')
        kind: Kubernetes Kind (e.g., 'Deployment', 'Job', 'WorkflowTemplate')
        namespace: The namespace (defaults to current context)
        label_selector: Label selector for filtering resources (e.g., 'app.kubernetes.io/instance=phoenix')
        workflowName: Filter by workflow name (partial match, case insensitive). Applied only
            to the page returned by this call, not the whole collection — a page can come back
            with few or no matches even though more exist further in the cursor sequence.
        workflowTemplateName: Filter by workflow template name (exact match). Applied
            server-side via a label selector, so pagination stays correct across pages.
        status: Filter by workflow status. Same server-side label selector as
            workflowTemplateName.
        limit: Maximum number of items returned by the underlying Kubernetes list call.
            Omit for the full, unpaginated list (used by non-paginated callers).
        continue_token: Opaque cursor from a previous page's response metadata

    Returns:
        Response: List of raw Kubernetes resources as JSON. When the Kubernetes API has more
            items beyond this page, the response's metadata carries a "continue" token
            (pass it back as ?continue=... for the next page) and "remainingItemCount".

    Note:
        This is Kubernetes' cursor-based pagination, not traditional offset pagination:
        there is no "jump to page N" and no reliable total page count. Pages are walked
        forward only, one continue token at a time.

        Continue-token round trip:
            1. GET .../Workflow?limit=25
               -> response.metadata.continue = "eyJ2IjoxLCJ..."
            2. GET .../Workflow?limit=25&continue=eyJ2IjoxLCJ...
               -> next 25 items, with a new (or absent) "continue" token

    Examples:
        - GET /v1/resources/apis/apps/v1/Deployment
        - GET /v1/resources/apis/batch/v1/Job
        - GET /v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate
        - GET /v1/resources/apis/argoproj.io/v1alpha1/Workflow?workflowName=my-workflow&status=running
        - GET /v1/resources/apis/argoproj.io/v1alpha1/Workflow?limit=25
        - GET /v1/resources/v1/Service?labelSelector=app.kubernetes.io/instance=phoenix
    """
    if namespace is None:
        namespace = get_context()["namespace"]

    api_version = f"{group}/{version}"

    workflow_label_selectors = []
    if kind == "Workflow":
        if workflowTemplateName:
            workflow_label_selectors.append(f"{WORKFLOW_TEMPLATE_LABEL}={workflowTemplateName}")
        if status:
            status_selector = WORKFLOW_STATUS_LABEL_SELECTORS.get(status.lower())
            if status_selector:
                workflow_label_selectors.append(status_selector)
    combined_label_selector = ",".join(filter(None, [label_selector, *workflow_label_selectors]))

    async with get_impersonating_api_client(impersonation) as api:
        dynamic_client = await DynamicClient(api)

        api_resource = await dynamic_client.resources.get(
            api_version=api_version,
            kind=kind
        )

        resources = await api_resource.get(
            namespace=namespace,
            label_selector=combined_label_selector or None,
            limit=limit,
            _continue=continue_token,
        )
        resources_dict = resources.to_dict()

        # workflowName stays a post-fetch partial match, applied only to the
        # page returned by this call, not the whole collection.
        if kind == "Workflow" and workflowName and "items" in resources_dict:
            resources_dict["items"] = [
                item
                for item in resources_dict["items"]
                if workflowName.lower() in item.get("metadata", {}).get("name", "").lower()
            ]

        return _create_resource_response(resources_dict, request)


@router.post("/api/{version}/{kind}")
@handle_k8s_errors(operation="create", resource_type="resource")
async def create_core_resource(
    request: Request,
    version: str,
    kind: str,
    body: dict,
    namespace: Optional[str] = Query(None, description=NAMESPACE_DESCRIPTION),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config)
) -> Response:
    """
    Create a core Kubernetes resource.

    Args:
        version: API version (e.g., 'v1')
        kind: Kubernetes Kind (e.g., 'Pod', 'Service', 'ConfigMap')
        body: The resource definition as JSON
        namespace: The namespace (defaults to current context)

    Returns:
        Response: The created Kubernetes resource as JSON

    Examples:
        - POST /v1/resources/api/v1/Pod
        - POST /v1/resources/api/v1/Service
    """
    if namespace is None:
        namespace = get_context()["namespace"]

    async with get_impersonating_api_client(impersonation) as api:
        dynamic_client = await DynamicClient(api)

        api_resource = await dynamic_client.resources.get(
            api_version=version,
            kind=kind
        )

        resource = await api_resource.create(body=body, namespace=namespace)

        return _create_resource_response(resource.to_dict(), request)


@router.post("/apis/{group}/{version}/{kind}")
@handle_k8s_errors(operation="create", resource_type="resource")
async def create_grouped_resource(
    request: Request,
    group: str,
    version: str,
    kind: str,
    body: dict,
    namespace: Optional[str] = Query(None, description=NAMESPACE_DESCRIPTION),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config)
) -> Response:
    """
    Create a grouped Kubernetes resource.

    Args:
        group: API group (e.g., 'apps', 'batch', 'argoproj.io')
        version: API version (e.g., 'v1', 'v1alpha1')
        kind: Kubernetes Kind (e.g., 'Deployment', 'Job', 'Workflow')
        body: The resource definition as JSON
        namespace: The namespace (defaults to current context)

    Returns:
        Response: The created Kubernetes resource as JSON

    Examples:
        - POST /v1/resources/apis/apps/v1/Deployment
        - POST /v1/resources/apis/batch/v1/Job
        - POST /v1/resources/apis/argoproj.io/v1alpha1/Workflow
    """
    if namespace is None:
        namespace = get_context()["namespace"]

    api_version = f"{group}/{version}"
    logger.info(f"Creating resource: api_version={api_version}, kind={kind}, namespace={namespace}")

    async with get_impersonating_api_client(impersonation) as api:
        dynamic_client = await DynamicClient(api)

        api_resource = await dynamic_client.resources.get(
            api_version=api_version,
            kind=kind
        )

        resource = await api_resource.create(body=body, namespace=namespace)

        return _create_resource_response(resource.to_dict(), request)


@router.put("/api/{version}/{kind}/{resource_name}")
@handle_k8s_errors(operation="update", resource_type="resource")
async def update_core_resource(
    request: Request,
    version: str,
    kind: str,
    resource_name: str,
    body: dict,
    namespace: Optional[str] = Query(None, description=NAMESPACE_DESCRIPTION),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config)
) -> Response:
    """
    Update (replace) a core Kubernetes resource by name.

    Honours a caller-supplied resourceVersion for optimistic concurrency; only
    when the caller omits it do we inject the live object's resourceVersion so
    the replace succeeds (last-write-wins convenience). The URL path name is
    authoritative for the target resource.

    Args:
        version: API version (e.g., 'v1')
        kind: Kubernetes Kind (e.g., 'Pod', 'Service', 'ConfigMap')
        resource_name: The name of the resource
        body: The resource definition as JSON
        namespace: The namespace (defaults to current context)

    Returns:
        Response: The updated Kubernetes resource as JSON

    Examples:
        - PUT /v1/resources/api/v1/ConfigMap/my-config
        - PUT /v1/resources/api/v1/Service/my-service
    """
    if namespace is None:
        namespace = get_context()["namespace"]

    async with get_impersonating_api_client(impersonation) as api:
        dynamic_client = await DynamicClient(api)

        api_resource = await dynamic_client.resources.get(
            api_version=version,
            kind=kind
        )

        metadata = body.setdefault("metadata", {})
        if not metadata.get("resourceVersion"):
            existing = await api_resource.get(name=resource_name, namespace=namespace)
            metadata["resourceVersion"] = existing.metadata.resourceVersion

        resource = await api_resource.replace(name=resource_name, body=body, namespace=namespace)

        return _create_resource_response(resource.to_dict(), request)


@router.put("/apis/{group}/{version}/{kind}/{resource_name}")
@handle_k8s_errors(operation="update", resource_type="resource")
async def update_grouped_resource(
    request: Request,
    group: str,
    version: str,
    kind: str,
    resource_name: str,
    body: dict,
    namespace: Optional[str] = Query(None, description=NAMESPACE_DESCRIPTION),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config)
) -> Response:
    """
    Update (replace) a grouped Kubernetes resource by name.

    Honours a caller-supplied resourceVersion for optimistic concurrency; only
    when the caller omits it do we inject the live object's resourceVersion so
    the replace succeeds (last-write-wins convenience). The URL path name is
    authoritative for the target resource.

    Args:
        group: API group (e.g., 'apps', 'batch', 'argoproj.io')
        version: API version (e.g., 'v1', 'v1alpha1')
        kind: Kubernetes Kind (e.g., 'Deployment', 'Job', 'WorkflowTemplate')
        resource_name: The name of the resource
        body: The resource definition as JSON
        namespace: The namespace (defaults to current context)

    Returns:
        Response: The updated Kubernetes resource as JSON

    Examples:
        - PUT /v1/resources/apis/apps/v1/Deployment/my-deployment
        - PUT /v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate/sparkly-bear
    """
    if namespace is None:
        namespace = get_context()["namespace"]

    api_version = f"{group}/{version}"
    logger.info(f"Updating resource: api_version={api_version}, kind={kind}, name={resource_name}, namespace={namespace}")

    async with get_impersonating_api_client(impersonation) as api:
        dynamic_client = await DynamicClient(api)

        api_resource = await dynamic_client.resources.get(
            api_version=api_version,
            kind=kind
        )

        metadata = body.setdefault("metadata", {})
        if not metadata.get("resourceVersion"):
            existing = await api_resource.get(name=resource_name, namespace=namespace)
            metadata["resourceVersion"] = existing.metadata.resourceVersion

        resource = await api_resource.replace(name=resource_name, body=body, namespace=namespace)

        return _create_resource_response(resource.to_dict(), request)


@router.post("/access-review", response_model=AccessReviewResponse)
@handle_k8s_errors(operation="create", resource_type="access review")
async def create_access_review(
    body: AccessReviewRequest,
    namespace: Optional[str] = Query(None, description=NAMESPACE_DESCRIPTION),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config)
) -> AccessReviewResponse:
    """
    Check whether the caller may perform a verb on a resource via SelfSubjectAccessReview.

    Runs under the impersonated identity, so the result reflects the user's RBAC.
    When impersonation is disabled it runs as the service account.

    Args:
        body: group, resource, and verb to review
        namespace: The namespace (defaults to current context)

    Returns:
        AccessReviewResponse: {"allowed": <bool>}

    Examples:
        - POST /v1/resources/access-review
    """
    if namespace is None:
        namespace = get_context()["namespace"]

    async with get_impersonating_api_client(impersonation) as api:
        review = client.V1SelfSubjectAccessReview(
            spec=client.V1SelfSubjectAccessReviewSpec(
                resource_attributes=client.V1ResourceAttributes(
                    namespace=namespace,
                    verb=body.verb,
                    group=body.group,
                    resource=body.resource,
                )
            )
        )
        result = await client.AuthorizationV1Api(api).create_self_subject_access_review(review)
        allowed = bool(result.status and result.status.allowed)

        return AccessReviewResponse(allowed=allowed)


@router.delete("/api/{version}/{kind}/{resource_name}")
@handle_k8s_errors(operation="delete", resource_type="resource")
async def delete_core_resource(
    version: str,
    kind: str,
    resource_name: str,
    namespace: Optional[str] = Query(None, description=NAMESPACE_DESCRIPTION),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config)
) -> Response:
    """
    Delete a core Kubernetes resource by name.

    Args:
        version: API version (e.g., 'v1')
        kind: Kubernetes Kind (e.g., 'Pod', 'Service', 'ConfigMap')
        resource_name: The name of the resource
        namespace: The namespace (defaults to current context)

    Returns:
        Response: HTTP 204 No Content on success

    Examples:
        - DELETE /v1/resources/api/v1/Pod/my-pod
        - DELETE /v1/resources/api/v1/Service/my-service
    """
    if namespace is None:
        namespace = get_context()["namespace"]

    async with get_impersonating_api_client(impersonation) as api:
        dynamic_client = await DynamicClient(api)

        api_resource = await dynamic_client.resources.get(
            api_version=version,
            kind=kind
        )

        await api_resource.delete(name=resource_name, namespace=namespace)

        return Response(status_code=204)


@router.delete("/apis/{group}/{version}/{kind}/{resource_name}")
@handle_k8s_errors(operation="delete", resource_type="resource")
async def delete_grouped_resource(
    group: str,
    version: str,
    kind: str,
    resource_name: str,
    namespace: Optional[str] = Query(None, description=NAMESPACE_DESCRIPTION),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config)
) -> Response:
    """
    Delete a grouped Kubernetes resource by name.

    Args:
        group: API group (e.g., 'apps', 'batch', 'ark.mckinsey.com')
        version: API version (e.g., 'v1', 'v1alpha1')
        kind: Kubernetes Kind (e.g., 'Deployment', 'Job', 'WorkflowTemplate')
        resource_name: The name of the resource
        namespace: The namespace (defaults to current context)

    Returns:
        Response: HTTP 204 No Content on success

    Examples:
        - DELETE /v1/resources/apis/apps/v1/Deployment/my-deployment
        - DELETE /v1/resources/apis/batch/v1/Job/my-job
        - DELETE /v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate/sparkly-bear
    """
    if namespace is None:
        namespace = get_context()["namespace"]

    api_version = f"{group}/{version}"
    logger.info(f"Deleting resource: api_version={api_version}, kind={kind}, name={resource_name}, namespace={namespace}")

    async with get_impersonating_api_client(impersonation) as api:
        dynamic_client = await DynamicClient(api)

        api_resource = await dynamic_client.resources.get(
            api_version=api_version,
            kind=kind
        )

        await api_resource.delete(name=resource_name, namespace=namespace)

        return Response(status_code=204)


@router.get("/api/v1/namespaces/{namespace}/pods/{pod_name}/log")
@handle_k8s_errors(operation="get", resource_type="pod logs")
async def get_pod_logs(
    pod_name: str,
    namespace: str,
    container: Optional[str] = Query(None, description="Container name (defaults to first container)"),
    tail_lines: Optional[int] = Query(1000, alias="tailLines", description="Number of lines to tail"),
    follow: Optional[bool] = Query(False, description="Follow log stream"),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> PlainTextResponse:
    """
    Get logs from a pod.

    Args:
        pod_name: Name of the pod
        namespace: Namespace of the pod
        container: Optional container name
        tail_lines: Number of lines to return from the end of the logs
        follow: Whether to follow the log stream

    Returns:
        PlainTextResponse: Pod logs as plain text

    Examples:
        - GET /v1/resources/api/v1/namespaces/default/pods/my-pod/log
        - GET /v1/resources/api/v1/namespaces/default/pods/my-pod/log?container=main&tailLines=100
    """
    async with get_impersonating_api_client(impersonation) as api:
        core_v1 = CoreV1Api(api)
        
        try:
            logs = await core_v1.read_namespaced_pod_log(
                name=pod_name,
                namespace=namespace,
                container=container,
                tail_lines=tail_lines,
                follow=follow,
            )
            return PlainTextResponse(content=logs)
        except Exception as e:
            logger.error(f"Failed to fetch logs for pod {pod_name}: {e}")
            return PlainTextResponse(content=f"Error fetching logs: {str(e)}", status_code=500)


@router.get("/apis/argoproj.io/v1alpha1/namespaces/{namespace}/workflows/{workflow_name}/{node_id}/log")
async def get_workflow_logs(
    workflow_name: str,
    node_id: str,
    namespace: str,
    container: Optional[str] = Query("main", description="Container name"),
    tail_lines: Optional[int] = Query(1000, description="Number of lines to tail"),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> PlainTextResponse:
    """
    Get logs for a workflow node by fetching directly from the pod.
    The node_id corresponds to the pod name in most cases.

    Args:
        workflow_name: Name of the workflow
        node_id: Node ID within the workflow (typically the pod name)
        namespace: Namespace of the workflow
        container: Container name (defaults to 'main')
        tail_lines: Number of lines to tail from the end

    Returns:
        PlainTextResponse: Workflow node logs as plain text

    Examples:
        - GET /v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/my-workflow/my-node-id/log
    """
    async with get_impersonating_api_client(impersonation) as api:
        core_v1 = CoreV1Api(api)
        
        try:
            # First, try the node ID directly as the pod name
            try:
                logs = await core_v1.read_namespaced_pod_log(
                    name=node_id,
                    namespace=namespace,
                    container=container,
                    tail_lines=tail_lines,
                )
                return PlainTextResponse(content=logs if logs else "No logs available.")
            except Exception:
                pass  # Try alternative lookup method
            
            # If direct lookup fails, search for pods by workflow label and node ID suffix
            # The node ID might not be the exact pod name - Argo sometimes inserts the template name
            node_id_suffix = node_id.split('-')[-1]
            
            pods = await core_v1.list_namespaced_pod(
                namespace=namespace,
                label_selector=f"workflows.argoproj.io/workflow={workflow_name}"
            )
            
            # Find pod whose name ends with the node ID suffix
            matching_pod = None
            for pod in pods.items:
                if pod.metadata.name.endswith(node_id_suffix):
                    matching_pod = pod.metadata.name
                    break
            
            if not matching_pod:
                logger.error(f"No pod found matching node ID {node_id} (suffix: {node_id_suffix})")
                raise Exception(f"No pod found for node {node_id}")
            
            logs = await core_v1.read_namespaced_pod_log(
                name=matching_pod,
                namespace=namespace,
                container=container,
                tail_lines=tail_lines,
            )
            return PlainTextResponse(content=logs if logs else "No logs available.")
            
        except Exception as e:
            logger.error(f"Failed to fetch logs for node {node_id}: {e}")
            
            # Try to determine if the pod was deleted
            try:
                dynamic_client = await DynamicClient(api)
                workflow_resource = await dynamic_client.resources.get(
                    api_version=WORKFLOW_API_VERSION,
                    kind=WORKFLOW_KIND
                )
                workflow = await workflow_resource.get(name=workflow_name, namespace=namespace)
                workflow_dict = workflow.to_dict()
                
                nodes = workflow_dict.get("status", {}).get("nodes", {})
                node = nodes.get(node_id)
                
                if not node:
                    return PlainTextResponse(
                        content=f"Node {node_id} not found in workflow {workflow_name}",
                        status_code=404
                    )
                
                if node.get("type") == "Pod" and node.get("phase") in ["Succeeded", "Failed", "Error"]:
                    return PlainTextResponse(
                        content="Pod has been deleted. Logs are no longer available.\n\nTo preserve logs, enable 'archiveLogs: true' in your workflow spec with artifact storage configured.",
                        status_code=404
                    )
                
                return PlainTextResponse(
                    content=f"Failed to fetch logs: {str(e)}",
                    status_code=500
                )
                
            except Exception as inner_e:
                logger.error(f"Failed to query workflow for node info: {inner_e}")
                return PlainTextResponse(
                    content=f"Failed to fetch logs: {str(e)}",
                    status_code=500
                )


LOG_STREAM_CHUNK_BYTES = 65536
LOG_WINDOW_DEFAULT_MAX_LINES = 1000
LOG_WINDOW_MAX_LINES_LIMIT = 10000
LOG_WINDOW_DEFAULT_MAX_BYTES = 1024 * 1024
LOG_WINDOW_MAX_BYTES_LIMIT = 16 * 1024 * 1024
LOG_WINDOW_SINCE_SLACK_SECONDS = 2
LOG_WINDOW_TAIL_GROWTH_FACTOR = 8
LOG_WINDOW_TAIL_MAX_ATTEMPTS = 5
LOG_WINDOW_HEAD_PROBE_BYTES = 64
POD_DELETED_MESSAGE = (
    "Pod has been deleted. Logs are no longer available.\n\n"
    "To preserve logs, enable 'archiveLogs: true' in your workflow spec "
    "with artifact storage configured."
)
LOG_TIMESTAMP_PATTERN = re.compile(r"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z?")


def _normalize_log_timestamp(timestamp: str) -> str:
    match = LOG_TIMESTAMP_PATTERN.fullmatch(timestamp)
    if not match:
        return timestamp
    fraction = (match.group(2) or "").ljust(9, "0")[:9]
    return f"{match.group(1)}.{fraction}Z"


def _parse_log_timestamp(timestamp: str) -> Optional[datetime]:
    if not LOG_TIMESTAMP_PATTERN.fullmatch(timestamp):
        return None
    normalized = _normalize_log_timestamp(timestamp)
    try:
        return datetime.fromisoformat(f"{normalized[:26]}+00:00")
    except ValueError:
        return None


def _split_log_line(raw_line: str) -> tuple[Optional[str], str]:
    timestamp, separator, text = raw_line.partition(" ")
    if separator and _parse_log_timestamp(timestamp) is not None:
        return timestamp, text
    return None, raw_line


def _validate_log_window_cursors(since_timestamp: Optional[str], before_timestamp: Optional[str]) -> None:
    for name, value in (("since_timestamp", since_timestamp), ("before_timestamp", before_timestamp)):
        if value is not None and _parse_log_timestamp(value) is None:
            raise HTTPException(
                status_code=422,
                detail=f"{name} must be an RFC3339 timestamp such as 2024-01-01T00:00:00.000000000Z, got '{value}'",
            )


def _since_seconds_for(since_timestamp: str) -> Optional[int]:
    parsed = _parse_log_timestamp(since_timestamp)
    if parsed is None:
        return None
    elapsed = (datetime.now(timezone.utc) - parsed).total_seconds()
    return max(1, ceil(elapsed) + LOG_WINDOW_SINCE_SLACK_SECONDS)


class _LogWindowCollector:
    """Collects a bounded slice of a log stream.

    ``keep_newest`` picks which end survives the byte budget: history pages
    keep the newest lines of the window so they sit flush against what the
    client already holds, while append pages keep the oldest new lines so the
    client's timestamp cursor advances without leaving a gap.

    ``head_timestamp`` and ``head_line_bytes`` describe the first line still
    retained by the kubelet, which is how a page recognises that it has reached
    the start of the log rather than a chunk part-way through that line.
    """

    def __init__(
        self,
        read_limit: int,
        max_bytes: int,
        min_timestamp: Optional[str],
        max_timestamp: Optional[str],
        keep_newest: bool,
        head_timestamp: Optional[str] = None,
        head_line_bytes: int = 0,
    ):
        self.read_limit = read_limit
        self.max_bytes = max_bytes
        self.min_timestamp = _normalize_log_timestamp(min_timestamp) if min_timestamp else None
        self.max_timestamp = _normalize_log_timestamp(max_timestamp) if max_timestamp else None
        self.keep_newest = keep_newest
        self.head_timestamp = _normalize_log_timestamp(head_timestamp) if head_timestamp else None
        self.head_line_bytes = head_line_bytes
        self.lines: deque[str] = deque()
        self.timestamps: deque[Optional[str]] = deque()
        self.admitted = 0
        self.lines_read = 0
        self.bytes_read = 0
        self.dropped_from_front = 0
        self.reached_known_lines = False
        self.first_read_timestamp: Optional[str] = None
        self.first_read_line_bytes = 0
        self.byte_count = 0
        self.truncated = False

    @property
    def done(self) -> bool:
        if self.keep_newest:
            return self.max_timestamp is not None and self.reached_known_lines
        return self.admitted >= self.read_limit or self.truncated

    @property
    def range_reaches_log_start(self) -> bool:
        if self.head_timestamp is None or self.first_read_timestamp is None:
            return False
        if self.first_read_line_bytes < self.head_line_bytes:
            return False
        return _normalize_log_timestamp(self.first_read_timestamp) <= self.head_timestamp

    @property
    def page_is_whole(self) -> bool:
        """Whether the oldest served line is known to be a complete line.

        The kubelet counts 16KB file chunks rather than logical lines, so the
        oldest line of a tail range can be the tail end of a longer line. A
        line is known to be whole once an older line was read and dropped, or
        once the range reaches the start of the log.
        """
        return self.dropped_from_front > 0 or self.range_reaches_log_start

    def _within_cursors(self, timestamp: Optional[str]) -> bool:
        if self.min_timestamp is not None:
            if timestamp is None or _normalize_log_timestamp(timestamp) <= self.min_timestamp:
                return False
        if self.max_timestamp is not None:
            if timestamp is not None and _normalize_log_timestamp(timestamp) >= self.max_timestamp:
                self.reached_known_lines = True
                return False
        return True

    def add(self, raw_line: str) -> None:
        timestamp, text = _split_log_line(raw_line)
        if self.first_read_timestamp is None and timestamp is not None:
            self.first_read_timestamp = timestamp
        if self.lines_read == 0:
            self.first_read_line_bytes = len(raw_line.encode("utf-8"))
        self.lines_read += 1
        self.bytes_read += len(raw_line.encode("utf-8")) + 1

        if not self._within_cursors(timestamp):
            return
        if not self.keep_newest and self.admitted >= self.read_limit:
            return

        if len(text.encode("utf-8")) > self.max_bytes:
            text = text.encode("utf-8")[: self.max_bytes].decode("utf-8", errors="ignore")
            self.truncated = True

        self.lines.append(text)
        self.timestamps.append(timestamp)
        self.admitted += 1
        self.byte_count += len(text.encode("utf-8")) + 1

        while self.byte_count > self.max_bytes and len(self.lines) > 1:
            self.truncated = True
            if not self.keep_newest:
                self.lines.pop()
                self.timestamps.pop()
                self.admitted -= 1
                break
            dropped = self.lines.popleft()
            self.timestamps.popleft()
            self.byte_count -= len(dropped.encode("utf-8")) + 1
            self.dropped_from_front += 1

        while self.keep_newest and len(self.lines) > self.read_limit:
            dropped = self.lines.popleft()
            self.timestamps.popleft()
            self.byte_count -= len(dropped.encode("utf-8")) + 1
            self.admitted -= 1
            self.dropped_from_front += 1

    def build(self, expect_more_before: bool) -> LogWindow:
        lines = list(self.lines)
        known_timestamps = [value for value in self.timestamps if value]
        content = "\n".join(lines)
        reached_log_start = self.dropped_from_front == 0 and self.range_reaches_log_start
        has_more_before = expect_more_before and bool(lines) and not reached_log_start

        return LogWindow(
            content=content,
            line_count=len(lines),
            first_timestamp=known_timestamps[0] if known_timestamps else None,
            last_timestamp=known_timestamps[-1] if known_timestamps else None,
            has_more_before=has_more_before,
            truncated=self.truncated,
            byte_count=len(content.encode("utf-8")),
        )


async def _open_pod_log_stream(core_v1: CoreV1Api, namespace: str, pod_name: str, **kwargs):
    response = await core_v1.read_namespaced_pod_log(
        name=pod_name,
        namespace=namespace,
        timestamps=True,
        _preload_content=False,
        **kwargs,
    )
    if not 200 <= response.status <= 299:
        body = await response.text()
        response.release()
        raise ApiException(status=response.status, reason=body)
    return response


async def _collect_log_window(
    response, collector: _LogWindowCollector, limit_bytes: Optional[int] = None
) -> None:
    pending = b""
    received = 0
    async for chunk in response.content.iter_chunked(LOG_STREAM_CHUNK_BYTES):
        if collector.done:
            break
        received += len(chunk)
        pending += chunk
        *complete, pending = pending.split(b"\n")
        for raw_line in complete:
            collector.add(raw_line.decode("utf-8", errors="replace"))
            if collector.done:
                return
    if not pending or collector.done:
        return
    if limit_bytes is not None and received >= limit_bytes:
        collector.truncated = True
        if collector.lines:
            return
    collector.add(pending.decode("utf-8", errors="replace"))


async def _measure_first_line(response, max_bytes: int) -> tuple[bytes, int]:
    """Opening bytes and byte length of the first streamed line, read no further than needed."""
    head = b""
    measured = 0
    async for chunk in response.content.iter_chunked(LOG_STREAM_CHUNK_BYTES):
        if not head:
            head = chunk[:LOG_WINDOW_HEAD_PROBE_BYTES]
        newline = chunk.find(b"\n")
        if newline >= 0:
            measured += newline
            break
        measured += len(chunk)
        if measured >= max_bytes:
            break
    return head, measured


async def _read_log_head_line(
    core_v1: CoreV1Api,
    namespace: str,
    pod_name: str,
    container: Optional[str],
    max_bytes: int,
) -> tuple[Optional[str], int]:
    """Timestamp and byte length of the oldest line the kubelet still retains."""
    response = await _open_pod_log_stream(
        core_v1,
        namespace,
        pod_name,
        container=container,
        limit_bytes=max_bytes,
    )
    try:
        head, line_bytes = await _measure_first_line(response, max_bytes)
    finally:
        response.release()

    timestamp, _ = _split_log_line(head.decode("utf-8", errors="replace"))
    return timestamp, line_bytes


async def _measure_boundary_line_bytes(
    core_v1: CoreV1Api,
    namespace: str,
    pod_name: str,
    container: Optional[str],
    skip_tail_lines: int,
    max_bytes: int,
) -> int:
    """Measure the newest line of the requested window without reading past it."""
    response = await _open_pod_log_stream(
        core_v1,
        namespace,
        pod_name,
        container=container,
        tail_lines=skip_tail_lines + 1,
    )
    try:
        _, measured = await _measure_first_line(response, max_bytes)
    finally:
        response.release()
    return measured


def _lines_within_budget(line_bytes: int, max_bytes: int, max_lines: int) -> int:
    """How many lines of the measured size fit the byte budget."""
    if line_bytes <= 0:
        return max_lines
    return max(1, min(max_lines, max_bytes // (line_bytes + 1)))


async def _read_log_window(
    core_v1: CoreV1Api,
    namespace: str,
    pod_name: str,
    container: Optional[str],
    max_lines: int,
    skip_tail_lines: int,
    since_timestamp: Optional[str],
    before_timestamp: Optional[str],
    max_bytes: int,
) -> LogWindow:
    """Read a bounded window of a pod log without buffering the whole log."""
    since_seconds = _since_seconds_for(since_timestamp) if since_timestamp else None

    if since_seconds is not None:
        return await _read_appended_window(
            core_v1, namespace, pod_name, container, max_lines, since_seconds, since_timestamp, max_bytes
        )

    return await _read_history_window(
        core_v1, namespace, pod_name, container, max_lines, skip_tail_lines, before_timestamp, max_bytes
    )


async def _read_appended_window(
    core_v1: CoreV1Api,
    namespace: str,
    pod_name: str,
    container: Optional[str],
    max_lines: int,
    since_seconds: int,
    since_timestamp: str,
    max_bytes: int,
) -> LogWindow:
    response = await _open_pod_log_stream(
        core_v1,
        namespace,
        pod_name,
        container=container,
        since_seconds=since_seconds,
        limit_bytes=max_bytes,
    )
    collector = _LogWindowCollector(
        max_lines,
        max_bytes,
        since_timestamp,
        None,
        keep_newest=False,
    )
    try:
        await _collect_log_window(response, collector, limit_bytes=max_bytes)
    finally:
        response.release()

    return collector.build(expect_more_before=False)


async def _read_history_window(
    core_v1: CoreV1Api,
    namespace: str,
    pod_name: str,
    container: Optional[str],
    max_lines: int,
    skip_tail_lines: int,
    before_timestamp: Optional[str],
    max_bytes: int,
) -> LogWindow:
    """Read the page of lines sitting just older than the client's cursor.

    ``tail_lines`` is only an estimate of how far back to start: the kubelet
    counts 16KB file chunks, so a log with very long lines needs far more of
    them than it has lines. ``before_timestamp`` is the real cursor, and the
    request is retried with a larger tail until the page it produces is both
    non-empty and known to start on a line boundary.

    When the client has no ``before_timestamp`` to give — the tail buffer
    trimmed the line the cursor pointed at — ``skip_tail_lines`` is the cursor:
    return the page sitting just older than it, not the tail.
    """
    head_timestamp, head_line_bytes = await _read_log_head_line(
        core_v1, namespace, pod_name, container, max_bytes
    )
    line_bytes = await _measure_boundary_line_bytes(
        core_v1, namespace, pod_name, container, skip_tail_lines, max_bytes
    )
    read_limit = _lines_within_budget(line_bytes, max_bytes, max_lines)

    if before_timestamp is None and skip_tail_lines > 0:
        return await _read_skip_history_window(
            core_v1,
            namespace,
            pod_name,
            container,
            read_limit,
            skip_tail_lines,
            max_bytes,
            head_timestamp,
            head_line_bytes,
        )

    tail_lines = skip_tail_lines + read_limit + 1
    window = None

    for attempt in range(LOG_WINDOW_TAIL_MAX_ATTEMPTS):
        response = await _open_pod_log_stream(
            core_v1,
            namespace,
            pod_name,
            container=container,
            tail_lines=tail_lines,
        )
        collector = _LogWindowCollector(
            read_limit,
            max_bytes,
            None,
            before_timestamp,
            keep_newest=True,
            head_timestamp=head_timestamp,
            head_line_bytes=head_line_bytes,
        )
        try:
            await _collect_log_window(response, collector)
        finally:
            response.release()

        window = collector.build(expect_more_before=True)
        is_last_attempt = attempt == LOG_WINDOW_TAIL_MAX_ATTEMPTS - 1
        if is_last_attempt or collector.page_is_whole:
            return window

        tail_lines *= LOG_WINDOW_TAIL_GROWTH_FACTOR

    return window


async def _read_skip_history_window(
    core_v1: CoreV1Api,
    namespace: str,
    pod_name: str,
    container: Optional[str],
    read_limit: int,
    skip_tail_lines: int,
    max_bytes: int,
    head_timestamp: Optional[str],
    head_line_bytes: int,
) -> LogWindow:
    """Read the page ``skip_tail_lines`` from the end when there is no timestamp cursor.

    Fallback for when the client has no ``before_timestamp`` to give. The last
    ``skip_tail_lines + read_limit`` lines are read and the oldest ``read_limit``
    of them are kept, which is positions ``skip_tail_lines + 1 … skip_tail_lines
    + read_limit`` from the end — the page sitting flush against and just older
    than the client's current oldest line, including the line directly adjacent
    to it rather than skipping it.
    """
    tail_lines = skip_tail_lines + read_limit
    response = await _open_pod_log_stream(
        core_v1,
        namespace,
        pod_name,
        container=container,
        tail_lines=tail_lines,
    )
    collector = _LogWindowCollector(
        read_limit,
        max_bytes,
        None,
        None,
        keep_newest=False,
        head_timestamp=head_timestamp,
        head_line_bytes=head_line_bytes,
    )
    try:
        await _collect_log_window(response, collector)
    finally:
        response.release()

    return collector.build(expect_more_before=True)


async def _resolve_workflow_pod_name(
    core_v1: CoreV1Api,
    namespace: str,
    workflow_name: str,
    node_id: str,
) -> str:
    """Resolve an Argo node ID to the pod holding its logs."""
    try:
        await core_v1.read_namespaced_pod(name=node_id, namespace=namespace)
        return node_id
    except ApiException:
        pass

    node_id_suffix = node_id.split("-")[-1]
    pods = await core_v1.list_namespaced_pod(
        namespace=namespace,
        label_selector=f"workflows.argoproj.io/workflow={workflow_name}",
    )
    for pod in pods.items:
        if pod.metadata.name.endswith(node_id_suffix):
            return pod.metadata.name

    raise HTTPException(status_code=404, detail=f"No pod found for node {node_id}")


async def _workflow_node_unavailable_detail(
    api,
    namespace: str,
    workflow_name: str,
    node_id: str,
) -> str:
    fallback = f"Logs are not available for node {node_id}"
    dynamic_client = await DynamicClient(api)
    try:
        workflow_resource = await dynamic_client.resources.get(
            api_version=WORKFLOW_API_VERSION,
            kind=WORKFLOW_KIND,
        )
    except ResourceNotFoundError:
        logger.warning("Workflow CRD is not installed; cannot explain missing logs for node %s", node_id)
        return fallback
    try:
        workflow = await workflow_resource.get(name=workflow_name, namespace=namespace)
    except ApiException as e:
        if e.status == 404:
            return f"Workflow {workflow_name} not found in namespace {namespace}"
        raise HTTPException(status_code=e.status, detail=e.reason) from e
    nodes = workflow.to_dict().get("status", {}).get("nodes", {})
    node = nodes.get(node_id)

    if not node:
        return f"Node {node_id} not found in workflow {workflow_name}"
    if node.get("type") == "Pod" and node.get("phase") in ["Succeeded", "Failed", "Error"]:
        return POD_DELETED_MESSAGE
    return fallback


@router.get("/api/v1/namespaces/{namespace}/pods/{pod_name}/log/window")
@handle_k8s_errors(operation="get", resource_type="pod logs")
async def get_pod_log_window(
    pod_name: str,
    namespace: str,
    container: Optional[str] = Query(None, description="Container name (defaults to first container)"),
    max_lines: int = Query(LOG_WINDOW_DEFAULT_MAX_LINES, ge=1, le=LOG_WINDOW_MAX_LINES_LIMIT, description="Maximum lines in this page"),
    skip_tail_lines: int = Query(0, ge=0, description="Lines to skip back from the end of the log"),
    since_timestamp: Optional[str] = Query(None, description="Return only lines newer than this RFC3339 timestamp"),
    before_timestamp: Optional[str] = Query(None, description="Return only lines older than this RFC3339 timestamp"),
    max_bytes: int = Query(LOG_WINDOW_DEFAULT_MAX_BYTES, ge=1024, le=LOG_WINDOW_MAX_BYTES_LIMIT, description="Byte cap for this page"),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> LogWindow:
    """
    Get a bounded window of a pod's logs.

    Pages are anchored at the end of the log. Omit skip_tail_lines for the
    tail, raise it by the returned line_count to walk backwards, or pass
    since_timestamp to fetch only lines newer than an earlier page.

    Examples:
        - GET /v1/resources/api/v1/namespaces/default/pods/my-pod/log/window
        - GET /v1/resources/api/v1/namespaces/default/pods/my-pod/log/window?skip_tail_lines=1000
    """
    _validate_log_window_cursors(since_timestamp, before_timestamp)
    async with get_impersonating_api_client(impersonation) as api:
        core_v1 = CoreV1Api(api)
        return await _read_log_window(
            core_v1,
            namespace,
            pod_name,
            container,
            max_lines,
            skip_tail_lines,
            since_timestamp,
            before_timestamp,
            max_bytes,
        )


@router.get("/apis/argoproj.io/v1alpha1/namespaces/{namespace}/workflows/{workflow_name}/{node_id}/log/window")
@handle_k8s_errors(operation="get", resource_type="workflow")
async def get_workflow_log_window(
    workflow_name: str,
    node_id: str,
    namespace: str,
    container: Optional[str] = Query("main", description="Container name"),
    max_lines: int = Query(LOG_WINDOW_DEFAULT_MAX_LINES, ge=1, le=LOG_WINDOW_MAX_LINES_LIMIT, description="Maximum lines in this page"),
    skip_tail_lines: int = Query(0, ge=0, description="Lines to skip back from the end of the log"),
    since_timestamp: Optional[str] = Query(None, description="Return only lines newer than this RFC3339 timestamp"),
    before_timestamp: Optional[str] = Query(None, description="Return only lines older than this RFC3339 timestamp"),
    max_bytes: int = Query(LOG_WINDOW_DEFAULT_MAX_BYTES, ge=1024, le=LOG_WINDOW_MAX_BYTES_LIMIT, description="Byte cap for this page"),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> LogWindow:
    """
    Get a bounded window of an Argo workflow node's logs.

    Resolves the node to its pod, then pages exactly like the pod log window
    endpoint. Returns 404 with guidance when the pod is already gone.

    Examples:
        - GET /v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/my-workflow/my-node-id/log/window
    """
    _validate_log_window_cursors(since_timestamp, before_timestamp)
    async with get_impersonating_api_client(impersonation) as api:
        core_v1 = CoreV1Api(api)
        try:
            pod_name = await _resolve_workflow_pod_name(core_v1, namespace, workflow_name, node_id)
            return await _read_log_window(
                core_v1,
                namespace,
                pod_name,
                container,
                max_lines,
                skip_tail_lines,
                since_timestamp,
                before_timestamp,
                max_bytes,
            )
        except (ApiException, HTTPException) as e:
            status = e.status if isinstance(e, ApiException) else e.status_code
            if status != 404:
                raise
            logger.info(f"No live logs for node {node_id}, explaining why: {e}")
            detail = await _workflow_node_unavailable_detail(api, namespace, workflow_name, node_id)
            raise HTTPException(status_code=404, detail=detail) from e


async def _get_workflow_resource(dynamic_client: DynamicClient):
    return await dynamic_client.resources.get(
        api_version=WORKFLOW_API_VERSION,
        kind=WORKFLOW_KIND,
    )


async def _patch_workflow_spec(
    request: Request,
    workflow_name: str,
    namespace: str,
    patch_spec: dict,
    impersonation: Optional[ImpersonationConfig],
) -> Response:
    """Apply a merge patch to a Workflow's spec (used by suspend/stop/terminate)."""
    async with get_impersonating_api_client(impersonation) as api:
        dynamic_client = await DynamicClient(api)
        workflow_resource = await _get_workflow_resource(dynamic_client)
        patched = await workflow_resource.patch(
            name=workflow_name,
            namespace=namespace,
            body={"spec": patch_spec},
            content_type=MERGE_PATCH_CONTENT_TYPE,
        )
        return _create_resource_response(patched.to_dict(), request)


async def _replace_workflow(
    request: Request,
    workflow_name: str,
    namespace: str,
    mutate,
    delete_pods: bool,
    impersonation: Optional[ImpersonationConfig],
) -> Response:
    """Read a Workflow, apply a pure CR mutation, and write it back with a full replace.

    ``mutate`` receives the workflow dict and returns either the mutated
    workflow or a (workflow, pod_node_ids) tuple. When ``delete_pods`` is set,
    the pods backing those node IDs are deleted before the workflow is written.
    """
    async with get_impersonating_api_client(impersonation) as api:
        dynamic_client = await DynamicClient(api)
        workflow_resource = await _get_workflow_resource(dynamic_client)
        existing = await workflow_resource.get(name=workflow_name, namespace=namespace)
        workflow = existing.to_dict()

        try:
            result = mutate(workflow)
        except LifecyclePreconditionError as e:
            raise HTTPException(status_code=409, detail=str(e)) from e

        pod_node_ids: list[str] = []
        if isinstance(result, tuple):
            new_workflow, pod_node_ids = result
        else:
            new_workflow = result

        if delete_pods and pod_node_ids:
            await _delete_workflow_pods(api, namespace, workflow_name, pod_node_ids)

        replaced = await workflow_resource.replace(
            name=workflow_name,
            namespace=namespace,
            body=new_workflow,
        )
        return _create_resource_response(replaced.to_dict(), request)


async def _delete_workflow_pods(
    api,
    namespace: str,
    workflow_name: str,
    node_ids: list[str],
) -> None:
    """Delete the pods backing the given workflow node IDs, ignoring absent pods.

    Pods carry no node-id label, so they are matched by the trailing hash
    segment their name shares with the node ID (the same suffix match used to
    resolve node logs).
    """
    core_v1 = CoreV1Api(api)
    suffixes = {suffix for suffix in (workflow_pod_suffix(node_id) for node_id in node_ids) if suffix}
    if not suffixes:
        return

    pods = await core_v1.list_namespaced_pod(
        namespace=namespace,
        label_selector=f"workflows.argoproj.io/workflow={workflow_name}",
    )
    for pod in pods.items:
        pod_name = pod.metadata.name
        if not any(pod_name.endswith(suffix) for suffix in suffixes):
            continue
        try:
            await core_v1.delete_namespaced_pod(name=pod_name, namespace=namespace)
        except ApiException as e:
            if e.status != 404:
                raise


@router.put("/apis/argoproj.io/v1alpha1/namespaces/{namespace}/workflows/{workflow_name}/suspend")
@handle_k8s_errors(operation="suspend", resource_type="workflow")
async def suspend_workflow(
    request: Request,
    workflow_name: str,
    namespace: str,
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> Response:
    """
    Suspend a running workflow. No new nodes are scheduled; running pods finish.

    Sets spec.suspend=true. The workflow stays Running.

    Examples:
        - PUT /v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/my-workflow/suspend
    """
    async with get_impersonating_api_client(impersonation) as api:
        dynamic_client = await DynamicClient(api)
        workflow_resource = await _get_workflow_resource(dynamic_client)
        existing = await workflow_resource.get(name=workflow_name, namespace=namespace)
        try:
            validate_suspendable(existing.to_dict())
        except LifecyclePreconditionError as e:
            raise HTTPException(status_code=409, detail=str(e)) from e
        patched = await workflow_resource.patch(
            name=workflow_name,
            namespace=namespace,
            body={"spec": {"suspend": True}},
            content_type=MERGE_PATCH_CONTENT_TYPE,
        )
        return _create_resource_response(patched.to_dict(), request)


@router.put("/apis/argoproj.io/v1alpha1/namespaces/{namespace}/workflows/{workflow_name}/resume")
@handle_k8s_errors(operation="resume", resource_type="workflow")
async def resume_workflow(
    request: Request,
    workflow_name: str,
    namespace: str,
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> Response:
    """
    Resume a suspended workflow.

    Clears spec.suspend and marks active suspend-node gates Succeeded.

    Examples:
        - PUT /v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/my-workflow/resume
    """
    return await _replace_workflow(
        request, workflow_name, namespace, formulate_resume_workflow, delete_pods=False, impersonation=impersonation
    )


@router.put("/apis/argoproj.io/v1alpha1/namespaces/{namespace}/workflows/{workflow_name}/stop")
@handle_k8s_errors(operation="stop", resource_type="workflow")
async def stop_workflow(
    request: Request,
    workflow_name: str,
    namespace: str,
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> Response:
    """
    Stop a workflow: kill running pods, mark it Failed, but still run onExit handlers.

    Sets spec.shutdown=Stop.

    Examples:
        - PUT /v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/my-workflow/stop
    """
    async with get_impersonating_api_client(impersonation) as api:
        dynamic_client = await DynamicClient(api)
        workflow_resource = await _get_workflow_resource(dynamic_client)
        existing = await workflow_resource.get(name=workflow_name, namespace=namespace)
        try:
            validate_stoppable(existing.to_dict())
        except LifecyclePreconditionError as e:
            raise HTTPException(status_code=409, detail=str(e)) from e
        patched = await workflow_resource.patch(
            name=workflow_name,
            namespace=namespace,
            body={"spec": {"shutdown": "Stop"}},
            content_type=MERGE_PATCH_CONTENT_TYPE,
        )
        return _create_resource_response(patched.to_dict(), request)


@router.put("/apis/argoproj.io/v1alpha1/namespaces/{namespace}/workflows/{workflow_name}/terminate")
@handle_k8s_errors(operation="terminate", resource_type="workflow")
async def terminate_workflow(
    request: Request,
    workflow_name: str,
    namespace: str,
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> Response:
    """
    Terminate a workflow: kill running pods and mark it Failed, skipping onExit handlers.

    Sets spec.shutdown=Terminate.

    Examples:
        - PUT /v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/my-workflow/terminate
    """
    async with get_impersonating_api_client(impersonation) as api:
        dynamic_client = await DynamicClient(api)
        workflow_resource = await _get_workflow_resource(dynamic_client)
        existing = await workflow_resource.get(name=workflow_name, namespace=namespace)
        try:
            validate_stoppable(existing.to_dict())
        except LifecyclePreconditionError as e:
            raise HTTPException(status_code=409, detail=str(e)) from e
        patched = await workflow_resource.patch(
            name=workflow_name,
            namespace=namespace,
            body={"spec": {"shutdown": "Terminate"}},
            content_type=MERGE_PATCH_CONTENT_TYPE,
        )
        return _create_resource_response(patched.to_dict(), request)


@router.put("/apis/argoproj.io/v1alpha1/namespaces/{namespace}/workflows/{workflow_name}/retry")
@handle_k8s_errors(operation="retry", resource_type="workflow")
async def retry_workflow(
    request: Request,
    workflow_name: str,
    namespace: str,
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> Response:
    """
    Retry a Failed or Error workflow from the point of failure.

    Successful nodes keep their outputs; failed leaf nodes and their pods are
    dropped, failed group nodes are reset, and the workflow flips back to
    Running with the same name.

    Examples:
        - PUT /v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/my-workflow/retry
    """
    return await _replace_workflow(
        request, workflow_name, namespace, formulate_retry_workflow, delete_pods=True, impersonation=impersonation
    )


@router.put("/apis/argoproj.io/v1alpha1/namespaces/{namespace}/workflows/{workflow_name}/resubmit")
@handle_k8s_errors(operation="resubmit", resource_type="workflow")
async def resubmit_workflow(
    request: Request,
    workflow_name: str,
    namespace: str,
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> Response:
    """
    Resubmit a workflow: create a fresh workflow from the existing spec.

    The new workflow gets a fresh name, an empty status, and a
    workflows.argoproj.io/resubmitted-from-workflow label pointing at the source.

    Examples:
        - PUT /v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/my-workflow/resubmit
    """
    async with get_impersonating_api_client(impersonation) as api:
        dynamic_client = await DynamicClient(api)
        workflow_resource = await _get_workflow_resource(dynamic_client)
        existing = await workflow_resource.get(name=workflow_name, namespace=namespace)
        new_workflow = formulate_resubmit_workflow(existing.to_dict())
        created = await workflow_resource.create(body=new_workflow, namespace=namespace)
        return _create_resource_response(created.to_dict(), request)
