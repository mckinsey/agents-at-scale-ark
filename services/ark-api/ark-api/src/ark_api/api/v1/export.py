"""Export API endpoints for Ark resources."""
import logging
import yaml
import zipfile
import io
import json
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any, Callable
from fastapi import APIRouter, Query, Response, HTTPException
from fastapi.responses import StreamingResponse
from kubernetes import client
from kubernetes.client.rest import ApiException
from pydantic_settings import BaseSettings
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

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


class ExportConfig(BaseSettings):
    """Configuration for export service."""
    export_configmap_name: str = "ark-export-metadata"
    export_configmap_namespace: str = "ark-system"
    max_export_size_mb: int = 100
    export_timeout_seconds: int = 300
    default_namespace: str = "default"

    class Config:
        env_prefix = "ARK_EXPORT_"


# Initialize configuration
config = ExportConfig()


async def get_export_history() -> Dict[str, Any]:
    """Get export history from ConfigMap with validation."""
    try:
        v1 = client.CoreV1Api()
        cm = v1.read_namespaced_config_map(
            name=config.export_configmap_name,
            namespace=config.export_configmap_namespace
        )

        # Validate ConfigMap data exists
        if not cm.data:
            logger.debug("ConfigMap exists but has no data")
            return {}

        # Get history data with validation
        history_data = cm.data.get("history")
        if not history_data:
            logger.debug("No history data in ConfigMap")
            return {}

        # Parse JSON with error handling
        try:
            return json.loads(history_data)
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in export history: {e}")
            return {}

    except ApiException as e:
        if e.status == 404:
            logger.debug("Export history ConfigMap not found - will create on first export")
            return {}
        logger.error(f"Failed to read export history ConfigMap: status={e.status}, reason={e.reason}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error reading export history: {type(e).__name__}: {e}")
        raise


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(ApiException)
)
async def update_export_history(timestamp: datetime, resource_counts: Dict[str, int]):
    """Update export history in ConfigMap with retry logic."""
    try:
        v1 = client.CoreV1Api()
        history = await get_export_history()

        # Update history data
        history["last_export"] = timestamp.isoformat()
        history["export_count"] = history.get("export_count", 0) + 1
        history["last_resource_counts"] = resource_counts

        try:
            # Try to update existing ConfigMap
            cm = v1.read_namespaced_config_map(
                name=config.export_configmap_name,
                namespace=config.export_configmap_namespace
            )

            if not cm.data:
                cm.data = {}

            cm.data["history"] = json.dumps(history)

            v1.patch_namespaced_config_map(
                name=config.export_configmap_name,
                namespace=config.export_configmap_namespace,
                body=cm
            )
            logger.info(f"Updated export history: {resource_counts}")

        except ApiException as e:
            if e.status == 404:
                # Create new ConfigMap if it doesn't exist
                logger.info("Creating new export history ConfigMap")
                cm_body = client.V1ConfigMap(
                    metadata=client.V1ObjectMeta(
                        name=config.export_configmap_name,
                        namespace=config.export_configmap_namespace
                    ),
                    data={"history": json.dumps(history)}
                )
                v1.create_namespaced_config_map(
                    namespace=config.export_configmap_namespace,
                    body=cm_body
                )
                logger.info(f"Created export history ConfigMap: {resource_counts}")
            else:
                logger.error(f"Failed to update ConfigMap: status={e.status}, reason={e.reason}")
                raise

    except json.JSONEncodeError as e:
        logger.error(f"Failed to serialize export history: {e}")
        # Don't raise - export should continue even if history update fails
    except ApiException as e:
        if e.status >= 500:  # Server errors might be transient
            logger.error(f"Server error updating export history: status={e.status}")
            raise  # Will trigger retry
        logger.error(f"Client error updating export history: status={e.status}, reason={e.reason}")
        # Don't raise for client errors - export should continue
    except Exception as e:
        logger.error(f"Unexpected error updating export history: {type(e).__name__}: {e}")
        # Don't raise - export should continue even if history update fails


async def get_current_namespace() -> str:
    """Get the current namespace from service account or use default."""
    try:
        # Try to read from service account namespace file
        with open("/var/run/secrets/kubernetes.io/serviceaccount/namespace", "r") as f:
            namespace = f.read().strip()
            if namespace:
                return namespace
    except FileNotFoundError:
        logger.debug("Service account namespace file not found - not running in cluster")
    except IOError as e:
        logger.warning(f"Error reading service account namespace: {e}")

    return config.default_namespace


