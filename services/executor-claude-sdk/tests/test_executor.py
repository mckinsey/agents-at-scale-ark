"""Tests for Claude Agent SDK executor."""

import json
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from ark_executor_common import (
    AgentConfig,
    ExecutionEngineRequest,
    Message,
    Model,
    Parameter,
    WorkspaceConfig,
)
from claude_executor.executor import (
    _build_sandbox_settings,
    _get_label,
    _parse_mcp_servers,
    _pre_tool_use_hook,
    _post_tool_use_hook,
    _safe_int,
    _to_bool,
    DEFAULT_TOOLS,
    ALL_TOOLS,
    ClaudeSDKExecutor,
)


def make_request(
    agent_name: str = "test-agent",
    prompt: str = "You are a helpful assistant.",
    user_content: str = "Hello",
    labels: dict = None,
    model_name: str = "claude-sonnet-4-20250514",
    output_schema: dict = None,
    workspace: WorkspaceConfig = None,
) -> ExecutionEngineRequest:
    return ExecutionEngineRequest(
        agent=AgentConfig(
            name=agent_name,
            namespace="default",
            prompt=prompt,
            model=Model(name=model_name, type="anthropic", config={}),
            labels=labels or {},
            outputSchema=output_schema,
        ),
        userInput=Message(role="user", content=user_content, name="user"),
        history=[],
        workspace=workspace,
    )


class TestHelperFunctions:
    def test_get_label_returns_value_when_present(self):
        labels = {"key": "value"}
        assert _get_label(labels, "key") == "value"

    def test_get_label_returns_default_when_missing(self):
        labels = {"other": "value"}
        assert _get_label(labels, "key", "default") == "default"

    def test_get_label_returns_default_when_labels_none(self):
        assert _get_label(None, "key", "default") == "default"

    def test_safe_int_parses_valid_int(self):
        assert _safe_int("42", 0) == 42

    def test_safe_int_returns_default_on_invalid(self):
        assert _safe_int("not-a-number", 10) == 10

    def test_safe_int_returns_default_on_empty_string(self):
        assert _safe_int("", 5) == 5

    def test_to_bool_true_values(self):
        assert _to_bool("true") is True
        assert _to_bool("True") is True
        assert _to_bool("1") is True
        assert _to_bool("yes") is True
        assert _to_bool(True) is True

    def test_to_bool_false_values(self):
        assert _to_bool("false") is False
        assert _to_bool("0") is False
        assert _to_bool("no") is False
        assert _to_bool("") is False
        assert _to_bool(False) is False


class TestMcpServerParsing:
    def test_parse_mcp_servers_empty_when_no_env(self):
        with patch.dict(os.environ, {}, clear=True):
            servers = _parse_mcp_servers()
            assert servers == {}

    def test_parse_mcp_servers_sse_server(self):
        env = {
            "ARK_MCP_SERVER_TEST_URL": "https://example.com/mcp",
            "ARK_MCP_SERVER_TEST_LABEL": "test-server",
        }
        with patch.dict(os.environ, env, clear=True):
            servers = _parse_mcp_servers()
            assert "test-server" in servers
            assert servers["test-server"]["type"] == "sse"
            assert servers["test-server"]["url"] == "https://example.com/mcp"

    def test_parse_mcp_servers_with_headers(self):
        env = {
            "ARK_MCP_SERVER_AUTH_URL": "https://example.com/mcp",
            "ARK_MCP_SERVER_AUTH_LABEL": "auth-server",
            "ARK_MCP_SERVER_AUTH_HEADERS": "Authorization=Bearer token,X-Custom=value",
        }
        with patch.dict(os.environ, env, clear=True):
            servers = _parse_mcp_servers()
            assert "auth-server" in servers
            assert servers["auth-server"]["headers"]["Authorization"] == "Bearer token"
            assert servers["auth-server"]["headers"]["X-Custom"] == "value"

    def test_parse_mcp_servers_stdio_type(self):
        env = {
            "ARK_MCP_SERVER_LOCAL_URL": "ignored-for-stdio",
            "ARK_MCP_SERVER_LOCAL_LABEL": "local-server",
            "ARK_MCP_SERVER_LOCAL_TYPE": "stdio",
            "ARK_MCP_SERVER_LOCAL_COMMAND": "python",
            "ARK_MCP_SERVER_LOCAL_ARGS": "-m,mcp_server",
        }
        with patch.dict(os.environ, env, clear=True):
            servers = _parse_mcp_servers()
            assert "local-server" in servers
            assert servers["local-server"]["type"] == "stdio"
            assert servers["local-server"]["command"] == "python"
            assert servers["local-server"]["args"] == ["-m", "mcp_server"]

    def test_parse_mcp_servers_default_label(self):
        env = {
            "ARK_MCP_SERVER_MYSERVICE_URL": "https://example.com/mcp",
        }
        with patch.dict(os.environ, env, clear=True):
            servers = _parse_mcp_servers()
            assert "myservice" in servers


