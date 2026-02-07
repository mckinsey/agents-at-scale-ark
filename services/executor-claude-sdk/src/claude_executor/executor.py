"""Claude Agent SDK execution logic."""

import json
import logging
import os
from typing import Any, AsyncGenerator, Dict, List, Optional

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    HookMatcher,
    HookContext,
    ResultMessage,
    TextBlock,
    ThinkingBlock,
    query,
)

from ark_executor_common import BaseExecutor, ExecutionEngineRequest, Message, TokenUsage, format_history_as_prompt
from ark_executor_common.git import GitWorkspaceResult, finalize_workspace_git, prepare_workspace_with_git
from ark_executor_common.models import resolve_api_key, resolve_base_url
from ark_executor_common.telemetry import TraceContext, get_tracer, pre_tool_hook as telemetry_pre_hook, post_tool_hook as telemetry_post_hook

logger = logging.getLogger(__name__)

DEFAULT_WORKSPACE = "/workspace"
DEFAULT_TOOLS = ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebSearch", "WebFetch"]
ALL_TOOLS = DEFAULT_TOOLS + ["TodoWrite", "NotebookEdit", "Task"]


def _get_label(labels: Optional[Dict[str, str]], key: str, default: str = "") -> str:
    if not labels:
        return default
    return labels.get(key, default)


def _safe_int(value: str, default: int) -> int:
    try:
        return int(value)
    except (ValueError, TypeError):
        logger.warning(f"Invalid integer label value '{value}', using default {default}")
        return default


def _to_bool(val: Any) -> bool:
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.lower() in ("true", "1", "yes")
    return bool(val)


def _parse_mcp_servers() -> Dict[str, Dict[str, Any]]:
    servers: Dict[str, Dict[str, Any]] = {}
    for key, value in os.environ.items():
        if not key.startswith("ARK_MCP_SERVER_") or not key.endswith("_URL"):
            continue
        prefix = key[: -len("_URL")]
        label = os.environ.get(f"{prefix}_LABEL", prefix.replace("ARK_MCP_SERVER_", "").lower())
        server_type = os.environ.get(f"{prefix}_TYPE", "sse")
        headers_raw = os.environ.get(f"{prefix}_HEADERS", "")
        headers = {}
        if headers_raw:
            for pair in headers_raw.split(","):
                if "=" in pair:
                    k, v = pair.split("=", 1)
                    headers[k.strip()] = v.strip()

        if server_type == "stdio":
            command = os.environ.get(f"{prefix}_COMMAND", "")
            args_raw = os.environ.get(f"{prefix}_ARGS", "")
            args = [a.strip() for a in args_raw.split(",") if a.strip()] if args_raw else []
            servers[label] = {"type": "stdio", "command": command, "args": args}
            if headers:
                servers[label]["env"] = headers
        else:
            config: Dict[str, Any] = {"type": server_type, "url": value}
            if headers:
                config["headers"] = headers
            servers[label] = config
    return servers


def _build_sandbox_settings() -> Optional[Dict[str, Any]]:
    if not _to_bool(os.environ.get("CLAUDE_SANDBOX_ENABLED", "false")):
        return None

    sandbox: Dict[str, Any] = {"enabled": True}

    if _to_bool(os.environ.get("CLAUDE_SANDBOX_AUTO_ALLOW_BASH", "false")):
        sandbox["autoAllowBashIfSandboxed"] = True

    if _to_bool(os.environ.get("CLAUDE_SANDBOX_ALLOW_UNSANDBOXED", "false")):
        sandbox["allowUnsandboxedCommands"] = True

    excluded = os.environ.get("CLAUDE_SANDBOX_EXCLUDED_COMMANDS", "")
    if excluded:
        sandbox["excludedCommands"] = [c.strip() for c in excluded.split(",") if c.strip()]

    network: Dict[str, Any] = {}
    if _to_bool(os.environ.get("CLAUDE_SANDBOX_ALLOW_LOCAL_BINDING", "false")):
        network["allowLocalBinding"] = True
    unix_sockets = os.environ.get("CLAUDE_SANDBOX_ALLOW_UNIX_SOCKETS", "")
    if unix_sockets:
        network["allowUnixSockets"] = [s.strip() for s in unix_sockets.split(",") if s.strip()]
    if network:
        sandbox["network"] = network

    return sandbox


MCP_SERVERS = _parse_mcp_servers()
SANDBOX_SETTINGS = _build_sandbox_settings()


async def _pre_tool_use_hook(
    input_data: Dict[str, Any],
    tool_use_id: Optional[str],
    context: HookContext,
) -> Dict[str, Any]:
    tool_name = input_data.get("tool_name", "unknown")
    tool_input = input_data.get("tool_input", {})
    logger.info(f"[hook:PreToolUse] Tool '{tool_name}' called with input keys: {list(tool_input.keys())}")
    await telemetry_pre_hook(input_data, tool_use_id, context)
    return {}


