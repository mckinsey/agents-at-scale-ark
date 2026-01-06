"""
Kubernetes ExecutionEngine API endpoints.

This module provides REST API endpoints for managing ExecutionEngine CRDs.
ExecutionEngines define how agents are executed - either via a shared executor
service (address mode) or as dedicated pod instances (template/source mode).

Endpoints:
    GET    /execution-engines           - List all execution engines
    GET    /execution-engines/templates - List template-based engines only
    POST   /execution-engines           - Create a new execution engine
    GET    /execution-engines/{name}    - Get a specific execution engine
    PUT    /execution-engines/{name}    - Update an execution engine
    DELETE /execution-engines/{name}    - Delete an execution engine

Query Parameters:
    namespace: Filter by Kubernetes namespace
    is_agentic: Filter by isAgentic flag (for agent vs generic templates)
"""
import json
import logging

from fastapi import APIRouter, Query
from typing import Optional
from ark_sdk.models.execution_engine_v1prealpha1 import ExecutionEngineV1prealpha1

from ark_sdk.client import with_ark_client

from ...models.execution_engines import (
    ExecutionEngineResponse,
    ExecutionEngineListResponse,
    ExecutionEngineDetailResponse,
    ExecutionEngineCreateRequest,
    ExecutionEngineUpdateRequest,
    ValueSource,
    TemplateSource,
    GitSource,
)
from ...models.common import extract_availability_from_conditions
from .exceptions import handle_k8s_errors

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/execution-engines", tags=["execution-engines"])

# API version for ExecutionEngine CRD (v1prealpha1 = pre-release API)
VERSION = "v1prealpha1"


def engine_to_response(engine: dict) -> ExecutionEngineResponse:
    """Convert a Kubernetes ExecutionEngine CR to a response model."""
    metadata = engine.get("metadata", {})
    spec = engine.get("spec", {})
    status = engine.get("status", {})

    conditions = status.get("conditions", [])
    availability = extract_availability_from_conditions(conditions, "Ready")

    has_source = spec.get("source") is not None

    return ExecutionEngineResponse(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        type=spec.get("type", ""),
        description=spec.get("description"),
        isAgentic=spec.get("isAgentic", False),
        hasSource=has_source,
        available=availability,
        annotations=metadata.get("annotations", {}),
    )


def engine_to_detail_response(engine: dict) -> ExecutionEngineDetailResponse:
    """Convert a Kubernetes ExecutionEngine CR to a detailed response model."""
    metadata = engine.get("metadata", {})
    spec = engine.get("spec", {})
    status = engine.get("status", {})

    conditions = status.get("conditions", [])
    availability = extract_availability_from_conditions(conditions, "Ready")

    address = None
    if spec.get("address"):
        address = ValueSource(value=spec["address"].get("value"))

    source = None
    if spec.get("source"):
        source_spec = spec["source"]
        git = None
        if source_spec.get("git"):
            git = GitSource(
                url=source_spec["git"].get("url", ""),
                ref=source_spec["git"].get("ref"),
                path=source_spec["git"].get("path"),
            )
        source = TemplateSource(
            image=source_spec.get("image"),
            git=git,
        )

    config_schema = parse_config_schema(spec.get("configSchema"))

    return ExecutionEngineDetailResponse(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        type=spec.get("type", ""),
        description=spec.get("description"),
        address=address,
        source=source,
        configSchema=config_schema,
        isAgentic=spec.get("isAgentic", False),
        available=availability,
        status=status,
        annotations=metadata.get("annotations", {}),
    )


def parse_config_schema(config_schema):
    """Parse configSchema from CRD (stored as JSON string) to dict."""
    if config_schema is None:
        return None
    if isinstance(config_schema, dict):
        return config_schema
    if isinstance(config_schema, str):
        try:
            return json.loads(config_schema)
        except json.JSONDecodeError:
            logger.warning("Failed to parse configSchema as JSON: %s", config_schema[:100])
            return None
    return None