class TestSandboxSettings:
    def test_sandbox_disabled_by_default(self):
        with patch.dict(os.environ, {}, clear=True):
            settings = _build_sandbox_settings()
            assert settings is None

    def test_sandbox_enabled(self):
        env = {"CLAUDE_SANDBOX_ENABLED": "true"}
        with patch.dict(os.environ, env, clear=True):
            settings = _build_sandbox_settings()
            assert settings is not None
            assert settings["enabled"] is True

    def test_sandbox_auto_allow_bash(self):
        env = {
            "CLAUDE_SANDBOX_ENABLED": "true",
            "CLAUDE_SANDBOX_AUTO_ALLOW_BASH": "true",
        }
        with patch.dict(os.environ, env, clear=True):
            settings = _build_sandbox_settings()
            assert settings["autoAllowBashIfSandboxed"] is True

    def test_sandbox_excluded_commands(self):
        env = {
            "CLAUDE_SANDBOX_ENABLED": "true",
            "CLAUDE_SANDBOX_EXCLUDED_COMMANDS": "docker,kubectl",
        }
        with patch.dict(os.environ, env, clear=True):
            settings = _build_sandbox_settings()
            assert settings["excludedCommands"] == ["docker", "kubectl"]

    def test_sandbox_network_settings(self):
        env = {
            "CLAUDE_SANDBOX_ENABLED": "true",
            "CLAUDE_SANDBOX_ALLOW_LOCAL_BINDING": "true",
            "CLAUDE_SANDBOX_ALLOW_UNIX_SOCKETS": "/var/run/docker.sock,/tmp/app.sock",
        }
        with patch.dict(os.environ, env, clear=True):
            settings = _build_sandbox_settings()
            assert settings["network"]["allowLocalBinding"] is True
            assert settings["network"]["allowUnixSockets"] == [
                "/var/run/docker.sock",
                "/tmp/app.sock",
            ]

    def test_sandbox_allow_unsandboxed(self):
        env = {
            "CLAUDE_SANDBOX_ENABLED": "true",
            "CLAUDE_SANDBOX_ALLOW_UNSANDBOXED": "true",
        }
        with patch.dict(os.environ, env, clear=True):
            settings = _build_sandbox_settings()
            assert settings["allowUnsandboxedCommands"] is True


class TestClaudeSDKExecutor:
    def test_executor_instantiation(self):
        executor = ClaudeSDKExecutor()
        assert executor.engine_name == "Claude Agent SDK"

    def test_resolve_tools_default(self):
        executor = ClaudeSDKExecutor()
        tools = executor._resolve_tools(None)
        assert "Read" in tools
        assert "Write" in tools
        assert "Bash" in tools
        assert "WebSearch" in tools

    def test_resolve_tools_all(self):
        executor = ClaudeSDKExecutor()
        tools = executor._resolve_tools({"claude-tools": "all"})
        assert "TodoWrite" in tools
        assert "NotebookEdit" in tools
        assert "Task" in tools

    def test_resolve_tools_custom_list(self):
        executor = ClaudeSDKExecutor()
        tools = executor._resolve_tools({"claude-tools": "Read, Bash, Grep"})
        assert tools == ["Read", "Bash", "Grep"]


