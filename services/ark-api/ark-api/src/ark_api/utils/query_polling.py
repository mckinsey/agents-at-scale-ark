"""Query polling utilities for waiting on query completion."""

import asyncio
import logging
import time
from fastapi import HTTPException
from openai.types.chat import ChatCompletion, ChatCompletionMessage
from openai.types.chat.chat_completion import Choice
from openai.types.completion_usage import CompletionUsage

logger = logging.getLogger(__name__)


def _create_chat_completion_response(query_name: str, model: str, content: str, messages: list) -> ChatCompletion:
    """Create OpenAI-compatible chat completion response."""
    # Count tokens from messages array
    prompt_text = " ".join([
        str(msg.get('content', '')) if isinstance(msg, dict) else str(msg)
        for msg in messages
    ])
    prompt_tokens = len(prompt_text.split())
    completion_tokens = len(content.split())
    
    return ChatCompletion(
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


def _get_error_message(status: dict) -> str:
    """Extract error message from query status."""
    error_message = status.get("message", "")
    error_responses = status.get("responses", [])

    if error_message:
        return f"Query execution failed: {error_message}"
    elif error_responses and error_responses[0].get("error"):
        return f"Query execution failed: {error_responses[0].get('error')}"
    else:
        return "Query execution failed: No error details available"


async def poll_query_completion(ark_client, query_name: str, model: str, messages: list) -> ChatCompletion:
    """Poll for query completion and return chat completion response."""
    max_attempts = 60  # 5 minutes with 5 second intervals

    for _ in range(max_attempts):
        await asyncio.sleep(5)

        query = await ark_client.queries.a_get(query_name)
        query_dict = query.to_dict()
        status = query_dict.get("status", {})
        phase = status.get("phase", "pending")

        logger.info(f"Query {query_name} status: {phase}")

        if phase == "done":
            responses = status.get("responses", [])
            if not responses:
                raise HTTPException(status_code=500, detail="No response received")

            content = responses[0].get("content", "")
            return _create_chat_completion_response(query_name, model, content, messages)
                    
        elif phase == "error":
            detail_message = _get_error_message(status)
            raise HTTPException(status_code=500, detail=detail_message)
                
    # If we get here, we timed out waiting for completion
    raise HTTPException(status_code=504, detail=f"Query {query_name} timed out after 5 minutes")