async def _post_tool_use_hook(
    input_data: Dict[str, Any],
    tool_use_id: Optional[str],
    context: HookContext,
) -> Dict[str, Any]:
    tool_name = input_data.get("tool_name", "unknown")
    logger.info(f"[hook:PostToolUse] Tool '{tool_name}' completed")
    await telemetry_post_hook(input_data, tool_use_id, context)
    return {}


class ClaudeSDKExecutor(BaseExecutor):
    def __init__(self):
        super().__init__("Claude Agent SDK")
        if MCP_SERVERS:
            logger.info(f"Configured {len(MCP_SERVERS)} MCP server(s): {list(MCP_SERVERS.keys())}")
        if SANDBOX_SETTINGS:
            logger.info("SDK sandboxing enabled")

    async def _prepare_workspace(self, request: ExecutionEngineRequest, workspace: str) -> Optional[GitWorkspaceResult]:
        result = await prepare_workspace_with_git(
            workspace=workspace,
            labels=request.agent.labels,
            parameters=request.agent.parameters,
        )
        if result:
            logger.info(f"Git repository prepared at {result.repo_path}")
        return result

    async def execute_agent(self, request: ExecutionEngineRequest, trace_context: Optional[TraceContext] = None) -> List[Message]:
        logger.info(f"Executing Claude Agent SDK query for agent {request.agent.name}")
        tracer = get_tracer("claude-executor")

        git_result = None
        try:
            if request.workspace and request.workspace.path:
                effective_cwd = request.workspace.path
            else:
                workspace = _get_label(request.agent.labels, "claude-cwd", DEFAULT_WORKSPACE)
                git_result = await self._prepare_workspace(request, workspace)
                effective_cwd = git_result.repo_path if git_result else workspace

            resolved_prompt = self._resolve_prompt(request.agent)
            options = self._build_options(request, resolved_prompt, cwd_override=effective_cwd)
            prompt = format_history_as_prompt(request.history, request.userInput.content)

            messages = []
            token_usage = None
            async for message in query(prompt=prompt, options=options):
                converted = self._convert_message(message, request.agent.name)
                if converted:
                    messages.append(converted)
                if isinstance(message, ResultMessage):
                    token_usage = self._extract_token_usage(message)

            if not messages:
                messages.append(
                    Message(role="assistant", content="No response generated", name=request.agent.name)
                )

            if token_usage:
                messages[-1].token_usage = token_usage.model_dump()

            await finalize_workspace_git(git_result)

            logger.info(f"Claude Agent SDK execution completed for agent {request.agent.name}")
            return messages

        except Exception as e:
            logger.error(f"Claude Agent SDK execution failed for agent {request.agent.name}: {e}")
            raise

    async def execute_agent_streaming(self, request: ExecutionEngineRequest) -> AsyncGenerator[dict, None]:
        logger.info(f"Streaming Claude Agent SDK execution for agent {request.agent.name}")

        git_result = None
        try:
            if request.workspace and request.workspace.path:
                effective_cwd = request.workspace.path
            else:
                workspace = _get_label(request.agent.labels, "claude-cwd", DEFAULT_WORKSPACE)
                git_result = await self._prepare_workspace(request, workspace)
                effective_cwd = git_result.repo_path if git_result else workspace

            resolved_prompt = self._resolve_prompt(request.agent)
            options = self._build_options(request, resolved_prompt, cwd_override=effective_cwd)
            options.include_partial_messages = True
            prompt = format_history_as_prompt(request.history, request.userInput.content)

            async for message in query(prompt=prompt, options=options):
                if isinstance(message, AssistantMessage):
                    for chunk in self._stream_assistant_blocks(message, request.agent.name):
                        yield chunk
                elif isinstance(message, ResultMessage):
                    for chunk in self._stream_result(message, request.agent.name):
                        yield chunk

            await finalize_workspace_git(git_result)

        except Exception as e:
            logger.error(f"Claude Agent SDK streaming failed for agent {request.agent.name}: {e}")
            raise

    def _stream_assistant_blocks(self, message: AssistantMessage, agent_name: str) -> List[dict]:
        chunks = []
        for block in message.content:
            if isinstance(block, TextBlock):
                chunks.append({"type": "content", "content": block.text, "agent": agent_name})
            elif isinstance(block, ThinkingBlock):
                chunks.append({"type": "content", "content": f"<thinking>\n{block.thinking}\n</thinking>", "agent": agent_name})
        return chunks

    def _stream_result(self, message: ResultMessage, agent_name: str) -> List[dict]:
        chunks = []
        structured = getattr(message, "structured_output", None)
        if structured is not None:
            content = json.dumps(structured) if not isinstance(structured, str) else structured
            chunks.append({"type": "content", "content": content, "agent": agent_name})
        token_usage = self._extract_token_usage(message)
        result = {"type": "result", "agent": agent_name}
        if token_usage:
            result["token_usage"] = token_usage.model_dump()
        chunks.append(result)
        return chunks

    def _build_options(
        self, request: ExecutionEngineRequest, resolved_prompt: str, cwd_override: Optional[str] = None
    ) -> ClaudeAgentOptions:
        labels = request.agent.labels
        env = {}
        api_key = resolve_api_key(request.agent.model)
        if api_key:
            env["ANTHROPIC_API_KEY"] = api_key

        base_url = resolve_base_url(request.agent.model)
        if base_url:
            env["ANTHROPIC_BASE_URL"] = base_url

        max_turns = _safe_int(_get_label(labels, "claude-max-turns", "50"), 50)
        permission_mode = _get_label(labels, "claude-permission-mode", "bypassPermissions")
        cwd = cwd_override or _get_label(labels, "claude-cwd", DEFAULT_WORKSPACE)
        allowed_tools = self._resolve_tools(labels)

        if MCP_SERVERS:
            for label in MCP_SERVERS:
                allowed_tools.append(f"mcp__{label}__*")

        hooks = {
            "PreToolUse": [HookMatcher(hooks=[_pre_tool_use_hook])],
            "PostToolUse": [HookMatcher(hooks=[_post_tool_use_hook])],
        }

        options = ClaudeAgentOptions(
            system_prompt=resolved_prompt,
            model=request.agent.model.name or None,
            max_turns=max_turns,
            permission_mode=permission_mode,
            cwd=cwd,
            allowed_tools=allowed_tools,
            env=env,
            hooks=hooks,
        )

        if MCP_SERVERS:
            options.mcp_servers = MCP_SERVERS

        if SANDBOX_SETTINGS:
            options.sandbox = SANDBOX_SETTINGS

        if _get_label(labels, "claude-extended-thinking") == "true":
            thinking_tokens = _safe_int(_get_label(labels, "claude-thinking-tokens", "10000"), 10000)
            options.max_thinking_tokens = thinking_tokens

        if request.agent.outputSchema:
            options.output_format = {
                "type": "json_schema",
                "schema": request.agent.outputSchema,
            }

        agents = self._parse_subagents(request.agent.parameters)
        if agents:
            options.agents = agents

        return options

    def _parse_subagents(self, parameters: List) -> Optional[Dict[str, Any]]:
        subagents_json = None
        for param in parameters:
            if param.name == "subagents":
                subagents_json = param.value
                break
        if not subagents_json:
            return None
        try:
            from claude_agent_sdk import AgentDefinition
        except ImportError:
            logger.warning("AgentDefinition not available in claude_agent_sdk, skipping subagents")
            return None
        try:
            subagents_config = json.loads(subagents_json) if isinstance(subagents_json, str) else subagents_json
        except (json.JSONDecodeError, TypeError):
            logger.warning("Invalid subagents configuration, skipping")
            return None
        agents = {}
        for name, config in subagents_config.items():
            agents[name] = AgentDefinition(
                description=config.get("description", f"Subagent {name}"),
                prompt=config.get("prompt"),
                tools=config.get("tools"),
                model=config.get("model"),
            )
        logger.info(f"Configured {len(agents)} subagent(s): {list(agents.keys())}")
        return agents

    def _resolve_tools(self, labels: Optional[Dict[str, str]]) -> list:
        tools_label = _get_label(labels, "claude-tools")
        if not tools_label:
            return list(DEFAULT_TOOLS)
        if tools_label == "all":
            return list(ALL_TOOLS)
        return [t.strip() for t in tools_label.split(",") if t.strip()]

    def _convert_message(self, message, agent_name: str) -> Message | None:
        if isinstance(message, AssistantMessage):
            return self._convert_assistant_message(message, agent_name)
        if isinstance(message, ResultMessage):
            return self._convert_result_message(message, agent_name)
        return None

    def _convert_assistant_message(self, message: AssistantMessage, agent_name: str) -> Message | None:
        text_parts = []
        for block in message.content:
            if isinstance(block, TextBlock):
                text_parts.append(block.text)
            elif isinstance(block, ThinkingBlock):
                text_parts.append(f"<thinking>\n{block.thinking}\n</thinking>")
        if not text_parts:
            return None
        return Message(role="assistant", content="\n".join(text_parts), name=agent_name)

    def _convert_result_message(self, message: ResultMessage, agent_name: str) -> Message | None:
        structured = getattr(message, "structured_output", None)
        if structured is not None:
            content = json.dumps(structured) if not isinstance(structured, str) else structured
            return Message(role="assistant", content=content, name=agent_name)
        result_text = getattr(message, "result", None) or getattr(message, "text", None)
        if result_text:
            return Message(role="assistant", content=result_text, name=agent_name)
        return None

    def _extract_token_usage(self, message: ResultMessage) -> TokenUsage | None:
        usage = getattr(message, "usage", None)
        if not usage or not isinstance(usage, dict):
            return None
        return TokenUsage(
            prompt_tokens=usage.get("input_tokens", 0),
            completion_tokens=usage.get("output_tokens", 0),
            total_tokens=usage.get("input_tokens", 0) + usage.get("output_tokens", 0),
        )
