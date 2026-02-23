"""Export API endpoints for Ark resources."""
import logging
import yaml
import zipfile
import io
import json
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, Query, Response, HTTPException
from fastapi.responses import StreamingResponse
from kubernetes import client
from kubernetes.client.rest import ApiException

from ark_sdk.client import with_ark_client
from ...models.export import (
    ExportRequest,
    ExportAllRequest,
    ExportResponse,
    ExportHistoryResponse,
    ResourceType
)
from .exceptions import handle_k8s_errors

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/export", tags=["export"])

VERSION = "v1alpha1"
EXPORT_CONFIGMAP_NAME = "ark-export-metadata"
EXPORT_CONFIGMAP_NAMESPACE = "ark-system"


async def get_export_history() -> Dict[str, Any]:
    """Get export history from ConfigMap."""
    try:
        v1 = client.CoreV1Api()
        cm = v1.read_namespaced_config_map(
            name=EXPORT_CONFIGMAP_NAME,
            namespace=EXPORT_CONFIGMAP_NAMESPACE
        )
        return json.loads(cm.data.get("history", "{}"))
    except ApiException as e:
        if e.status == 404:
            return {}
        raise
    except Exception:
        return {}


async def update_export_history(timestamp: datetime, resource_counts: Dict[str, int]):
    """Update export history in ConfigMap."""
    try:
        v1 = client.CoreV1Api()
        history = await get_export_history()

        history["last_export"] = timestamp.isoformat()
        history["export_count"] = history.get("export_count", 0) + 1
        history["last_resource_counts"] = resource_counts

        try:
            cm = v1.read_namespaced_config_map(
                name=EXPORT_CONFIGMAP_NAME,
                namespace=EXPORT_CONFIGMAP_NAMESPACE
            )
            cm.data["history"] = json.dumps(history)
            v1.patch_namespaced_config_map(
                name=EXPORT_CONFIGMAP_NAME,
                namespace=EXPORT_CONFIGMAP_NAMESPACE,
                body=cm
            )
        except ApiException as e:
            if e.status == 404:
                cm_body = client.V1ConfigMap(
                    metadata=client.V1ObjectMeta(
                        name=EXPORT_CONFIGMAP_NAME,
                        namespace=EXPORT_CONFIGMAP_NAMESPACE
                    ),
                    data={"history": json.dumps(history)}
                )
                v1.create_namespaced_config_map(
                    namespace=EXPORT_CONFIGMAP_NAMESPACE,
                    body=cm_body
                )
    except Exception as e:
        logger.error(f"Failed to update export history: {e}")


