import logging
import time
import uuid
from typing import List, Optional

from ark_sdk import QueryV1alpha1Spec
from ark_sdk.models.query_v1alpha1 import QueryV1alpha1
from ark_sdk.streaming_config import get_streaming_config, get_streaming_base_url
from ark_sdk.k8s import get_namespace
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from openai.types.chat import ChatCompletion
from openai.types import Model
from pydantic import BaseModel
import httpx
from kubernetes_asyncio import client as k8s_client

from ark_sdk.client import with_ark_client
from ...utils.query_targets import parse_model_to_query_target
from ...utils.query_polling import poll_query_completion
from ...utils.streaming import create_single_chunk_sse_response
from ...constants.annotations import STREAMING_ENABLED_ANNOTATION

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

    # Get the current namespace
    namespace = get_namespace()

    # If the user has requested a streaming response as per the OpenAI completions spec,
    # enable streaming on the query by adding the streaming annotation
    metadata = {"name": query_name, "namespace": namespace}
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
        async with with_ark_client(namespace, "v1alpha1") as ark_client:
            # Create the query using QueryV1alpha1 object like queries API
            await ark_client.queries.a_create(query_resource)
            logger.info(f"Created query: {query_name}")

            # If the caller didn't reuquest streaming, we can simply poll for
            # the response.
            if not request.stream:
                return await poll_query_completion(
                    ark_client, query_name, model, input_text
                )

            # Streaming was requested - check if streaming backend is available
            # Define Server-Sent Events (SSE) headers for streaming responses
            # These headers ensure the connection stays open and data is not cached
            sse_headers = {
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            }

            api = k8s_client.ApiClient()
            v1 = k8s_client.CoreV1Api(api)
            streaming_config = await get_streaming_config(v1, namespace)

            # If no config or not enabled, fall back to polling
            if not streaming_config or not streaming_config.enabled:
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

            # Streaming is enabled - get the base URL and construct full URL
            base_url = await get_streaming_base_url(streaming_config, namespace, v1)
            # Construct streaming URL with query parameters:
            # - from-beginning=true: Start streaming from the first chunk (don't skip any data)
            # - wait-for-query=30s: Wait up to 30 seconds for the query to start producing output
            streaming_url = f"{base_url}/stream/{query_name}?from-beginning=true&wait-for-query=30s"

            # Proxy to the streaming endpoint
            logger.info(f"Streaming available for query: {query_name}")
            return StreamingResponse(
                proxy_streaming_response(streaming_url),
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