class TestBuildOptions:
    def test_build_options_basic(self):
        executor = ClaudeSDKExecutor()
        request = make_request()
        options = executor._build_options(request, "Test system prompt")

        assert options.system_prompt == "Test system prompt"
        assert options.model == "claude-sonnet-4-20250514"
        assert options.max_turns == 50
        assert options.permission_mode == "bypassPermissions"
        assert options.cwd == "/workspace"
        assert "Read" in options.allowed_tools

    def test_build_options_with_custom_labels(self):
        executor = ClaudeSDKExecutor()
        request = make_request(
            labels={
                "claude-max-turns": "100",
                "claude-permission-mode": "askUser",
                "claude-cwd": "/custom/path",
            }
        )
        options = executor._build_options(request, "Test prompt")

        assert options.max_turns == 100
        assert options.permission_mode == "askUser"
        assert options.cwd == "/custom/path"

    def test_build_options_with_extended_thinking(self):
        executor = ClaudeSDKExecutor()
        request = make_request(
            labels={
                "claude-extended-thinking": "true",
                "claude-thinking-tokens": "20000",
            }
        )
        options = executor._build_options(request, "Test prompt")

        assert options.max_thinking_tokens == 20000

    def test_build_options_with_extended_thinking_default_tokens(self):
        executor = ClaudeSDKExecutor()
        request = make_request(labels={"claude-extended-thinking": "true"})
        options = executor._build_options(request, "Test prompt")

        assert options.max_thinking_tokens == 10000

    def test_build_options_with_output_schema(self):
        executor = ClaudeSDKExecutor()
        schema = {"type": "object", "properties": {"answer": {"type": "string"}}}
        request = make_request(output_schema=schema)
        options = executor._build_options(request, "Test prompt")

        assert options.output_format is not None
        assert options.output_format["type"] == "json_schema"
        assert options.output_format["schema"] == schema

    def test_build_options_invalid_max_turns_uses_default(self):
        executor = ClaudeSDKExecutor()
        request = make_request(labels={"claude-max-turns": "not-a-number"})
        options = executor._build_options(request, "Test prompt")

        assert options.max_turns == 50

    def test_build_options_with_api_key(self):
        executor = ClaudeSDKExecutor()
        request = ExecutionEngineRequest(
            agent=AgentConfig(
                name="test-agent",
                namespace="default",
                prompt="Test",
                model=Model(
                    name="claude-sonnet-4-20250514",
                    type="openai",
                    config={"openai": {"apiKey": "test-key"}},
                ),
            ),
            userInput=Message(role="user", content="Hello", name="user"),
            history=[],
        )
        options = executor._build_options(request, "Test prompt")

        assert options.env.get("ANTHROPIC_API_KEY") == "test-key"


