"""Streaming utilities for converting responses to SSE format."""

from openai.types.chat import ChatCompletion, ChatCompletionChunk
from openai.types.chat.chat_completion_chunk import Choice as ChunkChoice, ChoiceDelta


def create_single_chunk_sse_response(completion: ChatCompletion) -> list[str]:
    """Convert a complete ChatCompletion to SSE format with a single chunk.

    This is used when streaming is requested but not available (fallback mode).
    Per the OpenAI specification, we send the complete response as a single chunk.

    Args:
        completion: The complete ChatCompletion response from polling

    Returns:
        List of SSE-formatted strings
    """
    # Create a single chunk with the full content
    chunk = ChatCompletionChunk(
        id=completion.id,
        object="chat.completion.chunk",
        created=completion.created,
        model=completion.model,
        choices=[
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
        usage=completion.usage
    )

    # Return SSE format strings
    return [
        f"data: {chunk.model_dump_json()}\n\n",
        "data: [DONE]\n\n"
    ]