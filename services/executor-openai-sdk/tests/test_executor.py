"""Tests for OpenAI Agents SDK executor."""

import os
import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock

from ark_executor_common import Message


class TestToBool:
    """Tests for the _to_bool helper function."""

    def test_bool_true(self):
        from openai_executor.executor import _to_bool
        assert _to_bool(True) is True

    def test_bool_false(self):
        from openai_executor.executor import _to_bool
        assert _to_bool(False) is False

    def test_string_true_values(self):
        from openai_executor.executor import _to_bool
        assert _to_bool("true") is True
        assert _to_bool("True") is True
        assert _to_bool("TRUE") is True
        assert _to_bool("1") is True
        assert _to_bool("yes") is True
        assert _to_bool("Yes") is True
        assert _to_bool("YES") is True

    def test_string_false_values(self):
        from openai_executor.executor import _to_bool
        assert _to_bool("false") is False
        assert _to_bool("False") is False
        assert _to_bool("0") is False
        assert _to_bool("no") is False
        assert _to_bool("") is False
        assert _to_bool("random") is False

    def test_other_types(self):
        from openai_executor.executor import _to_bool
        assert _to_bool(1) is True
        assert _to_bool(0) is False
        assert _to_bool([]) is False
        assert _to_bool([1]) is True
        assert _to_bool(None) is False


class TestParseMcpServers:
    """Tests for MCP server parsing from environment variables."""

    def test_parse_single_server(self):
        with patch.dict(os.environ, {
            "ARK_MCP_SERVER_TEST_URL": "https://mcp.example.com",
            "ARK_MCP_SERVER_TEST_LABEL": "my-mcp-server",
        }, clear=False):
            from openai_executor.executor import _parse_mcp_servers
            servers = _parse_mcp_servers()
            assert len(servers) == 1
            assert servers[0]["url"] == "https://mcp.example.com"
            assert servers[0]["label"] == "my-mcp-server"

    def test_parse_server_with_headers(self):
        with patch.dict(os.environ, {
            "ARK_MCP_SERVER_AUTH_URL": "https://mcp.example.com",
            "ARK_MCP_SERVER_AUTH_LABEL": "auth-server",
            "ARK_MCP_SERVER_AUTH_HEADERS": "Authorization=Bearer token,X-Custom=value",
        }, clear=False):
            from openai_executor.executor import _parse_mcp_servers
            servers = _parse_mcp_servers()
            auth_server = next((s for s in servers if s["label"] == "auth-server"), None)
            assert auth_server is not None
            assert auth_server["headers"]["Authorization"] == "Bearer token"
            assert auth_server["headers"]["X-Custom"] == "value"

    def test_parse_server_default_label(self):
        with patch.dict(os.environ, {
            "ARK_MCP_SERVER_GITHUB_URL": "https://github-mcp.example.com",
        }, clear=False):
            from openai_executor.executor import _parse_mcp_servers
            servers = _parse_mcp_servers()
            github_server = next((s for s in servers if s["url"] == "https://github-mcp.example.com"), None)
            assert github_server is not None
            assert github_server["label"] == "github"

    def test_no_mcp_servers(self):
        with patch.dict(os.environ, {}, clear=True):
            from openai_executor.executor import _parse_mcp_servers
            servers = _parse_mcp_servers()
            assert servers == []