class TestMessageConversion:
    def test_convert_assistant_message_with_text(self):
        from claude_agent_sdk import AssistantMessage, TextBlock

        executor = ClaudeSDKExecutor()

        mock_text_block = MagicMock(spec=TextBlock)
        mock_text_block.text = "Hello, world!"

        mock_message = MagicMock(spec=AssistantMessage)
        mock_message.content = [mock_text_block]

        with patch("claude_executor.executor.isinstance") as mock_isinstance:
            def side_effect(obj, cls):
                if obj is mock_text_block and cls == TextBlock:
                    return True
                return False
            mock_isinstance.side_effect = side_effect

            result = executor._convert_assistant_message(mock_message, "test-agent")

        assert result is not None
        assert result.role == "assistant"
        assert result.content == "Hello, world!"
        assert result.name == "test-agent"

    def test_convert_assistant_message_with_thinking(self):
        from claude_agent_sdk import AssistantMessage, ThinkingBlock

        executor = ClaudeSDKExecutor()

        mock_thinking_block = MagicMock(spec=ThinkingBlock)
        mock_thinking_block.thinking = "Let me think..."

        mock_message = MagicMock(spec=AssistantMessage)
        mock_message.content = [mock_thinking_block]

        with patch("claude_executor.executor.isinstance") as mock_isinstance:
            def side_effect(obj, cls):
                if obj is mock_thinking_block and cls == ThinkingBlock:
                    return True
                return False
            mock_isinstance.side_effect = side_effect

            result = executor._convert_assistant_message(mock_message, "test-agent")

        assert result is not None
        assert "<thinking>" in result.content
        assert "Let me think..." in result.content

    def test_convert_assistant_message_empty_content(self):
        from claude_agent_sdk import AssistantMessage

        executor = ClaudeSDKExecutor()

        mock_message = MagicMock(spec=AssistantMessage)
        mock_message.content = []

        result = executor._convert_assistant_message(mock_message, "test-agent")

        assert result is None

    def test_convert_result_message_with_structured_output(self):
        executor = ClaudeSDKExecutor()

        mock_message = MagicMock()
        mock_message.structured_output = {"key": "value"}

        result = executor._convert_result_message(mock_message, "test-agent")

        assert result is not None
        assert result.role == "assistant"
        assert json.loads(result.content) == {"key": "value"}
        assert result.name == "test-agent"

    def test_convert_result_message_with_text_result(self):
        executor = ClaudeSDKExecutor()

        mock_message = MagicMock()
        mock_message.structured_output = None
        mock_message.result = "Text result"

        result = executor._convert_result_message(mock_message, "test-agent")

        assert result is not None
        assert result.content == "Text result"

    def test_convert_result_message_with_text_attribute(self):
        executor = ClaudeSDKExecutor()

        mock_message = MagicMock()
        mock_message.structured_output = None
        mock_message.result = None
        mock_message.text = "Fallback text"

        result = executor._convert_result_message(mock_message, "test-agent")

        assert result is not None
        assert result.content == "Fallback text"

    def test_convert_result_message_no_content(self):
        executor = ClaudeSDKExecutor()

        mock_message = MagicMock()
        mock_message.structured_output = None
        mock_message.result = None
        mock_message.text = None

        result = executor._convert_result_message(mock_message, "test-agent")

        assert result is None


class TestTokenUsageExtraction:
    def test_extract_token_usage_valid(self):
        executor = ClaudeSDKExecutor()

        mock_message = MagicMock()
        mock_message.usage = {"input_tokens": 100, "output_tokens": 50}

        result = executor._extract_token_usage(mock_message)

        assert result is not None
        assert result.prompt_tokens == 100
        assert result.completion_tokens == 50
        assert result.total_tokens == 150

    def test_extract_token_usage_no_usage(self):
        executor = ClaudeSDKExecutor()

        mock_message = MagicMock()
        mock_message.usage = None

        result = executor._extract_token_usage(mock_message)

        assert result is None

    def test_extract_token_usage_invalid_type(self):
        executor = ClaudeSDKExecutor()

        mock_message = MagicMock()
        mock_message.usage = "invalid"

        result = executor._extract_token_usage(mock_message)

        assert result is None

    def test_extract_token_usage_partial_data(self):
        executor = ClaudeSDKExecutor()

        mock_message = MagicMock()
        mock_message.usage = {"input_tokens": 100}

        result = executor._extract_token_usage(mock_message)

        assert result is not None
        assert result.prompt_tokens == 100
        assert result.completion_tokens == 0
        assert result.total_tokens == 100


