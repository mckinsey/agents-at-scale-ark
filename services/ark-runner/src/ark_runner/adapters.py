"""Framework adapters: how the runner actually executes an agent.

The adapter is selected from config (default: completions), so one runner image serves
many frameworks — the config-driven improvement over AX's framework-per-image.
"""

from __future__ import annotations

import json
import logging
import re
from abc import ABC, abstractmethod
from typing import Any

from ark_sdk.executor import (
    ApprovalRequiredError,
    CompletedToolResult,
    ExecutionContext,
    ExecutionEngineRequest,
    Message,
    ToolApprovalConfig,
)

from . import config, model_client
from .mcp_client import MCPClient

logger = logging.getLogger(__name__)

MAX_TOOL_ITERATIONS = 10


def _go_fmt(value: Any) -> str:
    """Render a JSON value the way Go's fmt.Sprintf("%v", ...) does, so argument-match
    regexes written against the Go executor behave the same here (notably bool casing)."""
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _matches_approval_arguments(config_: ToolApprovalConfig, arguments: str) -> bool:
    """Port of the Go matchesApprovalArguments: no matchers → gate every call; otherwise
    gate when any matcher's regex matches the named argument's value. A call whose arguments
    fail to parse is gated rather than waved through."""
    if not config_.argumentMatches:
        return True
    try:
        parsed = json.loads(arguments or "{}")
    except (json.JSONDecodeError, TypeError):
        return True
    if not isinstance(parsed, dict):
        return True
    for matcher in config_.argumentMatches:
        if matcher.argument not in parsed:
            continue
        try:
            if re.search(matcher.pattern, _go_fmt(parsed[matcher.argument])):
                return True
        except re.error:
            continue
    return False


def _emit_event(text: str) -> None:
    """Emit intermediate output as a stdout sentinel the executor relays to ark-broker.
    Tagged with the per-query nonce (shared worker-pod log disambiguation)."""
    if text:
        print(f"{config.EVENT_SENTINEL} {config.nonce()} {text}", flush=True)


class FrameworkAdapter(ABC):
    name: str

    @abstractmethod
    async def run(self, request: ExecutionEngineRequest) -> list[Message]:
        """Execute the agent and return the resulting messages."""


