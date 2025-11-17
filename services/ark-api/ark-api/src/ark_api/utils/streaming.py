"""Streaming utilities for converting responses to SSE format."""

from typing import TypedDict

from openai.types.chat import ChatCompletion, ChatCompletionChunk
from openai.types.chat.chat_completion_chunk import Choice as ChunkChoice, ChoiceDelta


class StreamingErrorDetail(TypedDict, total=False):
    """Error detail structure for streaming error responses."""
    status: int
    message: str
    type: str
    code: str


class StreamingErrorResponse(TypedDict):
    """OpenAI-compatible error response format for streaming."""
    error: StreamingErrorDetail


def create_single_chunk_sse_response(completion: ChatCompletion) -> list[str]:
    """Convert a complete ChatCompletion to SSE format with a single chunk.

    This is used when streaming is requested but not available (fallback mode).
    Per the OpenAI specification, we send the complete response as a single chunk.

    Args:
        completion: The complete ChatCompletion response from polling

    Returns:
        List of SSE-formatted strings
    """
    chunk_data = {
        "id": completion.id,
        "object": "chat.completion.chunk",
        "created": completion.created,
        "model": completion.model,
        "choices": [
            ChunkChoice(
                index=0,
                delta=ChoiceDelta(
                    role="assistant",
                    content=completion.choices[0].message.content
                ),
                finish_reason="stop"
            )
        ],
        # Include usage data in the final chunk (OpenAI does this too)
        "usage": completion.usage
    }

    # Add Ark metadata if present in completion
    if hasattr(completion, 'ark'):
        chunk_data["ark"] = completion.ark

    chunk = ChatCompletionChunk(**chunk_data)

    # Return SSE format strings
    return [
        f"data: {chunk.model_dump_json()}\n\n",
        "data: [DONE]\n\n"
    ]