import pytest

from ark_sdk.executor import (
    AgentConfig,
    ExecutionEngineRequest,
    Message,
    Model,
    Parameter,
    ToolDefinition,
)

from executor_claude_cli.config import EngineConfig


@pytest.fixture
def mock_config():
    return EngineConfig(
        workspace_dir="/tmp/test-workspace",
        mock_mode=True,
        mock_response="Test mock response",
        max_turns=10,
        port=9999,
    )


@pytest.fixture
def anthropic_model():
    return Model(
        name="claude-sonnet-4-20250514",
        type="anthropic",
        config={"anthropic": {"apiKey": "test-key"}},
    )


@pytest.fixture
def bedrock_model():
    return Model(
        name="claude-sonnet-4-20250514",
        type="bedrock",
        config={
            "bedrock": {
                "region": "us-east-1",
                "accessKeyId": "AKIATEST",
                "secretAccessKey": "secret123",
            }
        },
    )


@pytest.fixture
def vertex_model():
    return Model(
        name="claude-sonnet-4-20250514",
        type="vertex",
        config={
            "vertex": {
                "project": "my-project",
                "region": "us-central1",
            }
        },
    )


@pytest.fixture
def sample_agent(anthropic_model):
    return AgentConfig(
        name="test-agent",
        namespace="default",
        prompt="You are a helpful assistant.",
        description="Test agent",
        parameters=[Parameter(name="repo_url", value="https://github.com/org/repo")],
        model=anthropic_model,
    )


@pytest.fixture
def sample_request(sample_agent):
    return ExecutionEngineRequest(
        agent=sample_agent,
        userInput=Message(role="user", content="Hello, world!"),
        history=[],
        tools=[],
    )


@pytest.fixture
def sample_request_with_history(sample_agent):
    return ExecutionEngineRequest(
        agent=sample_agent,
        userInput=Message(role="user", content="Follow up question"),
        history=[
            Message(role="user", content="Previous question"),
            Message(role="assistant", content="Previous answer"),
        ],
        tools=[
            ToolDefinition(
                name="search",
                description="Search docs",
                parameters={"type": "object"},
            )
        ],
    )
