"""
Marketplace API endpoints.

Provides REST API endpoints for managing marketplace sources, local items,
and installing items into Ark as ExecutionEngine CRDs.

Endpoints:
    Sources:
        GET    /marketplace/sources                 - List all sources
        POST   /marketplace/sources                 - Add a source
        DELETE /marketplace/sources/{name}          - Remove a source

    Local Items:
        GET    /marketplace/local/items             - List local items
        POST   /marketplace/local/items             - Add a local item
        PUT    /marketplace/local/items/{name}      - Update a local item
        DELETE /marketplace/local/items/{name}      - Delete a local item

    Combined:
        GET    /marketplace/items                   - List all items (with filters)
        POST   /marketplace/items/{name}/install    - Install an item

    Metadata:
        GET    /marketplace/categories              - List all categories
"""
import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional, List

import httpx
from fastapi import APIRouter, Query, HTTPException
from kubernetes_asyncio import client
from kubernetes_asyncio.client.api_client import ApiClient
from kubernetes_asyncio.client.rest import ApiException

from ark_sdk.client import with_ark_client
from ark_sdk.models.execution_engine_v1prealpha1 import ExecutionEngineV1prealpha1

from ...models.marketplace import (
    MarketplaceSource,
    MarketplaceSourceCreate,
    MarketplaceSourceListResponse,
    MarketplaceItem,
    MarketplaceItemCreate,
    MarketplaceItemUpdate,
    MarketplaceItemListResponse,
    LocalMarketplaceItemListResponse,
    MarketplaceInstallRequest,
    MarketplaceInstallResponse,
    MarketplaceCategoriesResponse,
    MarketplaceItemArk,
)
from .exceptions import handle_k8s_errors

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/marketplace", tags=["marketplace"])

SOURCES_CONFIGMAP_NAME = os.environ.get("MARKETPLACE_SOURCES_CONFIGMAP", "ark-marketplace-sources")
LOCAL_CONFIGMAP_NAME = os.environ.get("MARKETPLACE_LOCAL_CONFIGMAP", "ark-marketplace-local")
MARKETPLACE_NAMESPACE = os.environ.get("MARKETPLACE_NAMESPACE", "default")
FETCH_TIMEOUT = int(os.environ.get("MARKETPLACE_FETCH_TIMEOUT", "30"))
EXECUTION_ENGINE_VERSION = "v1prealpha1"


async def _get_configmap(v1: client.CoreV1Api, name: str, namespace: str) -> Optional[dict]:
    """Get a ConfigMap by name, returns None if not found."""
    try:
        cm = await v1.read_namespaced_config_map(name=name, namespace=namespace)
        return cm.to_dict()
    except ApiException as e:
        if e.status == 404:
            return None
        raise


async def _create_or_update_configmap(
    v1: client.CoreV1Api,
    name: str,
    namespace: str,
    data: dict
) -> dict:
    """Create or update a ConfigMap."""
    existing = await _get_configmap(v1, name, namespace)

    cm_body = client.V1ConfigMap(
        metadata=client.V1ObjectMeta(name=name, namespace=namespace),
        data=data
    )

    if existing:
        result = await v1.replace_namespaced_config_map(
            name=name,
            namespace=namespace,
            body=cm_body
        )
    else:
        result = await v1.create_namespaced_config_map(
            namespace=namespace,
            body=cm_body
        )

    return result.to_dict()


async def _get_sources_data() -> List[dict]:
    """Get marketplace sources from ConfigMap."""
    async with ApiClient() as api:
        v1 = client.CoreV1Api(api)
        cm = await _get_configmap(v1, SOURCES_CONFIGMAP_NAME, MARKETPLACE_NAMESPACE)

        if not cm or not cm.get("data"):
            return []

        sources_json = cm["data"].get("sources.json", "{}")
        try:
            data = json.loads(sources_json)
            return data.get("sources", [])
        except json.JSONDecodeError:
            logger.error("Failed to parse sources.json from ConfigMap")
            return []


async def _save_sources_data(sources: List[dict]) -> None:
    """Save marketplace sources to ConfigMap."""
    async with ApiClient() as api:
        v1 = client.CoreV1Api(api)
        data = {"sources.json": json.dumps({"sources": sources}, indent=2)}
        await _create_or_update_configmap(v1, SOURCES_CONFIGMAP_NAME, MARKETPLACE_NAMESPACE, data)


