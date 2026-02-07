"""Test configuration and fixtures for OpenAI executor tests."""

import pytest
from unittest.mock import Mock, AsyncMock, MagicMock
from typing import Any, Dict, List

from ark_executor_common import (
    AgentConfig,
    ExecutionEngineRequest,
    Message,
    Model,
    Parameter,
    ToolDefinition,
)


@pytest.fixture
def sample_model() -> Model:
    return Model(
        name="gpt-4o",
        type="openai",
        config={
            "openai": {
                "apiKey": "test-api-key",
                "baseUrl": "https://api.openai.com/v1",
                "properties": {
                    "temperature": 0.7,
                    "max_tokens": 1000,
                },
            }
        },
    )


@pytest.fixture
def sample_azure_model() -> Model:
    return Model(
        name="gpt-4o",
        type="azure",
        config={
            "azure": {
                "apiKey": "azure-test-key",
                "baseUrl": "https://my-resource.openai.azure.com",
                "apiVersion": "2024-02-01",
                "properties": {
                    "temperature": 0.5,
                    "top_p": 0.9,
                },
            }
        },
    )


@pytest.fixture
def sample_agent_config(sample_model) -> AgentConfig:
    return AgentConfig(
        name="test-agent",
        namespace="default",
        prompt="You are a helpful assistant. User name is {{name}}.",
        description="A test agent",
        parameters=[Parameter(name="name", value="Alice")],
        model=sample_model,
        labels={},
    )


@pytest.fixture
def sample_agent_config_with_labels(sample_model) -> AgentConfig:
    return AgentConfig(
        name="test-agent",
        namespace="default",
        prompt="You are a code assistant.",
        description="A coding agent",
        parameters=[],
        model=sample_model,
        labels={
            "openai-web-search": "true",
            "openai-code-interpreter": "true",
            "openai-file-search-vector-stores": "vs_123,vs_456",
        },
    )


@pytest.fixture
def sample_agent_config_no_tools(sample_model) -> AgentConfig:
    return AgentConfig(
        name="test-agent",
        namespace="default",
        prompt="You are a simple assistant.",
        description="No tools",
        parameters=[],
        model=sample_model,
        labels={
            "openai-web-search": "false",
            "openai-code-interpreter": "false",
        },
    )


@pytest.fixture
def sample_user_message() -> Message:
    return Message(role="user", content="Hello, how are you?", name="")


@pytest.fixture
def sample_history() -> List[Message]:
    return [
        Message(role="user", content="Hi there", name=""),
        Message(role="assistant", content="Hello! How can I help you?", name="test-agent"),
    ]


@pytest.fixture
def sample_request(sample_agent_config, sample_user_message, sample_history) -> ExecutionEngineRequest:
    return ExecutionEngineRequest(
        agent=sample_agent_config,
        userInput=sample_user_message,
        history=sample_history,
        tools=[],
    )


@pytest.fixture
def sample_request_with_tools(sample_agent_config_with_labels, sample_user_message) -> ExecutionEngineRequest:
    return ExecutionEngineRequest(
        agent=sample_agent_config_with_labels,
        userInput=sample_user_message,
        history=[],
        tools=[
            ToolDefinition(
                name="get_weather",
                description="Get weather for a location",
                parameters={"location": {"type": "string"}},
            )
        ],
    )


@pytest.fixture
def mock_openai_client():
    client = AsyncMock()
    return client


@pytest.fixture
def mock_run_result():
    result = Mock()
    result.final_output = "This is the final response from the agent."
    result.new_items = []
    result.context_wrapper = Mock()
    result.context_wrapper.usage = Mock()
    result.context_wrapper.usage.input_tokens = 100
    result.context_wrapper.usage.output_tokens = 50
    result.context_wrapper.usage.total_tokens = 150
    return result


@pytest.fixture
def mock_run_result_no_final():
    result = Mock()
    result.final_output = None
    
    item = Mock()
    output_item = Mock()
    output_item.text = "Response from new items"
    item.output = [output_item]
    result.new_items = [item]
    
    result.context_wrapper = Mock()
    result.context_wrapper.usage = Mock()
    result.context_wrapper.usage.input_tokens = 50
    result.context_wrapper.usage.output_tokens = 25
    result.context_wrapper.usage.total_tokens = 75
    return result


@pytest.fixture
def mock_run_result_empty():
    result = Mock()
    result.final_output = None
    result.new_items = []
    result.context_wrapper = Mock()
    result.context_wrapper.usage = Mock()
    result.context_wrapper.usage.total_tokens = 0
    return result


@pytest.fixture
def mock_stream_event():
    event = Mock()
    event.data = Mock()
    choice = Mock()
    choice.delta = Mock()
    choice.delta.content = "Hello"
    event.data.choices = [choice]
    return event


@pytest.fixture
def mock_stream_event_no_content():
    event = Mock()
    event.data = Mock()
    choice = Mock()
    choice.delta = Mock()
    choice.delta.content = None
    event.data.choices = [choice]
    return event