class CompletionsAdapter(FrameworkAdapter):
    """Ark's native agent semantics: a prompt + model + tool/MCP completion loop.

    Uses the runner's provider-agnostic model client (model_client.py), which mirrors
    Ark's Go completions executor dispatch (OpenSpec task 2.7, Option C). MCP servers on the
    request are exposed to the model as tools and invoked in the loop (task 2.8).
    """

    name = "completions"

    async def run(self, request: ExecutionEngineRequest) -> list[Message]:
        agent = request.agent

        tools, tool_servers = await self._discover_tools(request)
        logger.info("discovered %d tools from %d MCP server(s)", len(tools), len(getattr(request, "mcpServers", None) or []))

        # HITL approval gates, keyed by the tool name the model calls.
        approvals = self._build_approvals(request)

        if request.resume is not None:
            messages = await self._rebuild_for_resume(request, tool_servers)
        else:
            messages = [
                {"role": "system", "content": agent.prompt},
                {"role": request.userInput.role or "user", "content": request.userInput.content},
            ]

        for _ in range(MAX_TOOL_ITERATIONS):
            assistant = await model_client.complete(agent.model, messages, tools=tools or None)
            messages.append(assistant)
            if assistant.get("content"):
                _emit_event(assistant["content"])
            tool_calls = assistant.get("tool_calls") or []
            if not tool_calls:
                return [Message(role="assistant", content=assistant.get("content") or "")]
            # Raises ApprovalRequiredError if any call is gated (pausing the whole turn),
            # otherwise appends each tool result message.
            self._gate_or_run_prep(tool_calls, approvals, agent, request, messages)
            for call in tool_calls:
                messages.append(await self._invoke_tool(call, tool_servers))

        logger.warning("tool loop hit MAX_TOOL_ITERATIONS=%d", MAX_TOOL_ITERATIONS)
        return [Message(role="assistant", content=messages[-1].get("content") or "")]

    def _build_approvals(self, request: ExecutionEngineRequest) -> dict[str, ToolApprovalConfig]:
        approvals: dict[str, ToolApprovalConfig] = {}
        for server in getattr(request, "mcpServers", None) or []:
            for entry in getattr(server, "approvals", None) or []:
                approvals[entry.tool] = entry.approval
        return approvals

    def _gate_or_run_prep(
        self,
        tool_calls: list[dict[str, Any]],
        approvals: dict[str, ToolApprovalConfig],
        agent: Any,
        request: ExecutionEngineRequest,
        messages: list[dict[str, Any]],
    ) -> None:
        """Mirror the Go executeToolCalls first pass: if any call in this turn is gated,
        pause the entire turn (no tools run) by raising ApprovalRequiredError. The pending
        tool calls + the conversation BEFORE this assistant message ride in the context so a
        fresh actor can resume after the human decides."""
        pending: list[dict[str, Any]] = []
        gate_config: ToolApprovalConfig | None = None
        for call in tool_calls:
            name = call.get("function", {}).get("name", "")
            config_ = approvals.get(name)
            if config_ is None:
                continue
            if _matches_approval_arguments(config_, call.get("function", {}).get("arguments", "")):
                pending.append(call)
                if gate_config is None:
                    gate_config = config_
        if not pending:
            return
        # messages currently ends with the assistant message that holds these tool_calls;
        # the resume path reconstructs that assistant message from `pending`, so drop it here.
        context = ExecutionContext(
            conversationId=request.conversationId,
            pendingToolCallIndex=0,
            completedToolResults=[],
            agentName=agent.name,
            agentNamespace=agent.namespace,
            messages=messages[:-1],
        )
        raise ApprovalRequiredError(pending, gate_config, context)

    async def _rebuild_for_resume(
        self, request: ExecutionEngineRequest, tool_servers: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """Rebuild the paused conversation from resume context and apply the human decision.

        Reconstructs the assistant message that triggered approval (its tool_calls are the
        gated set), then for each gated call either runs it (approved) or injects a rejection
        tool result. Returns the message list positioned to continue the normal loop (so a
        further gated call pauses again — cascading approval)."""
        resume = request.resume
        messages: list[dict[str, Any]] = list(resume.context.messages)
        messages.append({"role": "assistant", "content": None, "tool_calls": resume.toolCalls})
        for res in resume.context.completedToolResults:
            messages.append({
                "role": "tool",
                "tool_call_id": res.id,
                "content": res.error or res.content,
            })
        rejection = resume.rejectionReason or "Tool execution rejected by user"
        for call in resume.toolCalls:
            if resume.decision == "approved":
                _emit_event(f"approved tool {call.get('function', {}).get('name', '')}")
                messages.append(await self._invoke_tool(call, tool_servers))
            else:
                _emit_event(f"rejected tool {call.get('function', {}).get('name', '')}")
                messages.append({
                    "role": "tool",
                    "tool_call_id": call.get("id", ""),
                    "content": rejection,
                })
        return messages

    async def _discover_tools(
        self, request: ExecutionEngineRequest
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        """List tools from each MCP server and build the OpenAI tool schema + a name->server map."""
        tools: list[dict[str, Any]] = []
        servers: dict[str, Any] = {}
        for server in getattr(request, "mcpServers", None) or []:
            try:
                async with MCPClient(server.url, headers=server.headers) as mcp:
                    for tool in await mcp.list_tools():
                        name = tool["name"]
                        servers[name] = server
                        tools.append(
                            {
                                "type": "function",
                                "function": {
                                    "name": name,
                                    "description": tool.get("description", ""),
                                    "parameters": tool.get("inputSchema", {}),
                                },
                            }
                        )
            except Exception:
                logger.exception("failed to list tools from MCP server %s", server.name)
        return tools, servers

    async def _invoke_tool(self, call: dict[str, Any], tool_servers: dict[str, Any]) -> dict[str, Any]:
        """Run one tool call against its MCP server and return the OpenAI tool-result message."""
        fn = call.get("function", {})
        name = fn.get("name", "")
        try:
            args = json.loads(fn.get("arguments") or "{}")
        except json.JSONDecodeError:
            args = {}
        _emit_event(f"calling tool {name}({args})")
        server = tool_servers.get(name)
        if server is None:
            result = f"error: no MCP server provides tool {name!r}"
        else:
            try:
                async with MCPClient(server.url, headers=server.headers) as mcp:
                    result = await mcp.call_tool(name, args)
            except Exception as e:
                logger.exception("tool %s failed", name)
                result = f"error: {e}"
        return {"role": "tool", "tool_call_id": call.get("id", ""), "content": result}


class LangChainAdapter(FrameworkAdapter):
    """Stub (OpenSpec task 3.2). Implement by driving a LangChain agent from the request's
    prompt/model/tools, mapping mcpServers to LangChain tools and the model via its config."""

    name = "langchain"

    async def run(self, request: ExecutionEngineRequest) -> list[Message]:
        raise NotImplementedError(
            "langchain adapter not yet implemented; see OpenSpec task 3.2 and CompletionsAdapter"
        )


class ClaudeAgentSDKAdapter(FrameworkAdapter):
    """Stub (OpenSpec task 3.2). Implement by running the Claude Agent SDK against the request's
    model config, exposing mcpServers to the SDK's MCP support."""

    name = "claude"

    async def run(self, request: ExecutionEngineRequest) -> list[Message]:
        raise NotImplementedError(
            "claude agent sdk adapter not yet implemented; see OpenSpec task 3.2"
        )


_ADAPTERS: dict[str, type[FrameworkAdapter]] = {
    CompletionsAdapter.name: CompletionsAdapter,
    LangChainAdapter.name: LangChainAdapter,
    ClaudeAgentSDKAdapter.name: ClaudeAgentSDKAdapter,
}


def select(framework: str) -> FrameworkAdapter:
    cls = _ADAPTERS.get(framework)
    if cls is None:
        raise RuntimeError(f"unknown framework adapter {framework!r}; have {sorted(_ADAPTERS)}")
    return cls()
