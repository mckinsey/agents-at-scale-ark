import json
from openai.types.chat import ChatCompletion, ChatCompletionMessage
from openai.types.chat.chat_completion import CompletionUsage, Choice
from ark_api.utils.streaming import create_single_chunk_sse_response


def test_create_single_chunk_sse_response_basic():
    """Test basic conversion of ChatCompletion to SSE format."""
    completion = ChatCompletion(
        id="chatcmpl-test123",
        object="chat.completion",
        created=1234567890,
        model="gpt-4",
        choices=[
            Choice(
                index=0,
                message=ChatCompletionMessage(
                    role="assistant",
                    content="Hello, world!"
                ),
                finish_reason="stop"
            )
        ],
        usage=CompletionUsage(
            prompt_tokens=10,
            completion_tokens=5,
            total_tokens=15
        )
    )

    result = create_single_chunk_sse_response(completion)

    # Should return a list with 2 items
    assert len(result) == 2

    # First item should be the data chunk
    assert result[0].startswith("data: ")
    assert result[0].endswith("\n\n")

    # Parse the JSON data
    json_str = result[0][6:-2]  # Remove "data: " prefix and "\n\n" suffix
    chunk_data = json.loads(json_str)

    # Verify chunk structure
    assert chunk_data["id"] == "chatcmpl-test123"
    assert chunk_data["object"] == "chat.completion.chunk"
    assert chunk_data["created"] == 1234567890
    assert chunk_data["model"] == "gpt-4"
    assert len(chunk_data["choices"]) == 1
    assert chunk_data["choices"][0]["index"] == 0
    assert chunk_data["choices"][0]["delta"]["content"] == "Hello, world!"
    assert chunk_data["choices"][0]["finish_reason"] == "stop"
    assert chunk_data["usage"]["prompt_tokens"] == 10
    assert chunk_data["usage"]["completion_tokens"] == 5
    assert chunk_data["usage"]["total_tokens"] == 15

    # Second item should be [DONE]
    assert result[1] == "data: [DONE]\n\n"


def test_create_single_chunk_sse_response_no_usage():
    """Test conversion when usage is None."""
    completion = ChatCompletion(
        id="chatcmpl-test456",
        object="chat.completion",
        created=1234567890,
        model="gpt-3.5-turbo",
        choices=[
            Choice(
                index=0,
                message=ChatCompletionMessage(
                    role="assistant",
                    content="Test response"
                ),
                finish_reason="stop"
            )
        ],
        usage=None
    )

    result = create_single_chunk_sse_response(completion)

    assert len(result) == 2

    # Parse the JSON data
    json_str = result[0][6:-2]
    chunk_data = json.loads(json_str)

    # Usage should be None
    assert chunk_data["usage"] is None
    assert chunk_data["choices"][0]["delta"]["content"] == "Test response"


def test_create_single_chunk_sse_response_empty_content():
    """Test conversion with empty content."""
    completion = ChatCompletion(
        id="chatcmpl-test789",
        object="chat.completion",
        created=1234567890,
        model="gpt-4",
        choices=[
            Choice(
                index=0,
                message=ChatCompletionMessage(
                    role="assistant",
                    content=""
                ),
                finish_reason="stop"
            )
        ],
        usage=None
    )

    result = create_single_chunk_sse_response(completion)

    assert len(result) == 2

    # Parse the JSON data
    json_str = result[0][6:-2]
    chunk_data = json.loads(json_str)

    # Content should be empty string
    assert chunk_data["choices"][0]["delta"]["content"] == ""
    assert chunk_data["choices"][0]["finish_reason"] == "stop"


def test_create_single_chunk_sse_response_none_content():
    """Test conversion with None content."""
    completion = ChatCompletion(
        id="chatcmpl-test999",
        object="chat.completion",
        created=1234567890,
        model="gpt-4",
        choices=[
            Choice(
                index=0,
                message=ChatCompletionMessage(
                    role="assistant",
                    content=None
                ),
                finish_reason="stop"
            )
        ],
        usage=None
    )

    result = create_single_chunk_sse_response(completion)

    assert len(result) == 2

    # Parse the JSON data
    json_str = result[0][6:-2]
    chunk_data = json.loads(json_str)

    # Content should be None
    assert chunk_data["choices"][0]["delta"]["content"] is None
    assert chunk_data["choices"][0]["finish_reason"] == "stop"