async def _get_local_items_data() -> List[dict]:
    """Get local marketplace items from ConfigMap."""
    async with ApiClient() as api:
        v1 = client.CoreV1Api(api)
        cm = await _get_configmap(v1, LOCAL_CONFIGMAP_NAME, MARKETPLACE_NAMESPACE)

        if not cm or not cm.get("data"):
            return []

        marketplace_json = cm["data"].get("marketplace.json", "{}")
        try:
            data = json.loads(marketplace_json)
            return data.get("items", [])
        except json.JSONDecodeError:
            logger.error("Failed to parse marketplace.json from ConfigMap")
            return []


async def _save_local_items_data(items: List[dict]) -> None:
    """Save local marketplace items to ConfigMap."""
    async with ApiClient() as api:
        v1 = client.CoreV1Api(api)
        data = {
            "marketplace.json": json.dumps({
                "version": "1.0.0",
                "marketplace": "Local",
                "items": items
            }, indent=2)
        }
        await _create_or_update_configmap(v1, LOCAL_CONFIGMAP_NAME, MARKETPLACE_NAMESPACE, data)


async def _fetch_external_marketplace(url: str) -> dict:
    """Fetch and parse an external marketplace JSON file."""
    async with httpx.AsyncClient(timeout=FETCH_TIMEOUT) as http_client:
        response = await http_client.get(url)
        response.raise_for_status()
        return response.json()


async def _get_installed_execution_engines(namespace: Optional[str]) -> dict:
    """Get a dict of installed ExecutionEngines keyed by type."""
    installed = {}
    try:
        async with with_ark_client(namespace, EXECUTION_ENGINE_VERSION) as ark_client:
            engines = await ark_client.executionengines.a_list()
            for engine in engines:
                engine_dict = engine.to_dict()
                engine_type = engine_dict.get("spec", {}).get("type", "")
                engine_namespace = engine_dict.get("metadata", {}).get("namespace", "")
                if engine_type:
                    installed[engine_type] = engine_namespace
    except Exception as e:
        logger.warning(f"Failed to list ExecutionEngines: {e}")
    return installed


def _dict_to_marketplace_item(item_dict: dict, source: str, installed: dict) -> MarketplaceItem:
    """Convert a raw item dict to a MarketplaceItem."""
    item_type = item_dict.get("type", "")
    item_name = item_dict.get("name", "")

    is_installed = item_type in installed or item_name in installed
    installed_ns = installed.get(item_type) or installed.get(item_name)

    ark_config = item_dict.get("ark", {})

    return MarketplaceItem(
        name=item_name,
        type=item_type,
        displayName=item_dict.get("displayName", item_name),
        description=item_dict.get("description", ""),
        version=item_dict.get("version", ""),
        author=item_dict.get("author", ""),
        tags=item_dict.get("tags", []),
        category=item_dict.get("category", ""),
        ark=MarketplaceItemArk(
            image=ark_config.get("image", ""),
            agentic=ark_config.get("agentic", True)
        ),
        source=source,
        installed=is_installed,
        installedNamespace=installed_ns,
        createdAt=item_dict.get("createdAt"),
        updatedAt=item_dict.get("updatedAt"),
    )


@router.get("/sources", response_model=MarketplaceSourceListResponse)
@handle_k8s_errors(operation="list", resource_type="marketplace-source")
async def list_sources() -> MarketplaceSourceListResponse:
    """List all configured marketplace sources."""
    sources_data = await _get_sources_data()

    sources = [
        MarketplaceSource(
            name=s.get("name", ""),
            url=s.get("url", ""),
            enabled=s.get("enabled", True),
            addedAt=s.get("addedAt", datetime.now(timezone.utc).isoformat())
        )
        for s in sources_data
    ]

    return MarketplaceSourceListResponse(sources=sources)


@router.post("/sources", response_model=MarketplaceSource, status_code=201)
@handle_k8s_errors(operation="create", resource_type="marketplace-source")
async def add_source(body: MarketplaceSourceCreate) -> MarketplaceSource:
    """Add a new external marketplace source."""
    try:
        marketplace_data = await _fetch_external_marketplace(body.url)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch marketplace JSON: {e}")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON at the provided URL")

    if "items" not in marketplace_data:
        raise HTTPException(status_code=400, detail="Invalid marketplace JSON: missing 'items' field")

    name = body.name or marketplace_data.get("marketplace", "Unknown")

    sources = await _get_sources_data()

    if any(s.get("name") == name for s in sources):
        raise HTTPException(status_code=409, detail=f"Source '{name}' already exists")

    new_source = {
        "name": name,
        "url": body.url,
        "enabled": True,
        "addedAt": datetime.now(timezone.utc).isoformat()
    }

    sources.append(new_source)
    await _save_sources_data(sources)

    return MarketplaceSource(**new_source)


