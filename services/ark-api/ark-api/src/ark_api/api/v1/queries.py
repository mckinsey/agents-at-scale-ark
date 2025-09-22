"""API routes for Query resources."""

from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import httpx
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
    prefix="/namespaces/{namespace}/queries",
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
    
    return QueryResponse(
        name=query["metadata"]["name"],
        namespace=query["metadata"]["namespace"],
        input=query["spec"]["input"],
        memory=query["spec"].get("memory"),
        sessionId=query["spec"].get("sessionId"),
        status=query.get("status"),
        creationTimestamp=creation_timestamp
    )


def query_to_detail_response(query: dict) -> QueryDetailResponse:
    """Convert a Kubernetes query object to detailed response model."""
    spec = query["spec"]
    metadata = query["metadata"]
    
    return QueryDetailResponse(
        name=metadata["name"],
        namespace=metadata["namespace"],
        input=spec["input"],
        memory=spec.get("memory"),
        parameters=spec.get("parameters"),
        selector=spec.get("selector"),
        serviceAccount=spec.get("serviceAccount"),
        sessionId=spec.get("sessionId"),
        targets=spec.get("targets"),
        timeout=spec.get("timeout"),
        ttl=spec.get("ttl"),
        cancel=spec.get("cancel"),
        evaluators=spec.get("evaluators"),
        evaluatorSelector=spec.get("evaluatorSelector"),
        metadata=metadata,
        status=query.get("status")
    )


@router.get("", response_model=QueryListResponse)
@handle_k8s_errors(operation="list", resource_type="query")
async def list_queries(namespace: str) -> QueryListResponse:
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
    namespace: str,
    query: QueryCreateRequest
) -> QueryDetailResponse:
    """Create a new query."""
    async with with_ark_client(namespace, VERSION) as ark_client:
        spec = {
            "input": query.input
        }
        
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
        if query.targets:
            spec["targets"] = [t.model_dump() for t in query.targets]
        if query.timeout:
            spec["timeout"] = query.timeout
        if query.ttl:
            spec["ttl"] = query.ttl
        if query.cancel is not None:
            spec["cancel"] = query.cancel
        if query.evaluators:
            spec["evaluators"] = [e.model_dump() for e in query.evaluators]
        if query.evaluatorSelector:
            spec["evaluatorSelector"] = query.evaluatorSelector.model_dump()
        
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
async def get_query(namespace: str, query_name: str) -> QueryDetailResponse:
    """Get a specific query."""
    async with with_ark_client(namespace, VERSION) as ark_client:
        result = await ark_client.queries.a_get(query_name)
        
        return query_to_detail_response(result.to_dict())


@router.put("/{query_name}", response_model=QueryDetailResponse)
@handle_k8s_errors(operation="update", resource_type="query")
async def update_query(
    namespace: str,
    query_name: str,
    query: QueryUpdateRequest
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
        if query.targets is not None:
            spec["targets"] = [t.model_dump() for t in query.targets]
        if query.timeout is not None:
            spec["timeout"] = query.timeout
        if query.ttl is not None:
            spec["ttl"] = query.ttl
        if query.cancel is not None:
            spec["cancel"] = query.cancel
        if query.evaluators is not None:
            spec["evaluators"] = [e.model_dump() for e in query.evaluators]
        if query.evaluatorSelector is not None:
            spec["evaluatorSelector"] = query.evaluatorSelector.model_dump()
        
        # Update the resource - need to update the entire resource object
        current_dict = current.to_dict()
        current_dict["spec"] = spec
        
        # Create updated query object
        updated_query_obj = QueryV1alpha1(**current_dict)
        
        updated = await ark_client.queries.a_update(updated_query_obj)
        
        return query_to_detail_response(updated.to_dict())


@router.patch("/{query_name}/cancel", response_model=QueryDetailResponse)
@handle_k8s_errors(operation="update", resource_type="query")
async def cancel_query(namespace: str, query_name: str) -> QueryDetailResponse:
    """Cancel a specific query by setting spec.cancel to true."""
    async with with_ark_client(namespace, VERSION) as ark_client:
        patch = {"spec": {"cancel": True}}
        updated = await ark_client.queries.a_patch(query_name, patch)
        return query_to_detail_response(updated.to_dict())

@router.delete("/{query_name}", status_code=204)
@handle_k8s_errors(operation="delete", resource_type="query")
async def delete_query(namespace: str, query_name: str) -> None:
    """Delete a specific query."""
    async with with_ark_client(namespace, VERSION) as ark_client:
        await ark_client.queries.a_delete(query_name)


@router.get("/{query_name}/stream")
@handle_k8s_errors(operation="stream", resource_type="query")
async def stream_query(namespace: str, query_name: str) -> StreamingResponse:
    """Stream query responses in real-time."""
    async with with_ark_client(namespace, VERSION) as ark_client:
        # Get query to check if streaming is enabled
        query = await ark_client.queries.a_get(query_name)
        query_dict = query.to_dict()
        
        # Check streaming annotation
        annotations = query_dict.get("metadata", {}).get("annotations", {})
        streaming_enabled = annotations.get("ark.mckinsey.com/streaming-enabled") == "true"
        
        if not streaming_enabled:
            raise HTTPException(status_code=400, detail="Streaming not enabled for this query")
        
        # Resolve memory name (following ARK controller logic)
        memory_spec = query_dict.get("spec", {}).get("memory")
        if memory_spec and memory_spec.get("name"):
            memory_name = memory_spec["name"]
        else:
            # No memory specified, use "default" memory from same namespace
            memory_name = "default"
            
        # Get memory resource to resolve service address
        memory = await ark_client.memories.a_get(memory_name)
        memory_dict = memory.to_dict()
        
        # Get resolved address from memory status
        status = memory_dict.get("status", {})
        base_url = status.get("lastResolvedAddress")
        
        if not base_url:
            raise HTTPException(status_code=502, detail="Memory service address not resolved")
        
        # Get session ID from query
        session_id = query_dict.get("spec", {}).get("sessionId") or str(query_dict.get("metadata", {}).get("uid", ""))
        
        # Construct memory service streaming URL
        memory_stream_url = f"{base_url}/stream/{session_id}"
        
        async def stream_proxy():
            """Proxy streaming chunks from memory service to client."""
            try:
                async with httpx.AsyncClient() as client:
                    async with client.stream("GET", memory_stream_url) as response:
                        if response.status_code != 200:
                            yield f"data: {{\"error\": \"Memory service returned {response.status_code}\"}}\n\n"
                            return
                        
                        buffer = ""
                        async for chunk in response.aiter_text():
                            buffer += chunk
                            
                            # Process complete lines only (proper SSE formatting)
                            while "\n" in buffer:
                                line, buffer = buffer.split("\n", 1)
                                if line.strip():  # Skip empty lines
                                    yield f"{line}\n"
                                    
            except Exception as e:
                yield f"data: {{\"error\": \"Streaming failed: {str(e)}\"}}\n\n"
        
        return StreamingResponse(
            stream_proxy(),
            media_type="text/plain; charset=utf-8",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
            }
        )
