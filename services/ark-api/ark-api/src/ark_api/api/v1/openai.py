from __future__ import annotations

import json
import logging
import os
import time
import uuid

import httpx
from ark_sdk import QueryV1alpha1Spec
from ark_sdk.client import with_ark_client
from ark_sdk.k8s import get_namespace
from ark_sdk.models.query_v1alpha1 import QueryV1alpha1
from ark_sdk.streaming_config import get_streaming_base_url, get_streaming_config
from fastapi import APIRouter
from fastapi.responses import JSONResponse, StreamingResponse
from kubernetes_asyncio import client as k8s_client
from openai.types import Model
from openai.types.chat import ChatCompletion, ChatCompletionMessageParam
from pydantic import BaseModel, ValidationError

from ...constants.annotations import STREAMING_ENABLED_ANNOTATION
from ...models.queries import ArkOpenAICompletionsMetadata
from ...utils.parse_duration import parse_duration_to_seconds
from ...utils.query_targets import parse_model_to_query_target
from ...utils.query_watch import watch_query_completion
from ...utils.streaming import StreamingErrorResponse, create_single_chunk_sse_response

router = APIRouter(prefix="/openai/v1", tags=["OpenAI"])
logger = logging.getLogger(__name__)

# Constants
TIMESTAMP_FORMAT = "%Y-%m-%dT%H:%M:%SZ"
BROKER_CONNECT_TIMEOUT = float(os.getenv('BROKER_CONNECT_TIMEOUT', '10.0'))


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


class ChatCompletionRequest(BaseModel):
    model: str
    messages: list[ChatCompletionMessageParam]
    temperature: float = 1.0
    max_tokens: int | None = None
    stream: bool = False
    metadata: dict | None = (
        None  # Supports queryAnnotations: JSON string of K8s annotations
    )


def process_request_metadata(
    request_metadata: dict[str, str] | None, base_metadata: dict[str, any]
) -> JSONResponse | None:
    """Process request metadata and merge Ark annotations into base metadata.

    Returns JSONResponse with error if validation fails, None if successful.
    """
    if not request_metadata:
        return None

    # Handle Ark-specific metadata
    if "ark" in request_metadata:
        try:
            ark_metadata = ArkOpenAICompletionsMetadata.model_validate_json(
                request_metadata["ark"]
            )
            if ark_metadata.annotations:
                if "annotations" not in base_metadata:
                    base_metadata["annotations"] = {}
                base_metadata["annotations"].update(ark_metadata.annotations)
        except ValidationError as e:
            return JSONResponse(
                status_code=400,
                content={
                    "error": {
                        "message": f"Invalid Ark metadata: {str(e)}",
                        "type": "invalid_request_error",
                        "code": "invalid_ark_metadata",
                    }
                },
            )
    # Ignore other metadata keys per OpenAI SDK pattern
    return None