@router.delete("/sources/{source_name}", status_code=204)
@handle_k8s_errors(operation="delete", resource_type="marketplace-source")
async def remove_source(source_name: str) -> None:
    """Remove an external marketplace source."""
    sources = await _get_sources_data()

    original_count = len(sources)
    sources = [s for s in sources if s.get("name") != source_name]

    if len(sources) == original_count:
        raise HTTPException(status_code=404, detail=f"Source '{source_name}' not found")

    await _save_sources_data(sources)


@router.get("/local/items", response_model=LocalMarketplaceItemListResponse)
@handle_k8s_errors(operation="list", resource_type="marketplace-item")
async def list_local_items(
    namespace: Optional[str] = Query(None, description="Namespace to check installation status")
) -> LocalMarketplaceItemListResponse:
    """List all local marketplace items."""
    items_data = await _get_local_items_data()
    installed = await _get_installed_execution_engines(namespace)

    items = [
        _dict_to_marketplace_item(item, "Local", installed)
        for item in items_data
    ]

    return LocalMarketplaceItemListResponse(items=items, total=len(items))


@router.post("/local/items", response_model=MarketplaceItem, status_code=201)
@handle_k8s_errors(operation="create", resource_type="marketplace-item")
async def create_local_item(
    body: MarketplaceItemCreate,
    namespace: Optional[str] = Query(None, description="Namespace to check installation status")
) -> MarketplaceItem:
    """Add a new item to the local marketplace."""
    items = await _get_local_items_data()

    if any(item.get("name") == body.name for item in items):
        raise HTTPException(status_code=409, detail=f"Item '{body.name}' already exists")

    now = datetime.now(timezone.utc).isoformat()

    new_item = {
        "name": body.name,
        "type": body.type,
        "displayName": body.displayName,
        "description": body.description,
        "version": body.version,
        "author": body.author,
        "tags": body.tags,
        "category": body.category,
        "ark": {
            "image": body.ark.image,
            "agentic": body.ark.agentic
        },
        "createdAt": now,
        "updatedAt": now
    }

    items.append(new_item)
    await _save_local_items_data(items)

    installed = await _get_installed_execution_engines(namespace)
    return _dict_to_marketplace_item(new_item, "Local", installed)


@router.put("/local/items/{item_name}", response_model=MarketplaceItem)
@handle_k8s_errors(operation="update", resource_type="marketplace-item")
async def update_local_item(
    item_name: str,
    body: MarketplaceItemUpdate,
    namespace: Optional[str] = Query(None, description="Namespace to check installation status")
) -> MarketplaceItem:
    """Update a local marketplace item."""
    items = await _get_local_items_data()

    item_index = None
    for i, item in enumerate(items):
        if item.get("name") == item_name:
            item_index = i
            break

    if item_index is None:
        raise HTTPException(status_code=404, detail=f"Item '{item_name}' not found")

    existing = items[item_index]

    if body.displayName is not None:
        existing["displayName"] = body.displayName
    if body.description is not None:
        existing["description"] = body.description
    if body.version is not None:
        existing["version"] = body.version
    if body.author is not None:
        existing["author"] = body.author
    if body.tags is not None:
        existing["tags"] = body.tags
    if body.category is not None:
        existing["category"] = body.category
    if body.ark is not None:
        existing["ark"] = {
            "image": body.ark.image,
            "agentic": body.ark.agentic
        }

    existing["updatedAt"] = datetime.now(timezone.utc).isoformat()

    items[item_index] = existing
    await _save_local_items_data(items)

    installed = await _get_installed_execution_engines(namespace)
    return _dict_to_marketplace_item(existing, "Local", installed)


@router.delete("/local/items/{item_name}", status_code=204)
@handle_k8s_errors(operation="delete", resource_type="marketplace-item")
async def delete_local_item(item_name: str) -> None:
    """Delete a local marketplace item."""
    items = await _get_local_items_data()

    original_count = len(items)
    items = [item for item in items if item.get("name") != item_name]

    if len(items) == original_count:
        raise HTTPException(status_code=404, detail=f"Item '{item_name}' not found")

    await _save_local_items_data(items)