class TestStreamingMethods:
    def test_stream_assistant_blocks_text(self):
        executor = ClaudeSDKExecutor()

        from claude_agent_sdk import TextBlock

        mock_block = MagicMock(spec=TextBlock)
        mock_block.text = "Hello streaming"

        mock_message = MagicMock()
        mock_message.content = [mock_block]

        with patch("claude_executor.executor.isinstance", side_effect=lambda obj, cls: cls == TextBlock if hasattr(obj, 'text') and obj is mock_block else isinstance(obj, cls)):
            result = executor._stream_assistant_blocks(mock_message, "test-agent")

        assert len(result) == 1
        assert result[0]["type"] == "content"
        assert result[0]["content"] == "Hello streaming"
        assert result[0]["agent"] == "test-agent"

    def test_stream_result_with_structured_output(self):
        executor = ClaudeSDKExecutor()

        mock_message = MagicMock()
        mock_message.structured_output = {"result": "data"}
        mock_message.usage = {"input_tokens": 10, "output_tokens": 5}

        result = executor._stream_result(mock_message, "test-agent")

        assert len(result) == 2
        assert result[0]["type"] == "content"
        assert json.loads(result[0]["content"]) == {"result": "data"}
        assert result[1]["type"] == "result"
        assert "token_usage" in result[1]

    def test_stream_result_no_structured_output(self):
        executor = ClaudeSDKExecutor()

        mock_message = MagicMock()
        mock_message.structured_output = None
        mock_message.usage = None

        result = executor._stream_result(mock_message, "test-agent")

        assert len(result) == 1
        assert result[0]["type"] == "result"
        assert "token_usage" not in result[0]


class TestHooks:
    @pytest.mark.asyncio
    async def test_pre_tool_use_hook(self):
        input_data = {"tool_name": "Read", "tool_input": {"path": "/test"}}
        context = MagicMock()

        result = await _pre_tool_use_hook(input_data, "tool-123", context)

        assert result == {}

    @pytest.mark.asyncio
    async def test_post_tool_use_hook(self):
        input_data = {"tool_name": "Read"}
        context = MagicMock()

        result = await _post_tool_use_hook(input_data, "tool-123", context)

        assert result == {}


class TestExecuteAgent:
    @pytest.mark.asyncio
    async def test_execute_agent_success(self):
        executor = ClaudeSDKExecutor()
        request = make_request()

        from claude_agent_sdk import AssistantMessage, ResultMessage, TextBlock

        mock_text_block = MagicMock(spec=TextBlock)
        mock_text_block.text = "Hello, I'm Claude!"

        mock_assistant_msg = MagicMock(spec=AssistantMessage)
        mock_assistant_msg.content = [mock_text_block]

        mock_result_msg = MagicMock(spec=ResultMessage)
        mock_result_msg.structured_output = None
        mock_result_msg.result = None
        mock_result_msg.text = None
        mock_result_msg.usage = {"input_tokens": 50, "output_tokens": 25}

        async def mock_query(prompt, options):
            yield mock_assistant_msg
            yield mock_result_msg

        with patch("claude_executor.executor.query", mock_query):
            with patch("claude_executor.executor.isinstance") as mock_isinstance:
                def isinstance_side_effect(obj, cls):
                    if cls == TextBlock and obj is mock_text_block:
                        return True
                    if cls == AssistantMessage and obj is mock_assistant_msg:
                        return True
                    if cls == ResultMessage and obj is mock_result_msg:
                        return True
                    return False
                mock_isinstance.side_effect = isinstance_side_effect

                messages = await executor.execute_agent(request)

        assert len(messages) >= 1

    @pytest.mark.asyncio
    async def test_execute_agent_no_response(self):
        executor = ClaudeSDKExecutor()
        request = make_request()

        async def mock_query_empty(prompt, options):
            return
            yield  # type: ignore[misc]

        with patch("claude_executor.executor.query", mock_query_empty):
            messages = await executor.execute_agent(request)

        assert len(messages) == 1
        assert messages[0].content == "No response generated"

    @pytest.mark.asyncio
    async def test_execute_agent_exception(self):
        executor = ClaudeSDKExecutor()
        request = make_request()

        async def mock_query_error(prompt, options):
            raise RuntimeError("API Error")
            yield  # type: ignore[misc]

        with patch("claude_executor.executor.query", mock_query_error):
            with pytest.raises(RuntimeError, match="API Error"):
                await executor.execute_agent(request)


