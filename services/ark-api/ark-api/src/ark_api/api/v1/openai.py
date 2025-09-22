import logging
import time
import uuid
from typing import List, Optional

from ark_sdk import QueryV1alpha1Spec
from ark_sdk.models.query_v1alpha1 import QueryV1alpha1
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from openai.types.chat import ChatCompletion
from openai.types import Model
from pydantic import BaseModel
import httpx

from ark_sdk.client import with_ark_client
from ...utils.query_targets import parse_model_to_query_target
from ...utils.query_polling import poll_query_completion
from ...utils.streaming import create_single_chunk_sse_response
from ...constants.annotations import STREAMING_ENABLED_ANNOTATION, MEMORY_EVENT_STREAM_ENABLED_ANNOTATION

router = APIRouter(prefix="/openai/v1", tags=["OpenAI"])
logger = logging.getLogger(__name__)

# Constants
TIMESTAMP_FORMAT = "%Y-%m-%dT%H:%M:%SZ"


def _parse_timestamp(metadata: dict) -> int:
    """Parse creationTimestamp from metadata, returning current time if not found."""
    created_timestamp = metadata.get("creationTimestamp")
    return (
        int(time.mktime(time.strptime(created_timestamp, TIMESTAMP_FORMAT)))
        if created_timestamp
        else int(time.time())
    )


def _create_model_entry(resource_id: str, metadata: dict) -> Model:
    """Create a Model entry from resource metadata."""
    return Model(
        id=resource_id,
        object="model",
        created=_parse_timestamp(metadata),
        owned_by="ark",
    )


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    model: str
    messages: List[ChatMessage]
    temperature: float = 1.0
    max_tokens: Optional[int] = None
    stream: bool = False


async def check_streaming_availability(ark_client, query_name: str, namespace: str) -> tuple[bool, Optional[str]]:
    """Check if streaming is available for a query.

    Returns:
        (has_streaming_backend, streaming_url)
        - (False, None): No streaming backend configured - fall back to polling
        - (True, None): Has streaming backend but it's misconfigured - this is an error
        - (True, url): Streaming is available and properly configured

    The streaming endpoint can be connected to:
    - Before a query starts (will wait for query to begin)
    - During query execution (will stream from current position)
    - After query completion (will replay all events)
    """
    try:
        # Get query to find memory reference
        query = await ark_client.queries.a_get(query_name)
        query_dict = query.to_dict()

        # Resolve memory name
        memory_spec = query_dict.get("spec", {}).get("memory")
        if memory_spec and memory_spec.get("name"):
            memory_name = memory_spec["name"]
        else:
            memory_name = "default"

        # Try to get memory resource
        try:
            memory = await ark_client.memories.a_get(memory_name)
        except Exception:
            # No memory configured - streaming not available
            return (False, None)

        memory_dict = memory.to_dict()

        # Check if memory supports streaming via annotation
        annotations = memory_dict.get("metadata", {}).get("annotations", {})
        streaming_enabled = annotations.get(MEMORY_EVENT_STREAM_ENABLED_ANNOTATION) == "true"

        if not streaming_enabled:
            # Memory exists but doesn't support streaming
            return (False, None)

        # Memory claims to support streaming - check if it's properly configured
        status = memory_dict.get("status", {})
        base_url = status.get("lastResolvedAddress")

        if not base_url:
            # Streaming backend is misconfigured - no resolved address
            logger.error(f"Memory {memory_name} has streaming enabled but no resolved address")
            return (True, None)

        # Construct streaming URL with query parameters:
        # - from-beginning=true: Start streaming from the first event (not just new events)
        # - wait-for-query=30s: If query hasn't started yet, wait up to 30s for it to begin
        streaming_url = f"{base_url}/stream/{query_name}?from-beginning=true&wait-for-query=30s"
        return (True, streaming_url)

    except Exception as e:
        # Unexpected error checking streaming availability
        logger.error(f"Error checking streaming availability: {str(e)}")
        return (False, None)


