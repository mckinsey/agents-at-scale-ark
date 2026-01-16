"""API routes for Query resources."""

from datetime import datetime
from fastapi import APIRouter, Query
from typing import Optional
from ark_sdk.models.query_v1alpha1 import QueryV1alpha1
from ark_sdk.models.query_v1alpha1_spec import QueryV1alpha1Spec

from ark_sdk.client import with_ark_client

from ...models.queries import (
    QueryResponse,
    QueryListResponse,
    QueryCreateRequest,
    QueryUpdateRequest,
    QueryDetailResponse
)
from .exceptions import handle_k8s_errors

router = APIRouter(
    prefix="/queries",
    tags=["queries"]
)

# CRD configuration
VERSION = "v1alpha1"


def query_to_response(query: dict) -> QueryResponse:
    """Convert a Kubernetes query object to response model."""
    creation_timestamp = None
    if "creationTimestamp" in query["metadata"]:
        creation_timestamp = datetime.fromisoformat(
            query["metadata"]["creationTimestamp"].replace("Z", "+00:00")
        )
    
    # Get query type and determine input field
    spec = query["spec"]
    query_type = spec.get('type', 'user')
    input_value = spec.get("input", "" if query_type == 'user' else [])
    
    return QueryResponse(
        name=query["metadata"]["name"],
        namespace=query["metadata"]["namespace"],
        type=query_type,
        input=input_value,
        memory=spec.get("memory"),
        sessionId=spec.get("sessionId"),
        conversationId=spec.get("conversationId"),
        status=query.get("status"),
        creationTimestamp=creation_timestamp
    )


def query_to_detail_response(query: dict) -> QueryDetailResponse:
    """Convert a Kubernetes query object to detailed response model."""
    spec = query["spec"]
    metadata = query["metadata"]

    # Get query type and determine input field
    query_type = spec.get('type', 'user')
    input_value = spec.get("input", "" if query_type == 'user' else [])

    return QueryDetailResponse(
        name=metadata["name"],
        namespace=metadata["namespace"],
        type=query_type,
        input=input_value,
        memory=spec.get("memory"),
        parameters=spec.get("parameters"),
        selector=spec.get("selector"),
        serviceAccount=spec.get("serviceAccount"),
        sessionId=spec.get("sessionId"),
        conversationId=spec.get("conversationId"),
        target=spec.get("target"),
        timeout=spec.get("timeout"),
        ttl=spec.get("ttl"),
        cancel=spec.get("cancel"),
        overrides=spec.get("overrides"),
        metadata=metadata,
        status=query.get("status")
    )


