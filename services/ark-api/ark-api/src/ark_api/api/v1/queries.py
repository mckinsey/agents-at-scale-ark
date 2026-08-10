"""API routes for Query resources."""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query, Request
from typing import Optional
from ark_sdk.models.query_v1alpha1 import QueryV1alpha1
from ark_sdk.models.query_v1alpha1_spec import QueryV1alpha1Spec
from ark_sdk.impersonation import ImpersonationConfig

from ark_sdk.client import with_ark_client

from ...auth.dependencies import get_impersonation_config

from ...models.queries import (
    QueryResponse,
    QueryListResponse,
    QueryCreateRequest,
    QueryUpdateRequest,
    QueryDetailResponse,
)
from .exceptions import handle_k8s_errors

router = APIRouter(
    prefix="/queries",
    tags=["queries"]
)

# CRD configuration
VERSION = "v1alpha1"

NAMESPACE_QUERY_DESCRIPTION = "Namespace for this request (defaults to current context)"


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


def _extract_content_text(content) -> list[str]:
    """Extract text fragments from a single message ``content`` value.

    ``content`` may be a plain string or a list of OpenAI multimodal parts
    such as ``{"type": "text", "text": "..."}``. Non-text parts are ignored.
    """
    if isinstance(content, str):
        return [content]
    if not isinstance(content, list):
        return []
    return [
        piece["text"]
        for piece in content
        if isinstance(piece, dict) and isinstance(piece.get("text"), str)
    ]


def _extract_messages_text(messages: list) -> str:
    """Flatten a chat-message array into a lowercase search string."""
    parts: list[str] = []
    for msg in messages:
        if isinstance(msg, dict):
            parts.extend(_extract_content_text(msg.get("content")))
    return " ".join(parts).lower()


def _extract_search_text(spec_input) -> str:
    """Flatten query input to a single lowercase string for substring search.

    Handles: None, plain str, and chat-message arrays where content is either
    a str or a list of multimodal parts. Non-text parts (images, tool calls)
    are ignored.
    """
    if spec_input is None:
        return ""
    if isinstance(spec_input, str):
        return spec_input.lower()
    if isinstance(spec_input, list):
        return _extract_messages_text(spec_input)
    return ""


def _creation_timestamp_key(item_dict: dict):
    """Sort key (timestamp, name). Missing timestamp sorts last when reversed."""
    meta = item_dict.get("metadata", {})
    ts = meta.get("creationTimestamp")
    name = meta.get("name", "")
    if not ts:
        return (datetime.min.replace(tzinfo=timezone.utc), name)
    dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    return (dt, name)


@router.get("", response_model=QueryListResponse)
@handle_k8s_errors(operation="list", resource_type="query")
async def list_queries(
    request: Request,
    namespace: Optional[str] = Query(None, description=NAMESPACE_QUERY_DESCRIPTION),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(25, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(None, max_length=200, description="Case-insensitive substring match over query input text"),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> QueryListResponse:
    """List queries in a namespace with pagination and text search."""
    async with with_ark_client(namespace, VERSION, impersonation=impersonation) as ark_client:
        result = await ark_client.queries.a_list()
        raw_items = [item.to_dict() for item in result]

        if search:
            needle = search.lower()
            raw_items = [
                item for item in raw_items
                if needle in _extract_search_text(item.get("spec", {}).get("input"))
            ]

        raw_items.sort(key=_creation_timestamp_key, reverse=True)

        total = len(raw_items)
        start = (page - 1) * page_size
        end = start + page_size
        page_items = [query_to_response(item) for item in raw_items[start:end]]

        return QueryListResponse(
            items=page_items,
            count=len(page_items),
            total=total,
            page=page,
            page_size=page_size,
        )


@router.post("", response_model=QueryDetailResponse)
@handle_k8s_errors(operation="create", resource_type="query")
async def create_query(
    request: Request,
    query: QueryCreateRequest,
    namespace: Optional[str] = Query(None, description=NAMESPACE_QUERY_DESCRIPTION),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> QueryDetailResponse:
    """Create a new query."""
    async with with_ark_client(namespace, VERSION, impersonation=impersonation) as ark_client:
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
async def get_query(request: Request, query_name: str, namespace: Optional[str] = Query(None, description=NAMESPACE_QUERY_DESCRIPTION), impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config)) -> QueryDetailResponse:
    """Get a specific query."""
    async with with_ark_client(namespace, VERSION, impersonation=impersonation) as ark_client:
        result = await ark_client.queries.a_get(query_name)
        
        return query_to_detail_response(result.to_dict())


@router.put("/{query_name}", response_model=QueryDetailResponse)
@handle_k8s_errors(operation="update", resource_type="query")
async def update_query(
    request: Request,
    query_name: str,
    query: QueryUpdateRequest,
    namespace: Optional[str] = Query(None, description=NAMESPACE_QUERY_DESCRIPTION),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> QueryDetailResponse:
    """Update a specific query."""
    async with with_ark_client(namespace, VERSION, impersonation=impersonation) as ark_client:
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
async def cancel_query(request: Request, query_name: str, namespace: Optional[str] = Query(None, description=NAMESPACE_QUERY_DESCRIPTION), impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config)) -> QueryDetailResponse:
    """Cancel a specific query by setting spec.cancel to true."""
    async with with_ark_client(namespace, VERSION, impersonation=impersonation) as ark_client:
        patch = {"spec": {"cancel": True}}
        updated = await ark_client.queries.a_patch(query_name, patch)
        return query_to_detail_response(updated.to_dict())

@router.delete("/{query_name}", status_code=204)
@handle_k8s_errors(operation="delete", resource_type="query")
async def delete_query(request: Request, query_name: str, namespace: Optional[str] = Query(None, description=NAMESPACE_QUERY_DESCRIPTION), impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config)) -> None:
    """Delete a specific query."""
    async with with_ark_client(namespace, VERSION, impersonation=impersonation) as ark_client:
        await ark_client.queries.a_delete(query_name)