async def collect_resources(
    resource_types: List[ResourceType],
    namespace: Optional[str] = None,
    resource_ids: Optional[Dict[str, List[str]]] = None
) -> Dict[str, List[Dict[str, Any]]]:
    """Collect resources from Kubernetes."""
    resources = {}

    async with with_ark_client(namespace, VERSION) as ark_client:
        for resource_type in resource_types:
            items = []

            try:
                if resource_type == ResourceType.AGENTS:
                    agents = await ark_client.agents.a_list()
                    for agent in agents:
                        agent_dict = agent.to_dict()
                        if not resource_ids or agent_dict["metadata"]["name"] in resource_ids.get("agents", []):
                            items.append(agent_dict)

                elif resource_type == ResourceType.TEAMS:
                    teams = await ark_client.teams.a_list()
                    for team in teams:
                        team_dict = team.to_dict()
                        if not resource_ids or team_dict["metadata"]["name"] in resource_ids.get("teams", []):
                            items.append(team_dict)

                elif resource_type == ResourceType.MODELS:
                    models = await ark_client.models.a_list()
                    for model in models:
                        model_dict = model.to_dict()
                        if not resource_ids or model_dict["metadata"]["name"] in resource_ids.get("models", []):
                            items.append(model_dict)

                elif resource_type == ResourceType.QUERIES:
                    queries = await ark_client.queries.a_list()
                    for query in queries:
                        query_dict = query.to_dict()
                        if not resource_ids or query_dict["metadata"]["name"] in resource_ids.get("queries", []):
                            items.append(query_dict)

                elif resource_type == ResourceType.A2A:
                    # A2A servers use v1prealpha1 version
                    async with with_ark_client(namespace, "v1prealpha1") as a2a_client:
                        a2a_servers = await a2a_client.a2aservers.a_list()
                        for server in a2a_servers:
                            server_dict = server.to_dict()
                            if not resource_ids or server_dict["metadata"]["name"] in resource_ids.get("a2a", []):
                                items.append(server_dict)

                elif resource_type == ResourceType.MCP:
                    mcp_servers = await ark_client.mcpservers.a_list()
                    for server in mcp_servers:
                        server_dict = server.to_dict()
                        if not resource_ids or server_dict["metadata"]["name"] in resource_ids.get("mcp", []):
                            items.append(server_dict)

                elif resource_type == ResourceType.WORKFLOWS:
                    # Export Argo WorkflowTemplates instead of workflow instances
                    from kubernetes.client import CustomObjectsApi
                    from kubernetes import config
                    custom_api = CustomObjectsApi()
                    try:
                        # Fetch Argo WorkflowTemplates
                        group = "argoproj.io"
                        version = "v1alpha1"
                        plural = "workflowtemplates"

                        # Always use namespace-scoped listing since ark-api has Role (not ClusterRole)
                        # Default to the namespace where ark-api is running if none provided
                        if not namespace:
                            try:
                                # Get the namespace from in-cluster config
                                with open("/var/run/secrets/kubernetes.io/serviceaccount/namespace", "r") as f:
                                    namespace = f.read().strip()
                            except:
                                # Fallback to default namespace
                                namespace = "default"

                        workflow_templates = custom_api.list_namespaced_custom_object(
                            group=group,
                            version=version,
                            namespace=namespace,
                            plural=plural
                        )

                        for template in workflow_templates.get("items", []):
                            if not resource_ids or template["metadata"]["name"] in resource_ids.get("workflows", []):
                                items.append(template)
                    except ApiException as e:
                        if e.status == 404:
                            logger.warning("WorkflowTemplates CRD not found - Argo Workflows may not be installed")
                        else:
                            logger.error(f"Failed to fetch WorkflowTemplates: {e}")
                    except Exception as e:
                        logger.error(f"Unexpected error fetching WorkflowTemplates: {e}")

                elif resource_type == ResourceType.EVALUATORS:
                    evaluators = await ark_client.evaluators.a_list()
                    for evaluator in evaluators:
                        evaluator_dict = evaluator.to_dict()
                        if not resource_ids or evaluator_dict["metadata"]["name"] in resource_ids.get("evaluators", []):
                            items.append(evaluator_dict)

                elif resource_type == ResourceType.EVALUATIONS:
                    evaluations = await ark_client.evaluations.a_list()
                    for evaluation in evaluations:
                        evaluation_dict = evaluation.to_dict()
                        if not resource_ids or evaluation_dict["metadata"]["name"] in resource_ids.get("evaluations", []):
                            items.append(evaluation_dict)

                resources[resource_type.value] = items

            except Exception as e:
                logger.error(f"Failed to collect {resource_type.value}: {e}")
                resources[resource_type.value] = []

    return resources


def clean_resource_for_yaml(resource: Dict[str, Any]) -> Dict[str, Any]:
    """Clean a resource dict for YAML export by removing null values and system fields."""
    cleaned = {}

    # Always include apiVersion and kind
    if "apiVersion" in resource:
        cleaned["apiVersion"] = resource["apiVersion"]
    if "kind" in resource:
        cleaned["kind"] = resource["kind"]

    # Clean metadata
    if "metadata" in resource and resource["metadata"]:
        metadata = {}
        for key in ["name", "namespace", "labels", "annotations"]:
            if key in resource["metadata"] and resource["metadata"][key]:
                metadata[key] = resource["metadata"][key]
        if metadata:
            cleaned["metadata"] = metadata

    # Include spec as-is if present
    if "spec" in resource and resource["spec"]:
        cleaned["spec"] = resource["spec"]

    return cleaned