# See https://github.com/mckinsey/agents-at-scale-ark/issues/415 for potential improvement:
# Start streaming first, wait for the first chunk/response, and use the status code of that to respond with
async def proxy_streaming_response(streaming_url: str):
    """Proxy streaming chunks from memory service."""
    timeout = httpx.Timeout(BROKER_CONNECT_TIMEOUT, read=None)
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream("GET", streaming_url) as response:
            if response.status_code != 200:
                # Read error response with expected structure
                # We control the error format, so read it directly and fail if invalid
                try:
                    response_text = await response.aread()
                    response_json = json.loads(response_text.decode("utf-8"))

                    # Expected structure: {"error": {"message": "...", "type": "...", "code": "..."}}
                    if (
                        not isinstance(response_json, dict)
                        or "error" not in response_json
                    ):
                        raise ValueError("Response missing 'error' field")

                    error_obj = response_json["error"]
                    if not isinstance(error_obj, dict):
                        raise ValueError("'error' field must be an object")

                    if "message" not in error_obj or not isinstance(
                        error_obj["message"], str
                    ):
                        raise ValueError("'error.message' field missing or invalid")

                    if "type" not in error_obj or not isinstance(
                        error_obj["type"], str
                    ):
                        raise ValueError("'error.type' field missing or invalid")

                    # Use the error structure from response, with status code added
                    error_data: StreamingErrorResponse = {
                        "error": {
                            "status": response.status_code,
                            "message": error_obj["message"],
                            "type": error_obj["type"],
                            "code": error_obj.get("code", "server_error"),
                        }
                    }
                except (json.JSONDecodeError, ValueError, KeyError) as e:
                    # If we can't parse the expected structure, create a default error
                    logger.warning(
                        f"Failed to parse error response structure: {e}, using default error format"
                    )
                    error_data: StreamingErrorResponse = {
                        "error": {
                            "status": response.status_code,
                            "message": f"{response.status_code} {response.reason_phrase}",
                            "type": "server_error",
                            "code": "server_error",
                        }
                    }

                # Forward the error response as an SSE error event
                yield f"data: {json.dumps(error_data)}\n\n"
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

    target = parse_model_to_query_target(model)
    query_name = f"openai-query-{uuid.uuid4().hex[:8]}"

    # Get the current namespace
    namespace = get_namespace()

    # Build metadata for the query resource
    metadata = {"name": query_name, "namespace": namespace}

    session_id = None
    if request.metadata and "sessionId" in request.metadata:
        session_id = request.metadata["sessionId"]

    conversation_id = None
    if request.metadata and "conversationId" in request.metadata:
        conversation_id = request.metadata["conversationId"]

    timeout = None
    if request.metadata and "timeout" in request.metadata:
        timeout = request.metadata["timeout"]

    # Parse queryAnnotations if provided (for annotations like A2A context ID)
    if request.metadata and "queryAnnotations" in request.metadata:
        try:
            query_annotations = json.loads(request.metadata["queryAnnotations"])
            if "annotations" not in metadata:
                metadata["annotations"] = {}
            # Add annotations to metadata (e.g., A2A context ID)
            metadata["annotations"].update(query_annotations)
        except (json.JSONDecodeError, TypeError) as e:
            logger.warning(f"Failed to parse queryAnnotations: {e}")

    # If the user has requested a streaming response as per the OpenAI completions spec,
    # enable streaming on the query by adding the streaming annotation
    if request.stream:
        if "annotations" not in metadata:
            metadata["annotations"] = {}
        metadata["annotations"][STREAMING_ENABLED_ANNOTATION] = "true"

    try:
        # Pydantic returns the tool calls as a ValidatorIterator, so we need to iterate it
        for message in messages:
            if message.get("tool_calls"):
                iterated_messages = [tool_call for tool_call in message["tool_calls"]]
                if iterated_messages:
                    message["tool_calls"] = iterated_messages
                else:
                    del message["tool_calls"]

        # Build query spec with optional sessionId, conversationId and timeout
        query_spec_dict = {"type": "messages", "input": messages, "target": target}
        if session_id:
            query_spec_dict["sessionId"] = session_id
        if conversation_id:
            query_spec_dict["conversationId"] = conversation_id
        if timeout:
            query_spec_dict["timeout"] = timeout

        # Create the QueryV1alpha1 object with type="messages"
        query_resource = QueryV1alpha1(
            metadata=metadata,
            spec=QueryV1alpha1Spec(**query_spec_dict),
        )

        async with with_ark_client(namespace, "v1alpha1") as ark_client:
            # Create the query using QueryV1alpha1 object like queries API
            await ark_client.queries.a_create(query_resource)
            logger.info(f"Created query: {query_name}")

            # Extract timeout from query spec
            query_timeout_str = query_resource.spec.timeout
            timeout_seconds = parse_duration_to_seconds(query_timeout_str) or 300

            # If the caller didn't request streaming, we can simply poll for
            # the response.
            if not request.stream:
                return await watch_query_completion(
                    ark_client, query_name, model, messages, timeout_seconds
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
                completion = await watch_query_completion(
                    ark_client, query_name, model, messages, timeout_seconds
                )
                sse_lines = create_single_chunk_sse_response(completion)
                return StreamingResponse(
                    iter(sse_lines), media_type="text/event-stream", headers=sse_headers
                )

            # Streaming is enabled - get the base URL and construct full URL
            base_url = await get_streaming_base_url(streaming_config, namespace, v1)
            streaming_url = f"{base_url}/stream/{query_name}?from-beginning=true&wait-for-query={timeout_seconds}"

            # Proxy to the streaming endpoint
            logger.info(f"Streaming available for query: {query_name}")
            return StreamingResponse(
                proxy_streaming_response(streaming_url),
                media_type="text/event-stream",
                headers=sse_headers,
            )

    except ValidationError as e:
        # Return OpenAI-formatted error to adhere to OpenAI completions spec
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "message": str(e),
                    "type": "invalid_request_error",
                    "code": "invalid_value",
                }
            },
        )
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        # Return OpenAI-formatted error to adhere to OpenAI completions spec
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "message": str(e),
                    "type": "server_error",
                    "code": "internal_error",
                }
            },
        )


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