class TestExecuteAgentStreaming:
    @pytest.mark.asyncio
    async def test_execute_agent_streaming_success(self):
        executor = ClaudeSDKExecutor()
        request = make_request()

        from claude_agent_sdk import AssistantMessage, ResultMessage, TextBlock

        mock_text_block = MagicMock(spec=TextBlock)
        mock_text_block.text = "Streaming response"

        mock_assistant_msg = MagicMock(spec=AssistantMessage)
        mock_assistant_msg.content = [mock_text_block]

        mock_result_msg = MagicMock(spec=ResultMessage)
        mock_result_msg.structured_output = None
        mock_result_msg.usage = {"input_tokens": 10, "output_tokens": 5}

        async def mock_query(prompt, options):
            yield mock_assistant_msg
            yield mock_result_msg

        with patch("claude_executor.executor.query", mock_query):
            with patch("claude_executor.executor.isinstance") as mock_isinstance:
                def isinstance_side_effect(obj, cls):
                    if cls == TextBlock and obj is mock_text_block:
                        return True
                    if cls == AssistantMessage and obj is mock_assistant_msg:
                        return True
                    if cls == ResultMessage and obj is mock_result_msg:
                        return True
                    return False
                mock_isinstance.side_effect = isinstance_side_effect

                chunks = []
                async for chunk in executor.execute_agent_streaming(request):
                    chunks.append(chunk)

        result_chunks = [c for c in chunks if c.get("type") == "result"]
        assert len(result_chunks) >= 1

    @pytest.mark.asyncio
    async def test_execute_agent_streaming_exception(self):
        executor = ClaudeSDKExecutor()
        request = make_request()

        async def mock_query_error(prompt, options):
            raise RuntimeError("Streaming Error")
            yield  # type: ignore[misc]

        with patch("claude_executor.executor.query", mock_query_error):
            with pytest.raises(RuntimeError, match="Streaming Error"):
                async for _ in executor.execute_agent_streaming(request):
                    pass


class TestConstants:
    def test_default_tools_content(self):
        expected = ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebSearch", "WebFetch"]
        assert DEFAULT_TOOLS == expected

    def test_all_tools_includes_default(self):
        for tool in DEFAULT_TOOLS:
            assert tool in ALL_TOOLS

    def test_all_tools_includes_extras(self):
        assert "TodoWrite" in ALL_TOOLS
        assert "NotebookEdit" in ALL_TOOLS
        assert "Task" in ALL_TOOLS