class TestArkAgentHooks:
    """Tests for the ArkAgentHooks class."""

    @pytest.mark.asyncio
    async def test_on_start(self, caplog):
        from openai_executor.executor import ArkAgentHooks
        import logging
        
        caplog.set_level(logging.INFO)
        hooks = ArkAgentHooks("test-agent", "default")
        
        await hooks.on_start(None, None)
        assert "Agent starting execution" in caplog.text

    @pytest.mark.asyncio
    async def test_on_end(self, caplog):
        from openai_executor.executor import ArkAgentHooks
        import logging
        
        caplog.set_level(logging.INFO)
        hooks = ArkAgentHooks("test-agent", "default")
        
        await hooks.on_end(None, None, None)
        assert "Agent completed execution" in caplog.text

    @pytest.mark.asyncio
    async def test_on_tool_start(self, caplog):
        from openai_executor.executor import ArkAgentHooks
        import logging
        
        caplog.set_level(logging.INFO)
        hooks = ArkAgentHooks("test-agent", "default")
        
        tool = Mock()
        tool.name = "web_search"
        
        await hooks.on_tool_start(None, None, tool)
        assert "Tool 'web_search' starting" in caplog.text

    @pytest.mark.asyncio
    async def test_on_tool_end(self, caplog):
        from openai_executor.executor import ArkAgentHooks
        import logging
        
        caplog.set_level(logging.INFO)
        hooks = ArkAgentHooks("test-agent", "default")
        
        tool = Mock()
        tool.name = "web_search"
        
        await hooks.on_tool_end(None, None, tool, None)
        assert "Tool 'web_search' completed" in caplog.text

    @pytest.mark.asyncio
    async def test_on_llm_start(self, caplog):
        from openai_executor.executor import ArkAgentHooks
        import logging
        
        caplog.set_level(logging.DEBUG)
        hooks = ArkAgentHooks("test-agent", "default")
        
        await hooks.on_llm_start(None, None, "system prompt", [])
        assert "LLM call starting" in caplog.text

    @pytest.mark.asyncio
    async def test_on_llm_end(self, caplog):
        from openai_executor.executor import ArkAgentHooks
        import logging
        
        caplog.set_level(logging.DEBUG)
        hooks = ArkAgentHooks("test-agent", "default")
        
        await hooks.on_llm_end(None, None, None)
        assert "LLM call completed" in caplog.text