@router.get("", response_model=QueryListResponse)
@handle_k8s_errors(operation="list", resource_type="query")
async def list_queries(namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> QueryListResponse:
    """List all queries in a namespace."""
    async with with_ark_client(namespace, VERSION) as ark_client:
        result = await ark_client.queries.a_list()
        
        queries = [query_to_response(item.to_dict()) for item in result]
        
        return QueryListResponse(
            items=queries,
            count=len(queries)
        )


@router.post("", response_model=QueryDetailResponse)
@handle_k8s_errors(operation="create", resource_type="query")
async def create_query(
    query: QueryCreateRequest,
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")
) -> QueryDetailResponse:
    """Create a new query."""
    async with with_ark_client(namespace, VERSION) as ark_client:
        # Determine input type and build spec accordingly
        spec = {
            "type": getattr(query, 'type', 'user')
        }
        
        # Handle input based on type - pass raw data for RawExtension
        if spec["type"] == "user":
            # For string input, pass as string
            spec["input"] = query.input if isinstance(query.input, str) else str(query.input)
        else:
            # Messages are already dicts (ChatCompletionMessageParam), pass through as-is
            spec["input"] = query.input
        
        if query.memory:
            spec["memory"] = query.memory.model_dump()
        if query.parameters:
            spec["parameters"] = [p.model_dump() for p in query.parameters]
        if query.selector:
            spec["selector"] = query.selector.model_dump()
        if query.serviceAccount:
            spec["serviceAccount"] = query.serviceAccount
        if query.sessionId:
            spec["sessionId"] = query.sessionId
        if query.conversationId:
            spec["conversationId"] = query.conversationId
        if query.target:
            spec["target"] = query.target.model_dump()
        if query.timeout:
            spec["timeout"] = query.timeout
        if query.ttl:
            spec["ttl"] = query.ttl
        if query.cancel is not None:
            spec["cancel"] = query.cancel
        if query.overrides:
            spec["overrides"] = [o.model_dump() for o in query.overrides]

        # Create the QueryV1alpha1 object
        metadata = {
            "name": query.name,
            "namespace": namespace
        }
        # The incoming query may contain additional metadata such as annotations (e.g. streaming annotation)
        if query.metadata:
            metadata.update(query.metadata)

        query_resource = QueryV1alpha1(
            metadata=metadata,
            spec=QueryV1alpha1Spec(**spec)
        )
        
        created = await ark_client.queries.a_create(query_resource)
        
        return query_to_detail_response(created.to_dict())


@router.get("/{query_name}", response_model=QueryDetailResponse)
@handle_k8s_errors(operation="get", resource_type="query")
async def get_query(query_name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> QueryDetailResponse:
    """Get a specific query."""
    async with with_ark_client(namespace, VERSION) as ark_client:
        result = await ark_client.queries.a_get(query_name)
        
        return query_to_detail_response(result.to_dict())


@router.put("/{query_name}", response_model=QueryDetailResponse)
@handle_k8s_errors(operation="update", resource_type="query")
async def update_query(
    query_name: str,
    query: QueryUpdateRequest,
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")
) -> QueryDetailResponse:
    """Update a specific query."""
    async with with_ark_client(namespace, VERSION) as ark_client:
        # Get current query
        current = await ark_client.queries.a_get(query_name)
        spec = current.to_dict()["spec"]
        
        # Update spec with non-None values
        if query.input is not None:
            spec["input"] = query.input
        if query.memory is not None:
            spec["memory"] = query.memory.model_dump()
        if query.parameters is not None:
            spec["parameters"] = [p.model_dump() for p in query.parameters]
        if query.selector is not None:
            spec["selector"] = query.selector.model_dump()
        if query.serviceAccount is not None:
            spec["serviceAccount"] = query.serviceAccount
        if query.sessionId is not None:
            spec["sessionId"] = query.sessionId
        if query.conversationId is not None:
            spec["conversationId"] = query.conversationId
        if query.target is not None:
            spec["target"] = query.target.model_dump()
        if query.timeout is not None:
            spec["timeout"] = query.timeout
        if query.ttl is not None:
            spec["ttl"] = query.ttl
        if query.cancel is not None:
            spec["cancel"] = query.cancel
        if query.overrides is not None:
            spec["overrides"] = [o.model_dump() for o in query.overrides]

        # Update the resource - need to update the entire resource object
        current_dict = current.to_dict()
        current_dict["spec"] = spec
        
        # Create updated query object
        updated_query_obj = QueryV1alpha1(**current_dict)
        
        updated = await ark_client.queries.a_update(updated_query_obj)
        
        return query_to_detail_response(updated.to_dict())


@router.patch("/{query_name}/cancel", response_model=QueryDetailResponse)
@handle_k8s_errors(operation="update", resource_type="query")
async def cancel_query(query_name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> QueryDetailResponse:
    """Cancel a specific query by setting spec.cancel to true."""
    async with with_ark_client(namespace, VERSION) as ark_client:
        patch = {"spec": {"cancel": True}}
        updated = await ark_client.queries.a_patch(query_name, patch)
        return query_to_detail_response(updated.to_dict())

@router.delete("/{query_name}", status_code=204)
@handle_k8s_errors(operation="delete", resource_type="query")
async def delete_query(query_name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> None:
    """Delete a specific query."""
    async with with_ark_client(namespace, VERSION) as ark_client:
        await ark_client.queries.a_delete(query_name)