class TestWorkspaceIntegration:
    def test_build_options_with_cwd_override(self):
        executor = ClaudeSDKExecutor()
        request = make_request()
        options = executor._build_options(request, "Test prompt", cwd_override="/custom/workspace")

        assert options.cwd == "/custom/workspace"

    def test_build_options_without_cwd_override_uses_label(self):
        executor = ClaudeSDKExecutor()
        request = make_request(labels={"claude-cwd": "/label/path"})
        options = executor._build_options(request, "Test prompt")

        assert options.cwd == "/label/path"

    def test_build_options_without_cwd_override_or_label_uses_default(self):
        executor = ClaudeSDKExecutor()
        request = make_request()
        options = executor._build_options(request, "Test prompt")

        assert options.cwd == "/workspace"

    @pytest.mark.asyncio
    async def test_execute_agent_uses_workspace_path(self):
        executor = ClaudeSDKExecutor()
        workspace = WorkspaceConfig(
            path="/provisioned/workspace",
            sessionId="session-123",
            persistent=True,
            hasEnvironment=True,
            hasGit=True,
        )
        request = make_request(workspace=workspace)

        captured_options = {}

        async def mock_query(prompt, options):
            captured_options["cwd"] = options.cwd
            return
            yield

        with patch("claude_executor.executor.query", mock_query):
            await executor.execute_agent(request)

        assert captured_options["cwd"] == "/provisioned/workspace"

    @pytest.mark.asyncio
    async def test_execute_agent_skips_git_prep_when_workspace_provided(self):
        executor = ClaudeSDKExecutor()
        workspace = WorkspaceConfig(path="/provisioned/workspace")
        request = make_request(workspace=workspace)

        async def mock_query(prompt, options):
            return
            yield

        with patch("claude_executor.executor.query", mock_query), \
             patch.object(executor, "_prepare_workspace") as mock_prep:
            await executor.execute_agent(request)

        mock_prep.assert_not_called()

    @pytest.mark.asyncio
    async def test_execute_agent_calls_git_prep_when_no_workspace(self):
        executor = ClaudeSDKExecutor()
        request = make_request(labels={"git-repo-url": "https://github.com/test/repo.git"})

        async def mock_query(prompt, options):
            return
            yield

        with patch("claude_executor.executor.query", mock_query), \
             patch.object(executor, "_prepare_workspace", new_callable=AsyncMock, return_value=None) as mock_prep:
            await executor.execute_agent(request)

        mock_prep.assert_called_once()

    @pytest.mark.asyncio
    async def test_execute_agent_finalize_git_called_with_none_when_workspace_provided(self):
        executor = ClaudeSDKExecutor()
        workspace = WorkspaceConfig(path="/provisioned/workspace")
        request = make_request(workspace=workspace)

        async def mock_query(prompt, options):
            return
            yield

        with patch("claude_executor.executor.query", mock_query), \
             patch("claude_executor.executor.finalize_workspace_git", new_callable=AsyncMock) as mock_finalize:
            await executor.execute_agent(request)

        mock_finalize.assert_called_once_with(None)

    @pytest.mark.asyncio
    async def test_streaming_uses_workspace_path(self):
        executor = ClaudeSDKExecutor()
        workspace = WorkspaceConfig(path="/stream/workspace")
        request = make_request(workspace=workspace)

        from claude_agent_sdk import ResultMessage

        captured_options = {}

        mock_result_msg = MagicMock(spec=ResultMessage)
        mock_result_msg.structured_output = None
        mock_result_msg.usage = None

        async def mock_query(prompt, options):
            captured_options["cwd"] = options.cwd
            yield mock_result_msg

        with patch("claude_executor.executor.query", mock_query):
            with patch("claude_executor.executor.isinstance") as mock_isinstance:
                def isinstance_side_effect(obj, cls):
                    if cls == ResultMessage and obj is mock_result_msg:
                        return True
                    return False
                mock_isinstance.side_effect = isinstance_side_effect

                chunks = []
                async for chunk in executor.execute_agent_streaming(request):
                    chunks.append(chunk)

        assert captured_options["cwd"] == "/stream/workspace"

    @pytest.mark.asyncio
    async def test_streaming_skips_git_prep_when_workspace_provided(self):
        executor = ClaudeSDKExecutor()
        workspace = WorkspaceConfig(path="/stream/workspace")
        request = make_request(workspace=workspace)

        async def mock_query(prompt, options):
            return
            yield

        with patch("claude_executor.executor.query", mock_query), \
             patch.object(executor, "_prepare_workspace") as mock_prep:
            async for _ in executor.execute_agent_streaming(request):
                pass

        mock_prep.assert_not_called()

    @pytest.mark.asyncio
    async def test_execute_agent_workspace_empty_path_falls_back_to_label(self):
        executor = ClaudeSDKExecutor()
        workspace = WorkspaceConfig(path="")
        request = make_request(labels={"claude-cwd": "/fallback/path"}, workspace=workspace)

        captured_options = {}

        async def mock_query(prompt, options):
            captured_options["cwd"] = options.cwd
            return
            yield

        with patch("claude_executor.executor.query", mock_query), \
             patch.object(executor, "_prepare_workspace", new_callable=AsyncMock, return_value=None):
            await executor.execute_agent(request)

        assert captured_options["cwd"] == "/fallback/path"

    @pytest.mark.asyncio
    async def test_execute_agent_workspace_none_falls_back_to_label(self):
        executor = ClaudeSDKExecutor()
        request = make_request(labels={"claude-cwd": "/label/path"})

        captured_options = {}

        async def mock_query(prompt, options):
            captured_options["cwd"] = options.cwd
            return
            yield

        with patch("claude_executor.executor.query", mock_query), \
             patch.object(executor, "_prepare_workspace", new_callable=AsyncMock, return_value=None):
            await executor.execute_agent(request)

        assert captured_options["cwd"] == "/label/path"
