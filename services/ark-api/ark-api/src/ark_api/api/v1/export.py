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
from kubernetes.client import CustomObjectsApi
from kubernetes.client.rest import ApiException

from ark_sdk.client import with_ark_client
from ...models.export import (
    ExportRequest,
    ExportHistoryResponse,
    ResourceType,
    ALL_RESOURCE_TYPES
)
from .exceptions import handle_k8s_errors
from ...core.namespace import get_current_context

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/export", tags=["export"])

VERSION = "v1alpha1"
EXPORT_CONFIGMAP_NAME = "ark-export-metadata"


EXPORT_CONFIGMAP_NAMESPACE = get_current_context()['namespace']


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
    except json.JSONDecodeError:
        logger.warning(f"Invalid JSON in export history ConfigMap, returning empty history")
        return {}


async def update_export_history(timestamp: datetime, resource_counts: Dict[str, int]):
    """Update export history in ConfigMap."""
    try:
        v1 = client.CoreV1Api()
        history = await get_export_history()

        history["last_export"] = timestamp.isoformat()
        history["export_count"] = history.get("export_count", 0) + 1
        history["last_resource_counts"] = resource_counts

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
    except Exception as e:
        logger.error(f"Failed to update export history: {e}")


# Helper functions to reduce cognitive complexity
async def _convert_and_filter_resources(  # NOSONAR - async for consistency with project guidelines
    resources_list: List[Any],  # List of K8s resource objects with to_dict() method
    filter_names: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    """Convert resources to dicts and optionally filter by name.

    Args:
        resources_list: List of K8s resource objects with to_dict() method
        filter_names: Optional list of resource names to include. If None, all resources are included.

    Returns:
        List of resource dictionaries, optionally filtered by name
    """
    items = []
    for resource in resources_list:
        resource_dict = resource.to_dict()
        resource_name = resource_dict["metadata"]["name"]
        if filter_names is None or resource_name in filter_names:
            items.append(resource_dict)
    return items


async def _collect_standard_resource(
    client: Any,
    resource_name: str,
    resource_ids: Optional[Dict[str, List[str]]]
) -> List[Dict[str, Any]]:
    """Collect a standard resource type using the ark client."""
    resource_client = getattr(client, resource_name)
    resources_list = await resource_client.a_list()
    filter_names = resource_ids.get(resource_name) if resource_ids else None
    return await _convert_and_filter_resources(resources_list, filter_names)


async def _collect_a2a_servers(
    namespace: Optional[str],
    resource_ids: Optional[Dict[str, List[str]]]
) -> List[Dict[str, Any]]:
    """Collect A2A servers (uses different API version)."""
    async with with_ark_client(namespace, "v1prealpha1") as a2a_client:
        a2a_servers = await a2a_client.a2aservers.a_list()
        filter_names = resource_ids.get("a2a") if resource_ids else None
        return await _convert_and_filter_resources(a2a_servers, filter_names)


async def _collect_workflows(
    namespace: Optional[str],
    resource_ids: Optional[Dict[str, List[str]]]
) -> List[Dict[str, Any]]:
    """Collect Argo WorkflowTemplates."""
    def _fetch_workflows_sync():
        """Synchronous helper to fetch workflow templates."""
        items = []
        custom_api = CustomObjectsApi()

        try:
            # Determine namespace
            nonlocal namespace
            if not namespace:
                namespace = get_current_context()['namespace']

            # Fetch WorkflowTemplates
            workflow_templates = custom_api.list_namespaced_custom_object(
                group="argoproj.io",
                version="v1alpha1",
                namespace=namespace,
                plural="workflowtemplates"
            )

            # Pre-calculate filter list to avoid repeated dict lookups
            filter_names = resource_ids.get("workflows") if resource_ids else None

            for template in workflow_templates.get("items", []):
                template_name = template["metadata"]["name"]
                if filter_names is None or template_name in filter_names:
                    items.append(template)

        except ApiException as e:
            if e.status == 404:
                logger.warning("WorkflowTemplates CRD not found - Argo Workflows may not be installed")
            else:
                logger.error(f"Failed to fetch WorkflowTemplates: {e}")
        except (KeyError, TypeError) as e:
            logger.error(f"Invalid WorkflowTemplate structure: {e}")

        return items

    # Run synchronous code in thread pool to avoid blocking the event loop
    return await asyncio.to_thread(_fetch_workflows_sync)



async def collect_resources(
    resource_types: List[ResourceType],
    namespace: Optional[str] = None,
    resource_ids: Optional[Dict[str, List[str]]] = None
) -> Dict[str, List[Dict[str, Any]]]:
    """Collect resources from Kubernetes."""
    resources = {}

    # Define which resource types are handled by the ark_client
    standard_resources = {
        "agents", "teams", "models", "queries",
        "mcpservers"
    }

    async with with_ark_client(namespace, VERSION) as ark_client:
        for resource_type in resource_types:
            try:
                # Handle special cases
                if resource_type == "a2a":
                    items = await _collect_a2a_servers(namespace, resource_ids)
                elif resource_type == "workflows":
                    items = await _collect_workflows(namespace, resource_ids)
                # Handle standard resources - now directly using resource_type as the name
                elif resource_type in standard_resources:
                    items = await _collect_standard_resource(
                        ark_client, resource_type, resource_ids
                    )
                else:
                    items = []
                    logger.warning(f"Unknown resource type: {resource_type}")

                resources[resource_type] = items

            except Exception as e:
                logger.error(f"Failed to collect {resource_type}: {e}")
                # Re-raise the error so it's visible to the user
                raise Exception(f"Failed to collect {resource_type}: {str(e)}") from e

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
            if resource["metadata"].get(key):
                metadata[key] = resource["metadata"][key]
        if metadata:
            cleaned["metadata"] = metadata

    # Include spec as-is if present
    if "spec" in resource and resource["spec"]:
        cleaned["spec"] = resource["spec"]

    return cleaned


def create_export_zip(resources: Dict[str, List[Dict[str, Any]]]) -> io.BytesIO:
    """Create a ZIP file containing YAML files organized by resource type."""
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for resource_type, items in resources.items():
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
    return zip_buffer


@router.post("/resources", response_class=StreamingResponse)
@handle_k8s_errors(operation="export", resource_type="resources")
async def export_resources(
    body: ExportRequest = ExportRequest(),
    namespace: Optional[str] = Query(None, description="Namespace for this request")
):
    """
    Export Ark resources as a ZIP file.

    Args:
        body: Export request with optional resource types, IDs, and namespace
            - If resource_types is not specified or empty, exports all resource types
            - If resource_ids is specified, exports only those specific resources
        namespace: Namespace to export from (overrides body.namespace)

    Returns:
        ZIP file containing YAML files organized by resource type
    """
    # If no resource types specified, export all
    resource_types = body.resource_types if body.resource_types else ALL_RESOURCE_TYPES

    # Collect resources
    resources = await collect_resources(
        resource_types=resource_types,
        namespace=namespace or body.namespace,
        resource_ids=body.resource_ids
    )

    # Count resources
    resource_counts = {k: len(v) for k, v in resources.items()}

    # Create ZIP file
    zip_buffer = create_export_zip(resources)

    # Update export history
    timestamp = datetime.now(timezone.utc)
    await update_export_history(timestamp, resource_counts)

    # Generate filename based on whether all resources are being exported
    is_all_export = not body.resource_types or len(body.resource_types) == len(ALL_RESOURCE_TYPES)
    filename_prefix = "ark-export-all" if is_all_export else "ark-export"
    filename = f"{filename_prefix}-{timestamp.strftime('%Y%m%d-%H%M%S')}.zip"

    return StreamingResponse(
        zip_buffer,
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