class TestOpenAIAgentsExecutor:
    """Tests for the OpenAIAgentsExecutor class."""

    def test_initialization(self):
        from openai_executor.executor import OpenAIAgentsExecutor
        
        executor = OpenAIAgentsExecutor()
        assert executor.engine_name == "OpenAI Agents SDK"

    def test_build_input(self, sample_request):
        from openai_executor.executor import OpenAIAgentsExecutor
        
        messages = OpenAIAgentsExecutor._build_input(sample_request)
        
        assert len(messages) == 3
        assert messages[0] == {"role": "user", "content": "Hi there"}
        assert messages[1] == {"role": "assistant", "content": "Hello! How can I help you?"}
        assert messages[2] == {"role": "user", "content": "Hello, how are you?"}

    def test_build_input_empty_history(self, sample_agent_config, sample_user_message):
        from openai_executor.executor import OpenAIAgentsExecutor
        from ark_executor_common import ExecutionEngineRequest
        
        request = ExecutionEngineRequest(
            agent=sample_agent_config,
            userInput=sample_user_message,
            history=[],
            tools=[],
        )
        
        messages = OpenAIAgentsExecutor._build_input(request)
        
        assert len(messages) == 1
        assert messages[0] == {"role": "user", "content": "Hello, how are you?"}

    def test_build_model_settings_with_properties(self, sample_request):
        from openai_executor.executor import OpenAIAgentsExecutor
        
        settings = OpenAIAgentsExecutor._build_model_settings(sample_request)
        
        assert settings.temperature == pytest.approx(0.7)
        assert settings.max_tokens == 1000

    def test_build_model_settings_with_all_properties(self, sample_agent_config):
        from openai_executor.executor import OpenAIAgentsExecutor
        from ark_executor_common import ExecutionEngineRequest, Message
        
        sample_agent_config.model.config["openai"]["properties"] = {
            "temperature": 0.5,
            "top_p": 0.9,
            "frequency_penalty": 0.1,
            "presence_penalty": 0.2,
            "max_tokens": 500,
            "tool_choice": "auto",
            "parallel_tool_calls": "true",
            "truncation": "auto",
            "store": "true",
        }
        
        request = ExecutionEngineRequest(
            agent=sample_agent_config,
            userInput=Message(role="user", content="test"),
            history=[],
            tools=[],
        )
        
        settings = OpenAIAgentsExecutor._build_model_settings(request)
        
        assert settings.temperature == pytest.approx(0.5)
        assert settings.top_p == pytest.approx(0.9)
        assert settings.frequency_penalty == pytest.approx(0.1)
        assert settings.presence_penalty == pytest.approx(0.2)
        assert settings.max_tokens == 500
        assert settings.tool_choice == "auto"
        assert settings.parallel_tool_calls is True
        assert settings.truncation == "auto"
        assert settings.store is True

    def test_build_model_settings_truncation_disabled(self, sample_agent_config):
        from openai_executor.executor import OpenAIAgentsExecutor
        from ark_executor_common import ExecutionEngineRequest, Message
        
        sample_agent_config.model.config["openai"]["properties"] = {
            "truncation": "disabled",
        }
        
        request = ExecutionEngineRequest(
            agent=sample_agent_config,
            userInput=Message(role="user", content="test"),
            history=[],
            tools=[],
        )
        
        settings = OpenAIAgentsExecutor._build_model_settings(request)
        assert settings.truncation == "disabled"

    def test_build_model_settings_invalid_truncation_ignored(self, sample_agent_config):
        from openai_executor.executor import OpenAIAgentsExecutor
        from ark_executor_common import ExecutionEngineRequest, Message
        
        sample_agent_config.model.config["openai"]["properties"] = {
            "truncation": "invalid",
        }
        
        request = ExecutionEngineRequest(
            agent=sample_agent_config,
            userInput=Message(role="user", content="test"),
            history=[],
            tools=[],
        )
        
        settings = OpenAIAgentsExecutor._build_model_settings(request)
        assert settings.truncation is None

    def test_build_run_config(self, sample_request):
        from openai_executor.executor import OpenAIAgentsExecutor
        
        config = OpenAIAgentsExecutor._build_run_config(sample_request)
        
        assert config.workflow_name == "default/test-agent"

    def test_build_tools_defaults(self, sample_request):
        from openai_executor.executor import OpenAIAgentsExecutor
        from agents import WebSearchTool
        
        executor = OpenAIAgentsExecutor()
        tools = executor._build_tools(sample_request)
        
        assert len(tools) == 1
        assert isinstance(tools[0], WebSearchTool)

    @patch("openai_executor.executor.CodeInterpreterTool")
    @patch("openai_executor.executor.FileSearchTool")
    @patch("openai_executor.executor.WebSearchTool")
    def test_build_tools_with_all_tools(
        self, mock_web_search, mock_file_search, mock_code_interpreter, sample_request_with_tools
    ):
        from openai_executor.executor import OpenAIAgentsExecutor
        
        executor = OpenAIAgentsExecutor()
        tools = executor._build_tools(sample_request_with_tools)
        
        assert len(tools) == 3
        mock_web_search.assert_called_once()
        mock_code_interpreter.assert_called_once()
        mock_file_search.assert_called_once()

    def test_build_tools_no_web_search(self, sample_agent_config_no_tools, sample_user_message):
        from openai_executor.executor import OpenAIAgentsExecutor
        from ark_executor_common import ExecutionEngineRequest
        
        request = ExecutionEngineRequest(
            agent=sample_agent_config_no_tools,
            userInput=sample_user_message,
            history=[],
            tools=[],
        )
        
        executor = OpenAIAgentsExecutor()
        tools = executor._build_tools(request)
        
        assert len(tools) == 0

    @patch("openai_executor.executor.CodeInterpreterTool")
    @patch("openai_executor.executor.FileSearchTool")
    @patch("openai_executor.executor.WebSearchTool")
    def test_build_tools_file_search_vector_stores(
        self, mock_web_search, mock_file_search, mock_code_interpreter, sample_request_with_tools
    ):
        from openai_executor.executor import OpenAIAgentsExecutor
        
        executor = OpenAIAgentsExecutor()
        executor._build_tools(sample_request_with_tools)
        
        mock_file_search.assert_called_once_with(vector_store_ids=["vs_123", "vs_456"])

    @patch("openai_executor.executor.MCP_SERVERS", [
        {"url": "https://mcp.example.com", "label": "test-mcp", "headers": {"Auth": "token"}}
    ])
    def test_build_tools_with_mcp(self, sample_agent_config_no_tools, sample_user_message):
        from openai_executor.executor import OpenAIAgentsExecutor
        from ark_executor_common import ExecutionEngineRequest
        from agents import HostedMCPTool
        
        request = ExecutionEngineRequest(
            agent=sample_agent_config_no_tools,
            userInput=sample_user_message,
            history=[],
            tools=[],
        )
        
        executor = OpenAIAgentsExecutor()
        tools = executor._build_tools(request)
        
        mcp_tool = next((t for t in tools if isinstance(t, HostedMCPTool)), None)
        assert mcp_tool is not None

    def test_create_openai_client_with_api_key_and_base_url(self, sample_request):
        from openai_executor.executor import OpenAIAgentsExecutor
        
        executor = OpenAIAgentsExecutor()
        client = executor._create_openai_client(sample_request)
        
        assert client.api_key == "test-api-key"
        assert client.base_url.host == "api.openai.com"

    def test_create_openai_client_azure(self, sample_azure_model, sample_user_message):
        from openai_executor.executor import OpenAIAgentsExecutor
        from ark_executor_common import ExecutionEngineRequest, AgentConfig
        
        agent_config = AgentConfig(
            name="azure-agent",
            namespace="default",
            prompt="You are helpful.",
            model=sample_azure_model,
        )
        
        request = ExecutionEngineRequest(
            agent=agent_config,
            userInput=sample_user_message,
            history=[],
            tools=[],
        )
        
        executor = OpenAIAgentsExecutor()
        client = executor._create_openai_client(request)
        
        assert client.api_key == "azure-test-key"
        assert "openai.azure.com" in str(client.base_url)

    def test_convert_result_with_final_output(self, mock_run_result):
        from openai_executor.executor import OpenAIAgentsExecutor
        
        executor = OpenAIAgentsExecutor()
        messages = executor._convert_result(mock_run_result, "test-agent")
        
        assert len(messages) == 1
        assert messages[0].role == "assistant"
        assert messages[0].content == "This is the final response from the agent."
        assert messages[0].name == "test-agent"

    def test_convert_result_from_new_items(self, mock_run_result_no_final):
        from openai_executor.executor import OpenAIAgentsExecutor
        
        executor = OpenAIAgentsExecutor()
        messages = executor._convert_result(mock_run_result_no_final, "test-agent")
        
        assert len(messages) == 1
        assert messages[0].content == "Response from new items"

    def test_convert_result_empty(self, mock_run_result_empty):
        from openai_executor.executor import OpenAIAgentsExecutor
        
        executor = OpenAIAgentsExecutor()
        messages = executor._convert_result(mock_run_result_empty, "test-agent")
        
        assert len(messages) == 1
        assert messages[0].content == "No response generated"

    def test_attach_token_usage(self, mock_run_result):
        from openai_executor.executor import OpenAIAgentsExecutor
        
        messages = [Message(role="assistant", content="test", name="agent")]
        OpenAIAgentsExecutor._attach_token_usage(messages, mock_run_result)
        
        assert messages[0].token_usage is not None
        assert messages[0].token_usage["prompt_tokens"] == 100
        assert messages[0].token_usage["completion_tokens"] == 50
        assert messages[0].token_usage["total_tokens"] == 150

    def test_attach_token_usage_no_usage(self, mock_run_result_empty):
        from openai_executor.executor import OpenAIAgentsExecutor
        
        messages = [Message(role="assistant", content="test", name="agent")]
        OpenAIAgentsExecutor._attach_token_usage(messages, mock_run_result_empty)
        
        assert not hasattr(messages[0], "token_usage") or messages[0].token_usage is None

    def test_attach_token_usage_empty_messages(self, mock_run_result):
        from openai_executor.executor import OpenAIAgentsExecutor
        
        messages = []
        OpenAIAgentsExecutor._attach_token_usage(messages, mock_run_result)

    def test_extract_text_from_items(self):
        from openai_executor.executor import OpenAIAgentsExecutor
        
        item1 = Mock()
        output1 = Mock()
        output1.text = "First response"
        item1.output = [output1]
        
        item2 = Mock()
        output2 = Mock()
        output2.text = "Second response"
        item2.output = [output2]
        
        texts = OpenAIAgentsExecutor._extract_text_from_items([item1, item2])
        
        assert texts == ["First response", "Second response"]

    def test_extract_text_from_items_no_output(self):
        from openai_executor.executor import OpenAIAgentsExecutor
        
        item = Mock()
        item.output = None
        
        texts = OpenAIAgentsExecutor._extract_text_from_items([item])
        
        assert texts == []

    def test_extract_text_from_items_no_text(self):
        from openai_executor.executor import OpenAIAgentsExecutor
        
        item = Mock()
        output = Mock(spec=[])
        item.output = [output]
        
        texts = OpenAIAgentsExecutor._extract_text_from_items([item])
        
        assert texts == []

    def test_extract_stream_chunk_with_content(self, mock_stream_event):
        from openai_executor.executor import OpenAIAgentsExecutor
        from agents.stream_events import RawResponsesStreamEvent
        
        mock_stream_event.__class__ = RawResponsesStreamEvent
        
        with patch.object(OpenAIAgentsExecutor, "_extract_stream_chunk") as mock_extract:
            mock_extract.return_value = {"type": "content", "content": "Hello", "agent": "test"}
            
            chunk = mock_extract(mock_stream_event, "test")
            
            assert chunk is not None
            assert chunk["content"] == "Hello"

    def test_extract_stream_chunk_no_content(self, mock_stream_event_no_content):
        from openai_executor.executor import OpenAIAgentsExecutor
        from agents.stream_events import RawResponsesStreamEvent
        
        mock_stream_event_no_content.__class__ = RawResponsesStreamEvent
        
        chunk = OpenAIAgentsExecutor._extract_stream_chunk(mock_stream_event_no_content, "test")
        
        assert chunk is None

    def test_extract_stream_chunk_wrong_event_type(self):
        from openai_executor.executor import OpenAIAgentsExecutor
        
        event = Mock()
        chunk = OpenAIAgentsExecutor._extract_stream_chunk(event, "test")
        
        assert chunk is None

    def test_extract_stream_chunk_no_choices(self):
        from openai_executor.executor import OpenAIAgentsExecutor
        from agents.stream_events import RawResponsesStreamEvent
        
        event = Mock(spec=RawResponsesStreamEvent)
        event.data = Mock()
        event.data.choices = []
        
        with patch("openai_executor.executor.isinstance", return_value=True):
            chunk = OpenAIAgentsExecutor._extract_stream_chunk(event, "test")
        
        assert chunk is None

    @patch("openai_executor.executor.Agent")
    def test_build_agent(self, mock_agent_class, sample_request):
        from openai_executor.executor import OpenAIAgentsExecutor
        
        executor = OpenAIAgentsExecutor()
        executor._build_agent(sample_request)
        
        mock_agent_class.assert_called_once()
        call_kwargs = mock_agent_class.call_args[1]
        
        assert call_kwargs["name"] == "test-agent"
        assert "Alice" in call_kwargs["instructions"]
        assert call_kwargs["model"] == "gpt-4o"

    @pytest.mark.asyncio
    @patch("openai_executor.executor.Runner")
    @patch("openai_executor.executor.Agent")
    @patch("openai_executor.executor.OpenAIProvider")
    async def test_execute_agent(
        self, mock_provider_class, mock_agent_class, mock_runner, sample_request, mock_run_result
    ):
        from openai_executor.executor import OpenAIAgentsExecutor
        
        mock_runner.run = AsyncMock(return_value=mock_run_result)
        
        executor = OpenAIAgentsExecutor()
        messages = await executor.execute_agent(sample_request)
        
        assert len(messages) == 1
        assert messages[0].content == "This is the final response from the agent."
        mock_runner.run.assert_called_once()

    @pytest.mark.asyncio
    @patch("openai_executor.executor.Runner")
    @patch("openai_executor.executor.Agent")
    @patch("openai_executor.executor.OpenAIProvider")
    async def test_execute_agent_error(
        self, mock_provider_class, mock_agent_class, mock_runner, sample_request
    ):
        from openai_executor.executor import OpenAIAgentsExecutor
        
        mock_runner.run = AsyncMock(side_effect=Exception("API Error"))
        
        executor = OpenAIAgentsExecutor()
        
        with pytest.raises(Exception, match="API Error"):
            await executor.execute_agent(sample_request)

    @pytest.mark.asyncio
    @patch("openai_executor.executor.Runner")
    @patch("openai_executor.executor.Agent")
    @patch("openai_executor.executor.OpenAIProvider")
    async def test_execute_agent_streaming(
        self, mock_provider_class, mock_agent_class, mock_runner, sample_request
    ):
        from openai_executor.executor import OpenAIAgentsExecutor
        from agents.stream_events import RawResponsesStreamEvent
        
        stream_event = Mock(spec=RawResponsesStreamEvent)
        stream_event.data = Mock()
        choice = Mock()
        choice.delta = Mock()
        choice.delta.content = "Streamed content"
        stream_event.data.choices = [choice]
        
        async def mock_stream_events():
            yield stream_event
        
        mock_result = Mock()
        mock_result.stream_events = mock_stream_events
        mock_result.context_wrapper = Mock()
        mock_result.context_wrapper.usage = Mock()
        mock_result.context_wrapper.usage.input_tokens = 10
        mock_result.context_wrapper.usage.output_tokens = 5
        mock_result.context_wrapper.usage.total_tokens = 15
        
        mock_runner.run_streamed = Mock(return_value=mock_result)
        
        executor = OpenAIAgentsExecutor()
        chunks = []
        
        async for chunk in executor.execute_agent_streaming(sample_request):
            chunks.append(chunk)
        
        assert len(chunks) >= 1