async def collect_single_resource_type(
    ark_client,
    resource_type: ResourceType,
    resource_ids: Optional[Dict[str, List[str]]] = None,
    namespace: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Collect a single resource type with proper error handling."""
    items = []
    resource_name = resource_type.value

    try:
        # Special handling for A2A servers (different API version)
        if resource_type == ResourceType.A2A:
            async with with_ark_client(namespace, "v1prealpha1") as a2a_client:
                resources = await a2a_client.a2aservers.a_list()
                for resource in resources:
                    resource_dict = resource.to_dict()
                    name = resource_dict.get("metadata", {}).get("name")
                    if not resource_ids or name in resource_ids.get("a2a", []):
                        items.append(resource_dict)
            return items

        # Special handling for Argo Workflows
        if resource_type == ResourceType.WORKFLOWS:
            return await collect_workflow_templates(namespace, resource_ids)

        # Map resource type to client method
        collectors = {
            ResourceType.AGENTS: lambda: ark_client.agents.a_list(),
            ResourceType.TEAMS: lambda: ark_client.teams.a_list(),
            ResourceType.MODELS: lambda: ark_client.models.a_list(),
            ResourceType.QUERIES: lambda: ark_client.queries.a_list(),
            ResourceType.MCP: lambda: ark_client.mcpservers.a_list(),
            ResourceType.EVALUATORS: lambda: ark_client.evaluators.a_list(),
            ResourceType.EVALUATIONS: lambda: ark_client.evaluations.a_list(),
        }

        if resource_type not in collectors:
            logger.warning(f"Unknown resource type: {resource_type}")
            return items

        # Collect resources
        resources = await collectors[resource_type]()

        for resource in resources:
            resource_dict = resource.to_dict()
            name = resource_dict.get("metadata", {}).get("name")

            # Filter by resource IDs if specified
            filter_key = resource_name if resource_name != "mcp" else "mcp"
            if not resource_ids or name in resource_ids.get(filter_key, []):
                items.append(resource_dict)

    except ApiException as e:
        logger.error(f"Kubernetes API error collecting {resource_name}: status={e.status}, reason={e.reason}")
        if e.status >= 500:  # Server errors might be transient
            raise  # Re-raise to potentially retry at higher level
        # For client errors (4xx), return empty list
        return []
    except AttributeError as e:
        logger.error(f"Client method not found for {resource_name}: {e}")
        return []
    except Exception as e:
        logger.error(f"Unexpected error collecting {resource_name}: {type(e).__name__}: {e}")
        # Don't raise - return empty list to allow other resources to be collected
        return []

    return items


async def collect_workflow_templates(
    namespace: Optional[str] = None,
    resource_ids: Optional[Dict[str, List[str]]] = None
) -> List[Dict[str, Any]]:
    """Collect Argo Workflow templates with proper error handling."""
    items = []

    try:
        from kubernetes.client import CustomObjectsApi
        custom_api = CustomObjectsApi()

        # Argo Workflows CRD details
        group = "argoproj.io"
        version = "v1alpha1"
        plural = "workflowtemplates"

        # Get namespace if not provided
        if not namespace:
            namespace = await get_current_namespace()

        # List workflow templates
        workflow_templates = custom_api.list_namespaced_custom_object(
            group=group,
            version=version,
            namespace=namespace,
            plural=plural
        )

        # Filter templates
        for template in workflow_templates.get("items", []):
            name = template.get("metadata", {}).get("name")
            if not resource_ids or name in resource_ids.get("workflows", []):
                items.append(template)

    except ApiException as e:
        if e.status == 404:
            logger.info("WorkflowTemplates CRD not found - Argo Workflows may not be installed")
        else:
            logger.error(f"Failed to fetch WorkflowTemplates: status={e.status}, reason={e.reason}")
    except ImportError as e:
        logger.error(f"Failed to import Kubernetes client: {e}")
    except Exception as e:
        logger.error(f"Unexpected error fetching WorkflowTemplates: {type(e).__name__}: {e}")

    return items


async def collect_resources(
    resource_types: List[ResourceType],
    namespace: Optional[str] = None,
    resource_ids: Optional[Dict[str, List[str]]] = None
) -> Dict[str, List[Dict[str, Any]]]:
    """Collect resources from Kubernetes with improved error handling."""
    resources = {}

    # Initialize all resource types with empty lists
    for resource_type in resource_types:
        resources[resource_type.value] = []

    try:
        async with with_ark_client(namespace, VERSION) as ark_client:
            for resource_type in resource_types:
                try:
                    items = await collect_single_resource_type(
                        ark_client=ark_client,
                        resource_type=resource_type,
                        resource_ids=resource_ids,
                        namespace=namespace
                    )
                    resources[resource_type.value] = items

                    if items:
                        logger.info(f"Collected {len(items)} {resource_type.value}")
                    else:
                        logger.debug(f"No {resource_type.value} found or accessible")

                except Exception as e:
                    # Log error but continue with other resources
                    logger.error(f"Failed to collect {resource_type.value}: {type(e).__name__}: {e}")
                    resources[resource_type.value] = []

    except Exception as e:
        logger.error(f"Failed to create Ark client: {type(e).__name__}: {e}")
        # Return empty collections for all resource types
        for resource_type in resource_types:
            resources[resource_type.value] = []

    return resources


def clean_resource_for_yaml(resource: Dict[str, Any]) -> Dict[str, Any]:
    """Clean a resource dict for YAML export by removing null values and system fields."""
    if not resource:
        return {}

    cleaned = {}

    # Always include apiVersion and kind if present
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

    try:
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for resource_type, items in resources.items():
                if not items:
                    continue

                # Create folder for resource type
                for item in items:
                    try:
                        cleaned_item = clean_resource_for_yaml(item)
                        if not cleaned_item:
                            continue

                        yaml_content = yaml.dump(
                            cleaned_item,
                            default_flow_style=False,
                            sort_keys=False,
                            allow_unicode=True
                        )

                        # Generate filename safely
                        name = item.get("metadata", {}).get("name", "unknown")
                        # Sanitize filename to prevent path traversal
                        name = name.replace("/", "_").replace("..", "_")
                        filename = f"{resource_type}/{name}.yaml"

                        # Add to zip
                        zip_file.writestr(filename, yaml_content)

                    except yaml.YAMLError as e:
                        logger.error(f"Failed to serialize resource to YAML: {e}")
                        continue
                    except Exception as e:
                        logger.error(f"Failed to add resource to ZIP: {type(e).__name__}: {e}")
                        continue

        zip_buffer.seek(0)
        return zip_buffer.getvalue()

    except Exception as e:
        logger.error(f"Failed to create export ZIP: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Failed to create export archive")


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
    total_resources = sum(resource_counts.values())

    if total_resources == 0:
        logger.warning("No resources found to export")
        raise HTTPException(status_code=404, detail="No resources found to export")

    # Create ZIP file
    try:
        zip_content = create_export_zip(resources)
    except Exception as e:
        logger.error(f"Failed to create export ZIP: {e}")
        raise HTTPException(status_code=500, detail="Failed to create export archive")

    # Update export history (don't fail export if this fails)
    timestamp = datetime.now(timezone.utc)
    try:
        await update_export_history(timestamp, resource_counts)
    except Exception as e:
        logger.warning(f"Failed to update export history: {e}")

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
    total_resources = sum(resource_counts.values())

    if total_resources == 0:
        logger.warning("No resources found to export")
        raise HTTPException(status_code=404, detail="No resources found to export")

    # Create ZIP file
    try:
        zip_content = create_export_zip(resources)
    except Exception as e:
        logger.error(f"Failed to create export ZIP: {e}")
        raise HTTPException(status_code=500, detail="Failed to create export archive")

    # Update export history (don't fail export if this fails)
    timestamp = datetime.now(timezone.utc)
    try:
        await update_export_history(timestamp, resource_counts)
    except Exception as e:
        logger.warning(f"Failed to update export history: {e}")

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
    try:
        history = await get_export_history()
    except Exception as e:
        logger.error(f"Failed to get export history: {e}")
        # Return empty history instead of failing
        return ExportHistoryResponse(
            last_export=None,
            export_count=0
        )

    last_export = None
    if history.get("last_export"):
        try:
            last_export = datetime.fromisoformat(history["last_export"])
        except (ValueError, TypeError) as e:
            logger.error(f"Invalid last_export timestamp: {e}")
            last_export = None

    return ExportHistoryResponse(
        last_export=last_export,
        export_count=history.get("export_count", 0)
    )