@router.get("/items", response_model=MarketplaceItemListResponse)
@handle_k8s_errors(operation="list", resource_type="marketplace-item")
async def list_all_items(
    namespace: Optional[str] = Query(None, description="Namespace to check installation status"),
    category: Optional[str] = Query(None, description="Filter by category"),
    type: Optional[str] = Query(None, description="Filter by type"),
    source: Optional[str] = Query(None, description="Filter by source name"),
    search: Optional[str] = Query(None, description="Search in name and description"),
    installed: Optional[bool] = Query(None, description="Filter by installation status")
) -> MarketplaceItemListResponse:
    """List all items from all sources (external + local) with optional filters."""
    all_items: List[MarketplaceItem] = []
    installed_engines = await _get_installed_execution_engines(namespace)

    local_items = await _get_local_items_data()
    for item in local_items:
        all_items.append(_dict_to_marketplace_item(item, "Local", installed_engines))

    sources = await _get_sources_data()
    for src in sources:
        if not src.get("enabled", True):
            continue

        try:
            marketplace_data = await _fetch_external_marketplace(src.get("url", ""))
            source_name = src.get("name", "Unknown")

            for item in marketplace_data.get("items", []):
                all_items.append(_dict_to_marketplace_item(item, source_name, installed_engines))
        except Exception as e:
            logger.warning(f"Failed to fetch marketplace from {src.get('url')}: {e}")
            continue

    if category:
        all_items = [item for item in all_items if item.category.lower() == category.lower()]

    if type:
        all_items = [item for item in all_items if item.type.lower() == type.lower()]

    if source:
        all_items = [item for item in all_items if item.source.lower() == source.lower()]

    if search:
        search_lower = search.lower()
        all_items = [
            item for item in all_items
            if search_lower in item.name.lower()
            or search_lower in item.displayName.lower()
            or search_lower in item.description.lower()
        ]

    if installed is not None:
        all_items = [item for item in all_items if item.installed == installed]

    return MarketplaceItemListResponse(items=all_items, total=len(all_items))


@router.post("/items/{item_name}/install", response_model=MarketplaceInstallResponse, status_code=201)
@handle_k8s_errors(operation="install", resource_type="marketplace-item")
async def install_item(
    item_name: str,
    body: MarketplaceInstallRequest,
    source: str = Query(..., description="Source name (e.g., 'Local', 'Ark Community')")
) -> MarketplaceInstallResponse:
    """Install a marketplace item into Ark."""
    item_dict = None

    if source.lower() == "local":
        items = await _get_local_items_data()
        for item in items:
            if item.get("name") == item_name:
                item_dict = item
                break
    else:
        sources = await _get_sources_data()
        for src in sources:
            if src.get("name", "").lower() == source.lower():
                try:
                    marketplace_data = await _fetch_external_marketplace(src.get("url", ""))
                    for item in marketplace_data.get("items", []):
                        if item.get("name") == item_name:
                            item_dict = item
                            break
                except Exception as e:
                    logger.error(f"Failed to fetch marketplace from {src.get('url')}: {e}")
                    raise HTTPException(
                        status_code=400,
                        detail=f"Failed to fetch marketplace source: {e}"
                    )
                break

    if not item_dict:
        raise HTTPException(
            status_code=404,
            detail=f"Item '{item_name}' not found in source '{source}'"
        )

    item_type = item_dict.get("type", "")

    if item_type != "executor":
        raise HTTPException(
            status_code=400,
            detail=f"Only executor type items can be installed. Got: {item_type}"
        )

    ark_config = item_dict.get("ark", {})
    image = ark_config.get("image")

    if not image:
        raise HTTPException(
            status_code=400,
            detail="Item is missing required 'ark.image' field"
        )

    async with with_ark_client(body.namespace, EXECUTION_ENGINE_VERSION) as ark_client:
        spec = {
            "type": item_name,
            "description": item_dict.get("description", ""),
            "source": {
                "image": image
            },
            "isAgentic": ark_config.get("agentic", True)
        }

        engine = ExecutionEngineV1prealpha1(
            metadata={"name": item_name, "namespace": body.namespace},
            spec=spec
        )

        await ark_client.executionengines.a_create(engine)

    return MarketplaceInstallResponse(
        status="installed",
        type=item_type,
        name=item_name,
        namespace=body.namespace
    )


@router.get("/categories", response_model=MarketplaceCategoriesResponse)
@handle_k8s_errors(operation="list", resource_type="marketplace-category")
async def list_categories() -> MarketplaceCategoriesResponse:
    """List all unique categories from all marketplace items."""
    categories = set()

    local_items = await _get_local_items_data()
    for item in local_items:
        if item.get("category"):
            categories.add(item["category"])

    sources = await _get_sources_data()
    for src in sources:
        if not src.get("enabled", True):
            continue

        try:
            marketplace_data = await _fetch_external_marketplace(src.get("url", ""))
            for item in marketplace_data.get("items", []):
                if item.get("category"):
                    categories.add(item["category"])
        except Exception as e:
            logger.warning(f"Failed to fetch marketplace from {src.get('url')}: {e}")
            continue

    return MarketplaceCategoriesResponse(categories=sorted(categories))