def create_export_zip(resources: Dict[str, List[Dict[str, Any]]]) -> bytes:
    """Create a ZIP file containing YAML files organized by resource type."""
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for resource_type, items in resources.items():
            if not items:
                continue

            # Create folder for resource type
            for item in items:
                cleaned_item = clean_resource_for_yaml(item)
                yaml_content = yaml.dump(
                    cleaned_item,
                    default_flow_style=False,
                    sort_keys=False,
                    allow_unicode=True
                )

                # Generate filename
                name = item.get("metadata", {}).get("name", "unknown")
                filename = f"{resource_type}/{name}.yaml"

                # Add to zip
                zip_file.writestr(filename, yaml_content)

    zip_buffer.seek(0)
    return zip_buffer.getvalue()


@router.post("/resources", response_class=StreamingResponse)
@handle_k8s_errors(operation="export", resource_type="resources")
async def export_resources(
    body: ExportRequest,
    namespace: Optional[str] = Query(None, description="Namespace for this request")
):
    """
    Export selected Ark resources as a ZIP file.

    Args:
        body: Export request with resource types and optional IDs
        namespace: Namespace to export from

    Returns:
        ZIP file containing YAML files organized by resource type
    """
    # Collect resources
    resources = await collect_resources(
        resource_types=body.resource_types,
        namespace=namespace or body.namespace,
        resource_ids=body.resource_ids
    )

    # Count resources
    resource_counts = {k: len(v) for k, v in resources.items()}

    # Create ZIP file
    zip_content = create_export_zip(resources)

    # Update export history
    timestamp = datetime.now(timezone.utc)
    await update_export_history(timestamp, resource_counts)

    # Generate filename
    filename = f"ark-export-{timestamp.strftime('%Y%m%d-%H%M%S')}.zip"

    return StreamingResponse(
        io.BytesIO(zip_content),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.post("/all", response_class=StreamingResponse)
@handle_k8s_errors(operation="export", resource_type="all")
async def export_all_resources(
    body: ExportAllRequest = ExportAllRequest(),
    namespace: Optional[str] = Query(None, description="Namespace for this request")
):
    """
    Export all Ark resources as a ZIP file.

    Args:
        body: Export request with optional namespace
        namespace: Namespace to export from

    Returns:
        ZIP file containing all resources organized by type
    """
    # Export all resource types
    all_types = list(ResourceType)

    # Collect resources
    resources = await collect_resources(
        resource_types=all_types,
        namespace=namespace or body.namespace
    )

    # Count resources
    resource_counts = {k: len(v) for k, v in resources.items()}

    # Create ZIP file
    zip_content = create_export_zip(resources)

    # Update export history
    timestamp = datetime.now(timezone.utc)
    await update_export_history(timestamp, resource_counts)

    # Generate filename
    filename = f"ark-export-all-{timestamp.strftime('%Y%m%d-%H%M%S')}.zip"

    return StreamingResponse(
        io.BytesIO(zip_content),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/last-export-time", response_model=ExportHistoryResponse)
@handle_k8s_errors(operation="get", resource_type="export-history")
async def get_last_export_time() -> ExportHistoryResponse:
    """
    Get the timestamp of the last export.

    Returns:
        Export history with last export timestamp
    """
    history = await get_export_history()

    last_export = None
    if history.get("last_export"):
        last_export = datetime.fromisoformat(history["last_export"])

    return ExportHistoryResponse(
        last_export=last_export,
        export_count=history.get("export_count", 0)
    )