async def proxy_streaming_response(streaming_url: str):
    """Proxy streaming chunks from memory service."""
    timeout = httpx.Timeout(10.0, read=None)  # 10s connect, infinite read
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream("GET", streaming_url) as response:
            if response.status_code != 200:
                return  # Streaming failed, exit generator
            
            # Use aiter_lines() for line-by-line streaming without buffering
            async for line in response.aiter_lines():
                if line.strip():  # Skip empty lines
                    # SSE format: each chunk is on its own line
                    yield line + "\n\n"  # Add back SSE double newline separator


@router.post("/chat/completions")
async def chat_completions(request: ChatCompletionRequest) -> ChatCompletion:
    model = request.model
    messages = request.messages

    logger.info(f"Received chat completion request for model: {model}")

    target = parse_model_to_query_target(model)
    input_text = "\n".join([f"{msg.role}: {msg.content}" for msg in messages])
    query_name = f"openai-query-{uuid.uuid4().hex[:8]}"

    # If the user has requested a streaming response as per the OpenAI completions spec,
    # enable streaming on the query by adding the streaming annotation
    metadata = {"name": query_name, "namespace": "default"}
    if request.stream:
        metadata["annotations"] = {
            STREAMING_ENABLED_ANNOTATION: "true"
        }

    # Create the QueryV1alpha1 object like the queries API does
    query_resource = QueryV1alpha1(
        metadata=metadata,
        spec=QueryV1alpha1Spec(input=input_text, targets=[target]),
    )

    logger.info(f"Creating query for {target.type}/{target.name}")

    try:
        async with with_ark_client("default", "v1alpha1") as ark_client:
            # Create the query using QueryV1alpha1 object like queries API
            await ark_client.queries.a_create(query_resource)
            logger.info(f"Created query: {query_name}")

            # If the caller didn't reuquest streaming, we can simply poll for
            # the response.
            if not request.stream:
                return await poll_query_completion(
                    ark_client, query_name, model, input_text
                )

            # Streaming was requested - we'll check to see if the backend is
            # configured to support streaming, and if so its streaming endpoint.
            has_streaming, streaming_url = await check_streaming_availability(ark_client, query_name, "default")

            # Regardless of what we return, i'll be a streaming response with
            # SSE headers.
            sse_headers = {
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            }

            # If the backend has streaming and we have an endpoint, proxy the
            # endpoint to the caller, this gives true real-time streaming.
            if has_streaming and streaming_url:
                logger.info(f"Streaming available for query: {query_name}")
                return StreamingResponse(
                    proxy_streaming_response(streaming_url),
                    media_type="text/event-stream",
                    headers=sse_headers
                )

            # If there is no backend streaming enabled, follow the OpenAI spec
            # and simply return a single chunk with the complete response. Get
            # the complete response - turn it into a chunk - return it.
            logger.info("No streaming backend configured, falling back to polling")
            completion = await poll_query_completion(
                ark_client, query_name, model, input_text
            )
            sse_lines = create_single_chunk_sse_response(completion)
            return StreamingResponse(
                iter(sse_lines),
                media_type="text/event-stream",
                headers=sse_headers
            )

    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models")
async def list_models():
    """List available models in OpenAI format, including ARK agents, teams, models, and tools."""
    models_list = []

    async with with_ark_client("default", "v1alpha1") as ark_client:
        # Get agents
        try:
            agents = await ark_client.agents.a_list()
            for agent in agents:
                name = agent.metadata["name"]
                models_list.append(_create_model_entry(f"agent/{name}", agent.metadata))
        except Exception as e:
            logger.error(f"Failed to list agents: {e}")

        # Get teams
        try:
            teams = await ark_client.teams.a_list()
            for team in teams:
                name = team.metadata["name"]
                models_list.append(_create_model_entry(f"team/{name}", team.metadata))
        except Exception as e:
            logger.error(f"Failed to list teams: {e}")

        # Get models
        try:
            models = await ark_client.models.a_list()
            for model in models:
                name = model.metadata["name"]
                models_list.append(_create_model_entry(f"model/{name}", model.metadata))
        except Exception as e:
            logger.error(f"Failed to list models: {e}")

        # Get tools
        try:
            tools = await ark_client.tools.a_list()
            for tool in tools:
                name = tool.metadata["name"]
                models_list.append(_create_model_entry(f"tool/{name}", tool.metadata))
        except Exception as e:
            logger.error(f"Failed to list tools: {e}")

    return {"object": "list", "data": models_list}