@router.get("", response_model=ExecutionEngineListResponse)
@handle_k8s_errors(operation="list", resource_type="execution-engine")
async def list_execution_engines(
    namespace: Optional[str] = Query(None, description="Namespace for this request"),
    is_agentic: Optional[bool] = Query(None, description="Filter by isAgentic flag"),
) -> ExecutionEngineListResponse:
    """
    List all ExecutionEngine CRs in a namespace.

    Args:
        namespace: The namespace to list from (defaults to current context)
        is_agentic: Optional filter by isAgentic flag

    Returns:
        ExecutionEngineListResponse: List of all execution engines
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        engines = await ark_client.executionengines.a_list()

        engine_list = []
        for engine in engines:
            response = engine_to_response(engine.to_dict())
            if is_agentic is None or response.isAgentic == is_agentic:
                engine_list.append(response)

        return ExecutionEngineListResponse(
            items=engine_list,
            count=len(engine_list)
        )


@router.get("/templates", response_model=ExecutionEngineListResponse)
@handle_k8s_errors(operation="list", resource_type="execution-engine")
async def list_templates(
    namespace: Optional[str] = Query(None, description="Namespace for this request"),
) -> ExecutionEngineListResponse:
    """
    List ExecutionEngines that are templates (have source, not address).

    Args:
        namespace: The namespace to list from (defaults to current context)

    Returns:
        ExecutionEngineListResponse: List of template execution engines
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        engines = await ark_client.executionengines.a_list()

        template_list = []
        for engine in engines:
            response = engine_to_response(engine.to_dict())
            if response.hasSource:
                template_list.append(response)

        return ExecutionEngineListResponse(
            items=template_list,
            count=len(template_list)
        )


@router.post("", response_model=ExecutionEngineDetailResponse)
@handle_k8s_errors(operation="create", resource_type="execution-engine")
async def create_execution_engine(
    body: ExecutionEngineCreateRequest,
    namespace: Optional[str] = Query(None, description="Namespace for this request"),
) -> ExecutionEngineDetailResponse:
    """
    Create a new ExecutionEngine CR.

    Args:
        namespace: The namespace to create in
        body: The creation request

    Returns:
        ExecutionEngineDetailResponse: The created execution engine details
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        spec = {
            "type": body.type,
        }

        if body.description is not None:
            spec["description"] = body.description

        if body.address is not None:
            spec["address"] = body.address.model_dump(exclude_none=True)

        if body.source is not None:
            spec["source"] = body.source.model_dump(exclude_none=True)

        if body.configSchema is not None:
            spec["configSchema"] = json.dumps(body.configSchema)

        if body.isAgentic:
            spec["isAgentic"] = body.isAgentic

        engine = ExecutionEngineV1prealpha1(
            metadata={"name": body.name, "namespace": namespace},
            spec=spec
        )

        created = await ark_client.executionengines.a_create(engine)

        return engine_to_detail_response(created.to_dict())


@router.get("/{engine_name}", response_model=ExecutionEngineDetailResponse)
@handle_k8s_errors(operation="get", resource_type="execution-engine")
async def get_execution_engine(
    engine_name: str,
    namespace: Optional[str] = Query(None, description="Namespace for this request"),
) -> ExecutionEngineDetailResponse:
    """
    Get a specific ExecutionEngine CR by name.

    Args:
        namespace: The namespace
        engine_name: The name of the execution engine

    Returns:
        ExecutionEngineDetailResponse: The execution engine details
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        engine = await ark_client.executionengines.a_get(engine_name)

        return engine_to_detail_response(engine.to_dict())


@router.put("/{engine_name}", response_model=ExecutionEngineDetailResponse)
@handle_k8s_errors(operation="update", resource_type="execution-engine")
async def update_execution_engine(
    engine_name: str,
    body: ExecutionEngineUpdateRequest,
    namespace: Optional[str] = Query(None, description="Namespace for this request"),
) -> ExecutionEngineDetailResponse:
    """
    Update an ExecutionEngine CR by name.

    Args:
        namespace: The namespace
        engine_name: The name of the execution engine
        body: The update request

    Returns:
        ExecutionEngineDetailResponse: The updated execution engine details
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        existing = await ark_client.executionengines.a_get(engine_name)
        existing_spec = existing.to_dict()["spec"]

        if body.type is not None:
            existing_spec["type"] = body.type

        if body.description is not None:
            existing_spec["description"] = body.description

        if body.address is not None:
            existing_spec["address"] = body.address.model_dump(exclude_none=True)

        if body.source is not None:
            existing_spec["source"] = body.source.model_dump(exclude_none=True)

        if body.configSchema is not None:
            existing_spec["configSchema"] = json.dumps(body.configSchema)

        if body.isAgentic is not None:
            existing_spec["isAgentic"] = body.isAgentic

        existing_dict = existing.to_dict()
        existing_dict["spec"] = existing_spec

        updated_obj = ExecutionEngineV1prealpha1(**existing_dict)

        updated = await ark_client.executionengines.a_update(updated_obj)

        return engine_to_detail_response(updated.to_dict())


@router.delete("/{engine_name}", status_code=204)
@handle_k8s_errors(operation="delete", resource_type="execution-engine")
async def delete_execution_engine(
    engine_name: str,
    namespace: Optional[str] = Query(None, description="Namespace for this request"),
) -> None:
    """
    Delete an ExecutionEngine CR by name.

    Args:
        namespace: The namespace
        engine_name: The name of the execution engine
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        await ark_client.executionengines.a_delete(engine_name)