class TestResolvePrompt:
    """Tests for prompt resolution with parameters."""

    def test_resolve_prompt_with_parameters(self, sample_request):
        from openai_executor.executor import OpenAIAgentsExecutor
        
        executor = OpenAIAgentsExecutor()
        prompt = executor._resolve_prompt(sample_request.agent)
        
        assert "Alice" in prompt
        assert "{{name}}" not in prompt

    def test_resolve_prompt_no_parameters(self, sample_agent_config_no_tools):
        from openai_executor.executor import OpenAIAgentsExecutor
        
        executor = OpenAIAgentsExecutor()
        prompt = executor._resolve_prompt(sample_agent_config_no_tools)
        
        assert prompt == "You are a simple assistant."

    def test_resolve_prompt_empty(self, sample_model):
        from openai_executor.executor import OpenAIAgentsExecutor
        from ark_executor_common import AgentConfig
        
        agent = AgentConfig(
            name="no-prompt",
            namespace="default",
            prompt="",
            model=sample_model,
        )
        
        executor = OpenAIAgentsExecutor()
        prompt = executor._resolve_prompt(agent)
        
        assert prompt == "You are a helpful assistant."


class TestResolveWorkspacePath:

    def test_uses_workspace_path_when_provided(self, sample_agent_config, sample_user_message):
        from openai_executor.executor import OpenAIAgentsExecutor
        from ark_executor_common import ExecutionEngineRequest, WorkspaceConfig

        request = ExecutionEngineRequest(
            agent=sample_agent_config,
            userInput=sample_user_message,
            history=[],
            tools=[],
            workspace=WorkspaceConfig(path="/mnt/workspace/repo"),
        )

        path = OpenAIAgentsExecutor._resolve_workspace_path(request, "default/test")
        assert path == "/mnt/workspace/repo"

    def test_falls_back_to_default_when_no_workspace(self, sample_request):
        from openai_executor.executor import OpenAIAgentsExecutor, DEFAULT_WORKSPACE

        path = OpenAIAgentsExecutor._resolve_workspace_path(sample_request, "default/test")
        assert path == DEFAULT_WORKSPACE

    def test_falls_back_to_default_when_workspace_path_empty(self, sample_agent_config, sample_user_message):
        from openai_executor.executor import OpenAIAgentsExecutor, DEFAULT_WORKSPACE
        from ark_executor_common import ExecutionEngineRequest, WorkspaceConfig

        request = ExecutionEngineRequest(
            agent=sample_agent_config,
            userInput=sample_user_message,
            history=[],
            tools=[],
            workspace=WorkspaceConfig(path=""),
        )

        path = OpenAIAgentsExecutor._resolve_workspace_path(request, "default/test")
        assert path == DEFAULT_WORKSPACE

    @pytest.mark.asyncio
    @patch("openai_executor.executor.Runner")
    @patch("openai_executor.executor.Agent")
    @patch("openai_executor.executor.OpenAIProvider")
    async def test_execute_agent_uses_workspace_path(
        self, mock_provider_class, mock_agent_class, mock_runner,
        sample_agent_config, sample_user_message, mock_run_result
    ):
        from openai_executor.executor import OpenAIAgentsExecutor
        from ark_executor_common import ExecutionEngineRequest, WorkspaceConfig

        request = ExecutionEngineRequest(
            agent=sample_agent_config,
            userInput=sample_user_message,
            history=[],
            tools=[],
            workspace=WorkspaceConfig(path="/mnt/workspace/repo"),
        )

        mock_runner.run = AsyncMock(return_value=mock_run_result)

        executor = OpenAIAgentsExecutor()
        messages = await executor.execute_agent(request)

        assert len(messages) == 1
        assert messages[0].content == "This is the final response from the agent."

    @pytest.mark.asyncio
    @patch("openai_executor.executor.Runner")
    @patch("openai_executor.executor.Agent")
    @patch("openai_executor.executor.OpenAIProvider")
    async def test_streaming_uses_workspace_path(
        self, mock_provider_class, mock_agent_class, mock_runner,
        sample_agent_config, sample_user_message
    ):
        from openai_executor.executor import OpenAIAgentsExecutor
        from ark_executor_common import ExecutionEngineRequest, WorkspaceConfig

        request = ExecutionEngineRequest(
            agent=sample_agent_config,
            userInput=sample_user_message,
            history=[],
            tools=[],
            workspace=WorkspaceConfig(path="/mnt/workspace/repo"),
        )

        async def mock_stream_events():
            return
            yield

        mock_result = Mock()
        mock_result.stream_events = mock_stream_events
        mock_result.context_wrapper = Mock()
        mock_result.context_wrapper.usage = Mock()
        mock_result.context_wrapper.usage.total_tokens = 0

        mock_runner.run_streamed = Mock(return_value=mock_result)

        executor = OpenAIAgentsExecutor()
        chunks = []
        async for chunk in executor.execute_agent_streaming(request):
            chunks.append(chunk)

        assert len(chunks) == 0


