"""Query polling utilities for waiting on query completion."""

import logging
import time
from fastapi import HTTPException
from openai.types.chat import ChatCompletion, ChatCompletionMessage
from openai.types.chat.chat_completion import Choice
from openai.types.completion_usage import CompletionUsage
from kubernetes_asyncio import client, watch

from ark_api.core.constants import GROUP

logger = logging.getLogger(__name__)


def _create_chat_completion_response(query_name: str, model: str, content: str, messages: list, query_status: dict = None) -> ChatCompletion:
    """Create OpenAI-compatible chat completion response."""
    # Count tokens from messages array
    prompt_text = " ".join([
        str(msg.get('content', '')) if isinstance(msg, dict) else str(msg)
        for msg in messages
    ])
    prompt_tokens = len(prompt_text.split())
    completion_tokens = len(content.split())

    response = ChatCompletion(
        id=query_name,
        object="chat.completion",
        created=int(time.time()),
        model=model,
        choices=[
            Choice(
                index=0,
                message=ChatCompletionMessage(role="assistant", content=content),
                finish_reason="stop",
            )
        ],
        usage=CompletionUsage(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
        ),
    )

    if query_status:
        response.ark = {"queryStatus": query_status}

    return response


def _get_error_detail(status: dict) -> dict:
    """Extract error details from query status.

    Returns a structured error dict with:
    - message: The error message from the response or status
    """
    error_message = status.get("message", "")
    response = status.get("response", {})

    logger.info(f"_get_error_detail - error_message: {error_message}, response: {response}")

    # Get error from response content if available
    response_content = response.get("content", "") if response else ""

    if response_content:
        main_message = response_content
    elif error_message:
        main_message = error_message
    else:
        main_message = "Query execution failed: No error details available"

    return {
        "message": main_message,
        "errors": []
    }


async def watch_query_completion(ark_client, query_name: str, model: str, messages: list, timeout_seconds: int) -> ChatCompletion:
    """Watch for query completion using Kubernetes watch API and return chat completion response."""
    namespace = ark_client.namespace

    api_client = client.ApiClient()
    custom_api = client.CustomObjectsApi(api_client)
    w = watch.Watch()

    try:
        async for event in w.stream(
            custom_api.list_namespaced_custom_object,
            group=GROUP,
            version="v1alpha1",
            namespace=namespace,
            plural="queries",
            field_selector=f"metadata.name={query_name}",
            timeout_seconds=timeout_seconds
        ):
            event_type = event['type']
            query_obj = event['object']

            status = query_obj.get("status", {})
            phase = status.get("phase", "pending")

            if phase == "done":
                response = status.get("response")
                if not response:
                    w.stop()
                    raise HTTPException(status_code=500, detail="No response received")

                content = response.get("content", "")
                w.stop()
                return _create_chat_completion_response(query_name, model, content, messages, status)

            elif phase == "error":
                error_detail = _get_error_detail(status)
                w.stop()
                raise HTTPException(status_code=500, detail=error_detail)

        raise HTTPException(status_code=504, detail=f"Query {query_name} timed out after {timeout_seconds} seconds")

    finally:
        await api_client.close()