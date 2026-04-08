"""Generic Kubernetes resources API endpoints."""
import logging
import yaml

from fastapi import APIRouter, Query, Request, Response
from fastapi.responses import JSONResponse, PlainTextResponse
from typing import Optional
from kubernetes_asyncio.client.api_client import ApiClient
from kubernetes_asyncio.client import CoreV1Api
from kubernetes_asyncio.dynamic import DynamicClient
from ark_sdk.k8s import get_context

from ...constants.query_param_descriptions import (
    NAMESPACE_DESCRIPTION,
    LABEL_SELECTOR_DESCRIPTION,
)
from .exceptions import handle_k8s_errors

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/resources", tags=["resources"])


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
    namespace: Optional[str] = Query(None, description=NAMESPACE_DESCRIPTION)
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

    async with ApiClient() as api:
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
    label_selector: Optional[str] = Query(None, alias="labelSelector", description=LABEL_SELECTOR_DESCRIPTION)
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

    async with ApiClient() as api:
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
    namespace: Optional[str] = Query(None, description=NAMESPACE_DESCRIPTION)
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

    async with ApiClient() as api:
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
    workflowTemplateName: Optional[str] = Query(None, description="Filter by workflow template name (partial match, case insensitive)"),
    status: Optional[str] = Query(None, description="Filter by workflow status (case insensitive). Options: running, succeeded, failed (which matches both failed and error), pending")
) -> Response:
    """
    List grouped Kubernetes resources with optional filtering.

    Args:
        group: API group (e.g., 'apps', 'batch', 'ark.mckinsey.com')
        version: API version (e.g., 'v1', 'v1alpha1')
        kind: Kubernetes Kind (e.g., 'Deployment', 'Job', 'WorkflowTemplate')
        namespace: The namespace (defaults to current context)
        label_selector: Label selector for filtering resources (e.g., 'app.kubernetes.io/instance=phoenix')
        workflowName: Filter by workflow name (partial match, case insensitive)
        workflowTemplateName: Filter by workflow template name (partial match, case insensitive)
        status: Filter by workflow status

    Returns:
        Response: List of raw Kubernetes resources as JSON

    Examples:
        - GET /v1/resources/apis/apps/v1/Deployment
        - GET /v1/resources/apis/batch/v1/Job
        - GET /v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate
        - GET /v1/resources/apis/argoproj.io/v1alpha1/Workflow?workflowName=my-workflow&status=running
        - GET /v1/resources/v1/Service?labelSelector=app.kubernetes.io/instance=phoenix
    """
    if namespace is None:
        namespace = get_context()["namespace"]

    api_version = f"{group}/{version}"

    async with ApiClient() as api:
        dynamic_client = await DynamicClient(api)

        api_resource = await dynamic_client.resources.get(
            api_version=api_version,
            kind=kind
        )

        resources = await api_resource.get(namespace=namespace, label_selector=label_selector)
        resources_dict = resources.to_dict()

        # Apply filters for Workflow resources
        if kind == "Workflow" and "items" in resources_dict:
            items = resources_dict["items"]
            filtered_items = []

            for item in items:
                # Filter by workflow name
                if workflowName:
                    item_name = item.get("metadata", {}).get("name", "")
                    if workflowName.lower() not in item_name.lower():
                        continue

                # Filter by workflow template name
                if workflowTemplateName:
                    template_ref = item.get("spec", {}).get("workflowTemplateRef", {}).get("name", "")
                    if workflowTemplateName.lower() not in template_ref.lower():
                        continue

                # Filter by status
                # Note: "failed" filter matches both "Failed" and "Error" statuses
                if status:
                    item_status = item.get("status", {}).get("phase", "")
                    if status.lower() == "failed":
                        if item_status.lower() not in ["failed", "error"]:
                            continue
                    else:
                        # Exact match for other statuses
                        if status.lower() != item_status.lower():
                            continue

                filtered_items.append(item)

            resources_dict["items"] = filtered_items

        return _create_resource_response(resources_dict, request)


@router.post("/api/{version}/{kind}")
@handle_k8s_errors(operation="create", resource_type="resource")
async def create_core_resource(
    request: Request,
    version: str,
    kind: str,
    body: dict,
    namespace: Optional[str] = Query(None, description=NAMESPACE_DESCRIPTION)
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

    async with ApiClient() as api:
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
    namespace: Optional[str] = Query(None, description=NAMESPACE_DESCRIPTION)
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

    async with ApiClient() as api:
        dynamic_client = await DynamicClient(api)

        api_resource = await dynamic_client.resources.get(
            api_version=api_version,
            kind=kind
        )

        resource = await api_resource.create(body=body, namespace=namespace)

        return _create_resource_response(resource.to_dict(), request)


@router.delete("/api/{version}/{kind}/{resource_name}")
@handle_k8s_errors(operation="delete", resource_type="resource")
async def delete_core_resource(
    version: str,
    kind: str,
    resource_name: str,
    namespace: Optional[str] = Query(None, description=NAMESPACE_DESCRIPTION)
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

    async with ApiClient() as api:
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
    namespace: Optional[str] = Query(None, description=NAMESPACE_DESCRIPTION)
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

    async with ApiClient() as api:
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
    async with ApiClient() as api:
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
    async with ApiClient() as api:
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
                    api_version="argoproj.io/v1alpha1",
                    kind="Workflow"
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
