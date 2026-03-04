import pytest

from ark_sdk.executor import (
    AgentConfig,
    ExecutionEngineRequest,
    ExecutionProfile,
    Message,
    Model,
)

from executor_claude_cli.config import EngineConfig
from executor_claude_cli.executor import ClaudeCliExecutor


class TestClaudeCliExecutorInit:
    def test_engine_name(self, mock_config):
        executor = ClaudeCliExecutor(mock_config)
        assert executor.engine_name == "claude-cli"

    def test_default_config(self):
        executor = ClaudeCliExecutor(EngineConfig())
        assert executor.config.workspace_dir == "/workspace"


class TestExecutionProfile:
    def test_profile_values(self, mock_config):
        executor = ClaudeCliExecutor(mock_config)
        profile = executor.get_execution_profile()

        assert isinstance(profile, ExecutionProfile)
        assert profile.tool_mode == "autonomous"
        assert profile.memory_mode == "inline"
        assert profile.structured_output is True
        assert profile.streaming is False
        assert profile.supported_models == ["anthropic", "bedrock", "vertex"]

    def test_profile_card_dict(self, mock_config):
        executor = ClaudeCliExecutor(mock_config)
        card = executor.get_execution_profile().to_card_dict()

        assert card["toolMode"] == "autonomous"
        assert card["memoryMode"] == "inline"
        assert card["structuredOutput"] is True
        assert card["streaming"] is False
        assert "anthropic" in card["supportedModels"]


class TestMockExecution:
    @pytest.mark.asyncio
    async def test_mock_returns_canned_response(self, mock_config, sample_request):
        executor = ClaudeCliExecutor(mock_config)
        result = await executor.execute_agent(sample_request)

        assert len(result) == 1
        assert result[0].role == "assistant"
        assert result[0].content == "Test mock response"

    @pytest.mark.asyncio
    async def test_mock_custom_response(self, sample_request):
        config = EngineConfig(mock_mode=True, mock_response="Custom response text")
        executor = ClaudeCliExecutor(config)
        result = await executor.execute_agent(sample_request)

        assert result[0].content == "Custom response text"


class TestModelValidation:
    @pytest.mark.asyncio
    async def test_unsupported_model_type_raises(self, mock_config, sample_request):
        sample_request.agent.model = Model(name="gpt-4", type="openai", config={})
        executor = ClaudeCliExecutor(mock_config)

        with pytest.raises(ValueError, match="Unsupported model type: openai"):
            await executor.execute_agent(sample_request)

    @pytest.mark.asyncio
    async def test_anthropic_model_accepted(self, mock_config, sample_request, anthropic_model):
        sample_request.agent.model = anthropic_model
        executor = ClaudeCliExecutor(mock_config)
        result = await executor.execute_agent(sample_request)
        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_bedrock_model_accepted(self, mock_config, sample_request, bedrock_model):
        sample_request.agent.model = bedrock_model
        executor = ClaudeCliExecutor(mock_config)
        result = await executor.execute_agent(sample_request)
        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_vertex_model_accepted(self, mock_config, sample_request, vertex_model):
        sample_request.agent.model = vertex_model
        executor = ClaudeCliExecutor(mock_config)
        result = await executor.execute_agent(sample_request)
        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_empty_model_type_accepted(self, mock_config, sample_request):
        sample_request.agent.model = Model(name="claude-sonnet-4-20250514", type="", config={})
        executor = ClaudeCliExecutor(mock_config)
        result = await executor.execute_agent(sample_request)
        assert len(result) == 1


class TestModelEnvMapping:
    def test_anthropic_env(self, mock_config, anthropic_model):
        executor = ClaudeCliExecutor(mock_config)
        env = executor._build_model_env(anthropic_model)
        assert env == {"ANTHROPIC_API_KEY": "test-key"}

    def test_bedrock_env(self, mock_config, bedrock_model):
        executor = ClaudeCliExecutor(mock_config)
        env = executor._build_model_env(bedrock_model)
        assert env == {
            "AWS_REGION": "us-east-1",
            "AWS_ACCESS_KEY_ID": "AKIATEST",
            "AWS_SECRET_ACCESS_KEY": "secret123",
        }

    def test_vertex_env(self, mock_config, vertex_model):
        executor = ClaudeCliExecutor(mock_config)
        env = executor._build_model_env(vertex_model)
        assert env == {
            "GOOGLE_CLOUD_PROJECT": "my-project",
            "GOOGLE_CLOUD_REGION": "us-central1",
        }

    def test_empty_config_returns_empty_env(self, mock_config):
        model = Model(name="test", type="anthropic", config={})
        executor = ClaudeCliExecutor(mock_config)
        env = executor._build_model_env(model)
        assert env == {}

    def test_unknown_type_returns_empty_env(self, mock_config):
        model = Model(name="test", type="unknown", config={})
        executor = ClaudeCliExecutor(mock_config)
        env = executor._build_model_env(model)
        assert env == {}


class TestPromptBuilding:
    def test_simple_prompt(self, mock_config, sample_request):
        executor = ClaudeCliExecutor(mock_config)
        prompt = executor._build_prompt(sample_request)
        assert prompt == "Hello, world!"

    def test_prompt_with_history(self, mock_config, sample_request_with_history):
        executor = ClaudeCliExecutor(mock_config)
        prompt = executor._build_prompt(sample_request_with_history)

        assert "[user]: Previous question" in prompt
        assert "[assistant]: Previous answer" in prompt
        assert "Follow up question" in prompt

    def test_model_name_resolution(self, mock_config, anthropic_model):
        executor = ClaudeCliExecutor(mock_config)
        assert executor._resolve_model_name(anthropic_model) == "claude-sonnet-4-20250514"

    def test_empty_model_name_returns_none(self, mock_config):
        model = Model(name="", type="anthropic", config={})
        executor = ClaudeCliExecutor(mock_config)
        assert executor._resolve_model_name(model) is None


class TestOutputFormat:
    def test_no_output_schema(self, mock_config, sample_request):
        executor = ClaudeCliExecutor(mock_config)
        result = executor._build_output_format(sample_request.agent)
        assert result is None

    def test_with_output_schema(self, mock_config):
        schema = {
            "type": "object",
            "properties": {"summary": {"type": "string"}},
        }

        class AgentWithSchema:
            outputSchema = schema

        executor = ClaudeCliExecutor(mock_config)
        result = executor._build_output_format(AgentWithSchema())
        assert result == {"type": "json_schema", "schema": schema}

    def test_with_output_schema_snake_case(self, mock_config):
        schema = {"type": "object"}

        class AgentWithSchema:
            output_schema = schema

        executor = ClaudeCliExecutor(mock_config)
        result = executor._build_output_format(AgentWithSchema())
        assert result == {"type": "json_schema", "schema": schema}
