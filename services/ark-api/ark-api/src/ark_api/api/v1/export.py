"""Export API endpoints for Ark resources."""
import asyncio
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


async def get_export_history() -> Dict[str, Any]:  # NOSONAR - Async for consistency with project architecture
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


# Helper functions to reduce cognitive complexity
async def _filter_resources(  # NOSONAR - async for consistency with project guidelines
    resources_list: Any,
    resource_type_key: str,
    resource_ids: Optional[Dict[str, List[str]]]
) -> List[Dict[str, Any]]:
    """Filter resources based on resource_ids if provided."""
    items = []
    for resource in resources_list:
        resource_dict = resource.to_dict()
        resource_name = resource_dict["metadata"]["name"]
        if not resource_ids or resource_name in resource_ids.get(resource_type_key, []):
            items.append(resource_dict)
    return items


async def _collect_standard_resource(
    client: Any,
    resource_attr: str,
    resource_type_key: str,
    resource_ids: Optional[Dict[str, List[str]]]
) -> List[Dict[str, Any]]:
    """Collect a standard resource type using the ark client."""
    resource_client = getattr(client, resource_attr)
    resources_list = await resource_client.a_list()
    return await _filter_resources(resources_list, resource_type_key, resource_ids)


async def _collect_a2a_servers(
    namespace: Optional[str],
    resource_ids: Optional[Dict[str, List[str]]]
) -> List[Dict[str, Any]]:
    """Collect A2A servers (uses different API version)."""
    async with with_ark_client(namespace, "v1prealpha1") as a2a_client:
        a2a_servers = await a2a_client.a2aservers.a_list()
        return await _filter_resources(a2a_servers, "a2a", resource_ids)


async def _collect_workflows(
    namespace: Optional[str],
    resource_ids: Optional[Dict[str, List[str]]]
) -> List[Dict[str, Any]]:
    """Collect Argo WorkflowTemplates."""
    from kubernetes.client import CustomObjectsApi

    def _fetch_workflows_sync():
        """Synchronous helper to fetch workflow templates."""
        items = []
        custom_api = CustomObjectsApi()

        try:
            # Determine namespace
            nonlocal namespace
            if not namespace:
                try:
                    with open("/var/run/secrets/kubernetes.io/serviceaccount/namespace", "r") as f:
                        namespace = f.read().strip()
                except:
                    namespace = "default"

            # Fetch WorkflowTemplates
            workflow_templates = custom_api.list_namespaced_custom_object(
                group="argoproj.io",
                version="v1alpha1",
                namespace=namespace,
                plural="workflowtemplates"
            )

            for template in workflow_templates.get("items", []):
                template_name = template["metadata"]["name"]
                if not resource_ids or template_name in resource_ids.get("workflows", []):
                    items.append(template)

        except ApiException as e:
            if e.status == 404:
                logger.warning("WorkflowTemplates CRD not found - Argo Workflows may not be installed")
            else:
                logger.error(f"Failed to fetch WorkflowTemplates: {e}")
        except Exception as e:
            logger.error(f"Unexpected error fetching WorkflowTemplates: {e}")

        return items

    # Run synchronous code in thread pool to avoid blocking the event loop
    return await asyncio.to_thread(_fetch_workflows_sync)


# Resource collection mapping
RESOURCE_COLLECTORS = {
    ResourceType.AGENTS: ("agents", "agents"),
    ResourceType.TEAMS: ("teams", "teams"),
    ResourceType.MODELS: ("models", "models"),
    ResourceType.QUERIES: ("queries", "queries"),
    ResourceType.MCP: ("mcpservers", "mcp"),
    ResourceType.EVALUATORS: ("evaluators", "evaluators"),
    ResourceType.EVALUATIONS: ("evaluations", "evaluations"),
}


async def collect_resources(
    resource_types: List[ResourceType],
    namespace: Optional[str] = None,
    resource_ids: Optional[Dict[str, List[str]]] = None
) -> Dict[str, List[Dict[str, Any]]]:
    """Collect resources from Kubernetes."""
    resources = {}

    async with with_ark_client(namespace, VERSION) as ark_client:
        for resource_type in resource_types:
            try:
                # Handle special cases
                if resource_type == ResourceType.A2A:
                    items = await _collect_a2a_servers(namespace, resource_ids)
                elif resource_type == ResourceType.WORKFLOWS:
                    items = await _collect_workflows(namespace, resource_ids)
                # Handle standard resources
                elif resource_type in RESOURCE_COLLECTORS:
                    client_attr, resource_key = RESOURCE_COLLECTORS[resource_type]
                    items = await _collect_standard_resource(
                        ark_client, client_attr, resource_key, resource_ids
                    )
                else:
                    items = []
                    logger.warning(f"Unknown resource type: {resource_type}")

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