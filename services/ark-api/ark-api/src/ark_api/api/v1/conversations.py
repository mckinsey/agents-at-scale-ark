"""Conversations API endpoints."""
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query

from ark_sdk.client import with_ark_client

from ...models.conversations import ConversationResponse, ConversationListResponse
from ...utils.memory_client import (
    get_memory_service_address,
    fetch_memory_service_data,
    get_all_memory_resources
)
from .exceptions import handle_k8s_errors

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/conversations", tags=["conversations"])

# CRD configuration
VERSION = "v1alpha1"


@router.get("", response_model=ConversationListResponse)
@handle_k8s_errors(operation="list", resource_type="conversations")
async def list_conversations(
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)"),
    memory: Optional[str] = Query(None, description="Filter by memory name")
) -> ConversationListResponse:
    """List all conversations in a namespace, optionally filtered by memory."""
    async with with_ark_client(namespace, VERSION) as client:
        memory_dicts = await get_all_memory_resources(client, memory)

        all_conversations = []

        for memory_dict in memory_dicts:
            memory_name = memory_dict.get("metadata", {}).get("name", "")

            try:
                service_url = get_memory_service_address(memory_dict)

                data = await fetch_memory_service_data(
                    service_url,
                    "/conversations",
                    memory_name=memory_name
                )

                conversations = data.get("conversations", [])

                # Handle null conversations (empty database)
                if conversations is None:
                    conversations = []

                # Convert to our response format - only include actual data
                for conversation_id in conversations:
                    all_conversations.append(ConversationResponse(
                        conversationId=conversation_id,
                        memoryName=memory_name
                    ))

            except Exception as e:
                logger.error(f"Failed to get conversations from memory {memory_name}: {e}")
                # Continue processing other memories
                continue

        return ConversationListResponse(
            items=all_conversations,
            total=len(all_conversations)
        )


@router.delete("/{conversation_id}")
@handle_k8s_errors(operation="delete", resource_type="conversation")
async def delete_conversation(
    conversation_id: str,
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")
) -> dict:
    """Delete a specific conversation and all its messages."""
    async with with_ark_client(namespace, VERSION) as client:
        # Process all memory services to ensure conversation is removed from all potential locations
        memory_dicts = await get_all_memory_resources(client)

        deleted_count = 0
        failed_services = []

        for memory_dict in memory_dicts:
            memory_name = memory_dict.get("metadata", {}).get("name", "")

            try:
                service_url = get_memory_service_address(memory_dict)

                async with httpx.AsyncClient() as http_client:
                    response = await http_client.delete(
                        f"{service_url}/conversations/{conversation_id}",
                        timeout=30.0
                    )

                    if response.is_success:
                        # Any 2xx response indicates successful deletion
                        deleted_count += 1
                    elif response.status_code == httpx.codes.NOT_FOUND:
                        # Idempotent deletion: conversation not found in this memory service is acceptable
                        logger.debug(f"Conversation {conversation_id} not found in memory {memory_name}")
                    elif response.status_code == httpx.codes.INTERNAL_SERVER_ERROR:
                        # Database errors require immediate failure as they indicate backend problems
                        raise HTTPException(
                            status_code=httpx.codes.INTERNAL_SERVER_ERROR,
                            detail=f"Failed to delete conversation {conversation_id} from database"
                        )

            except HTTPException:
                raise
            except Exception as e:
                # Network errors don't stop processing: continue attempting other memory services
                logger.error(f"Failed to delete conversation {conversation_id} from memory {memory_name}: {e}")
                failed_services.append(memory_name)

        if len(memory_dicts) > 0 and deleted_count == 0 and failed_services:
            raise HTTPException(
                status_code=httpx.codes.SERVICE_UNAVAILABLE,
                detail=f"Could not reach any memory services: {', '.join(failed_services)}"
            )

        return {"message": f"Conversation {conversation_id} deleted successfully from {deleted_count} memory service(s)"}


@router.delete("")
@handle_k8s_errors(operation="delete", resource_type="conversations")
async def delete_all_conversations(
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")
) -> dict:
    """Delete all conversations and their messages."""
    async with with_ark_client(namespace, VERSION) as client:
        # Process all memory services to ensure complete cleanup across the namespace
        memory_dicts = await get_all_memory_resources(client)

        deleted_count = 0
        failed_services = []

        for memory_dict in memory_dicts:
            memory_name = memory_dict.get("metadata", {}).get("name", "")

            try:
                service_url = get_memory_service_address(memory_dict)

                async with httpx.AsyncClient() as http_client:
                    response = await http_client.delete(
                        f"{service_url}/conversations",
                        timeout=30.0
                    )

                    if response.is_success:
                        # Any 2xx response indicates successful deletion
                        deleted_count += 1
                    elif response.status_code == httpx.codes.INTERNAL_SERVER_ERROR:
                        # Database errors require immediate failure as they indicate backend problems
                        raise HTTPException(
                            status_code=httpx.codes.INTERNAL_SERVER_ERROR,
                            detail="Failed to delete all conversations from database"
                        )

            except HTTPException:
                raise
            except Exception as e:
                # Network errors don't stop processing: continue attempting other memory services
                logger.error(f"Failed to delete all conversations from memory {memory_name}: {e}")
                failed_services.append(memory_name)

        if len(memory_dicts) > 0 and deleted_count == 0 and failed_services:
            raise HTTPException(
                status_code=httpx.codes.SERVICE_UNAVAILABLE,
                detail=f"Could not reach any memory services: {', '.join(failed_services)}"
            )

        return {"message": f"All conversations deleted successfully from {deleted_count} memory service(s)"}


@router.delete("/{conversation_id}/queries/{query_id}/messages")
@handle_k8s_errors(operation="delete", resource_type="query_messages")
async def delete_query_messages(
    conversation_id: str,
    query_id: str,
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")
) -> dict:
    """Delete messages for a specific query within a conversation."""
    async with with_ark_client(namespace, VERSION) as client:
        # Process all memory services to ensure query messages are removed from all potential locations
        memory_dicts = await get_all_memory_resources(client)

        deleted_count = 0
        failed_services = []

        for memory_dict in memory_dicts:
            memory_name = memory_dict.get("metadata", {}).get("name", "")

            try:
                service_url = get_memory_service_address(memory_dict)

                async with httpx.AsyncClient() as http_client:
                    response = await http_client.delete(
                        f"{service_url}/conversations/{conversation_id}/queries/{query_id}/messages",
                        timeout=30.0
                    )

                    if response.is_success:
                        # Any 2xx response indicates successful deletion
                        deleted_count += 1
                    elif response.status_code == httpx.codes.INTERNAL_SERVER_ERROR:
                        # Database errors require immediate failure as they indicate backend problems
                        raise HTTPException(
                            status_code=httpx.codes.INTERNAL_SERVER_ERROR,
                            detail=f"Failed to delete query {query_id} messages from database"
                        )

            except HTTPException:
                raise
            except Exception as e:
                # Network errors don't stop processing: continue attempting other memory services
                logger.error(f"Failed to delete query {query_id} messages from conversation {conversation_id} in memory {memory_name}: {e}")
                failed_services.append(memory_name)

        if memory_dicts and not deleted_count and failed_services:
            raise HTTPException(
                status_code=httpx.codes.SERVICE_UNAVAILABLE,
                detail=f"Could not reach any memory services: {', '.join(failed_services)}"
            )

        return {"message": f"Query {query_id} messages deleted successfully from {deleted_count} memory service(s)"}