class TestMaxTurns:

    def test_max_turns_from_label(self, sample_agent_config, sample_user_message):
        from openai_executor.executor import OpenAIAgentsExecutor
        from ark_executor_common import ExecutionEngineRequest

        sample_agent_config.labels = {"openai-max-turns": "10"}
        request = ExecutionEngineRequest(
            agent=sample_agent_config,
            userInput=sample_user_message,
            history=[],
            tools=[],
        )

        assert OpenAIAgentsExecutor._resolve_max_turns(request) == 10

    def test_max_turns_default_is_none(self, sample_request):
        from openai_executor.executor import OpenAIAgentsExecutor

        assert OpenAIAgentsExecutor._resolve_max_turns(sample_request) is None

    def test_max_turns_invalid_value(self, sample_agent_config, sample_user_message):
        from openai_executor.executor import OpenAIAgentsExecutor
        from ark_executor_common import ExecutionEngineRequest

        sample_agent_config.labels = {"openai-max-turns": "not-a-number"}
        request = ExecutionEngineRequest(
            agent=sample_agent_config,
            userInput=sample_user_message,
            history=[],
            tools=[],
        )

        assert OpenAIAgentsExecutor._resolve_max_turns(request) is None

    def test_max_turns_zero_is_none(self, sample_agent_config, sample_user_message):
        from openai_executor.executor import OpenAIAgentsExecutor
        from ark_executor_common import ExecutionEngineRequest

        sample_agent_config.labels = {"openai-max-turns": "0"}
        request = ExecutionEngineRequest(
            agent=sample_agent_config,
            userInput=sample_user_message,
            history=[],
            tools=[],
        )

        assert OpenAIAgentsExecutor._resolve_max_turns(request) is None


class TestOutputSchema:

    @patch("openai_executor.executor.Agent")
    def test_build_agent_with_output_schema(self, mock_agent_class, sample_agent_config, sample_user_message):
        from openai_executor.executor import OpenAIAgentsExecutor
        from ark_executor_common import ExecutionEngineRequest

        sample_agent_config.outputSchema = {"type": "object", "properties": {"result": {"type": "string"}}}
        request = ExecutionEngineRequest(
            agent=sample_agent_config,
            userInput=sample_user_message,
            history=[],
            tools=[],
        )

        executor = OpenAIAgentsExecutor()
        executor._build_agent(request)

        call_kwargs = mock_agent_class.call_args[1]
        assert call_kwargs["output_type"] == {"type": "object", "properties": {"result": {"type": "string"}}}

    @patch("openai_executor.executor.Agent")
    def test_build_agent_without_output_schema(self, mock_agent_class, sample_request):
        from openai_executor.executor import OpenAIAgentsExecutor

        executor = OpenAIAgentsExecutor()
        executor._build_agent(sample_request)

        call_kwargs = mock_agent_class.call_args[1]
        assert "output_type" not in call_kwargs


class TestCodexToolWithWorkspace:

    def test_codex_tool_with_environment(self):
        from openai_executor.executor import OpenAIAgentsExecutor
        from ark_executor_common import WorkspaceConfig

        workspace = WorkspaceConfig(path="/workspace", hasEnvironment=True, hasGit=True)
        labels = {"openai-codex": "true"}

        with patch("openai_executor.executor.codex_tool") as mock_codex:
            mock_codex.return_value = Mock()
            OpenAIAgentsExecutor._build_codex_tool("/workspace", labels, workspace)

            call_kwargs = mock_codex.call_args[1]
            assert "/workspace/env" in call_kwargs["additional_directories"]

    def test_codex_tool_without_environment(self):
        from openai_executor.executor import OpenAIAgentsExecutor
        from ark_executor_common import WorkspaceConfig

        workspace = WorkspaceConfig(path="/workspace", hasEnvironment=False)
        labels = {}

        with patch("openai_executor.executor.codex_tool") as mock_codex:
            mock_codex.return_value = Mock()
            OpenAIAgentsExecutor._build_codex_tool("/workspace", labels, workspace)

            call_kwargs = mock_codex.call_args[1]
            assert "additional_directories" not in call_kwargs

    def test_codex_tool_with_additional_dirs_label(self):
        from openai_executor.executor import OpenAIAgentsExecutor

        labels = {"openai-codex-additional-dirs": "/data,/config"}

        with patch("openai_executor.executor.codex_tool") as mock_codex:
            mock_codex.return_value = Mock()
            OpenAIAgentsExecutor._build_codex_tool("/workspace", labels)

            call_kwargs = mock_codex.call_args[1]
            assert "/data" in call_kwargs["additional_directories"]
            assert "/config" in call_kwargs["additional_directories"]

    def test_codex_tool_reasoning_effort_label(self):
        from openai_executor.executor import OpenAIAgentsExecutor

        labels = {"openai-codex-reasoning-effort": "high"}

        with patch("openai_executor.executor.codex_tool") as mock_codex:
            mock_codex.return_value = Mock()
            OpenAIAgentsExecutor._build_codex_tool("/workspace", labels)

            call_kwargs = mock_codex.call_args[1]
            thread_opts = call_kwargs["default_thread_options"]
            assert thread_opts.model_reasoning_effort == "high"

    def test_codex_tool_persist_session(self):
        from openai_executor.executor import OpenAIAgentsExecutor

        labels = {"openai-codex-persist-session": "true"}

        with patch("openai_executor.executor.codex_tool") as mock_codex:
            mock_codex.return_value = Mock()
            OpenAIAgentsExecutor._build_codex_tool("/workspace", labels)

            call_kwargs = mock_codex.call_args[1]
            assert call_kwargs["persist_session"] is True

    def test_codex_tool_skip_git_check(self):
        from openai_executor.executor import OpenAIAgentsExecutor

        labels = {"openai-codex-skip-git-check": "true"}

        with patch("openai_executor.executor.codex_tool") as mock_codex:
            mock_codex.return_value = Mock()
            OpenAIAgentsExecutor._build_codex_tool("/workspace", labels)

            call_kwargs = mock_codex.call_args[1]
            assert call_kwargs["skip_git_repo_check"] is True
