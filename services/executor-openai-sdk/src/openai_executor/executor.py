"""OpenAI Agents SDK execution logic."""

import json
import logging
import os
from typing import Any, AsyncGenerator, Dict, List, Optional

from openai import AsyncOpenAI
from openai.types.responses.tool_param import CodeInterpreter
from agents import (
    Agent,
    Runner,
    ModelSettings,
    RunResult,
    RunConfig,
    WebSearchTool,
    CodeInterpreterTool,
    FileSearchTool,
    HostedMCPTool,
    handoff,
    set_default_openai_client,
)
from agents.lifecycle import AgentHooksBase
from agents.stream_events import RawResponsesStreamEvent

from agents.extensions.experimental.codex import (
    Codex,
    codex_tool,
    ThreadOptions,
    TurnOptions,
)

from ark_executor_common import BaseExecutor, ExecutionEngineRequest, Message, WorkspaceConfig
from ark_executor_common.models import resolve_api_key, resolve_base_url, resolve_model_properties
from ark_executor_common.telemetry import TraceContext, get_tracer

DEFAULT_WORKSPACE = "/workspace"
DEFAULT_CODEX_MODEL = "gpt-5.2-codex"
DEFAULT_CODEX_IDLE_TIMEOUT = 120

logger = logging.getLogger(__name__)

TRACING_DISABLED = os.environ.get("OPENAI_AGENTS_DISABLE_TRACING", "0") == "1"


def _to_bool(val: Any) -> bool:
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.lower() in ("true", "1", "yes")
    return bool(val)


def _parse_mcp_servers() -> List[Dict[str, str]]:
    servers = []
    for key, value in os.environ.items():
        if not key.startswith("ARK_MCP_SERVER_") or not key.endswith("_URL"):
            continue
        prefix = key[: -len("_URL")]
        label = os.environ.get(f"{prefix}_LABEL", prefix.replace("ARK_MCP_SERVER_", "").lower())
        headers_raw = os.environ.get(f"{prefix}_HEADERS", "")
        headers = {}
        if headers_raw:
            for pair in headers_raw.split(","):
                if "=" in pair:
                    k, v = pair.split("=", 1)
                    headers[k.strip()] = v.strip()
        servers.append({"url": value, "label": label, "headers": headers})
    return servers


MCP_SERVERS = _parse_mcp_servers()


class ArkAgentHooks(AgentHooksBase):
    def __init__(self, agent_name: str, namespace: str):
        self.agent_name = agent_name
        self.namespace = namespace
        self._tracer = get_tracer("openai-executor")
        self._tool_spans: Dict[str, Any] = {}

    async def on_start(self, context, agent) -> None:
        logger.info(f"[{self.namespace}/{self.agent_name}] Agent starting execution")

    async def on_end(self, context, agent, output) -> None:
        logger.info(f"[{self.namespace}/{self.agent_name}] Agent completed execution")

    async def on_tool_start(self, context, agent, tool) -> None:
        logger.info(f"[{self.namespace}/{self.agent_name}] Tool '{tool.name}' starting")
        span = self._tracer.start_span(f"tool.{tool.name}")
        span.set_attribute("tool.name", tool.name)
        self._tool_spans[tool.name] = span

    async def on_tool_end(self, context, agent, tool, result) -> None:
        logger.info(f"[{self.namespace}/{self.agent_name}] Tool '{tool.name}' completed")
        span = self._tool_spans.pop(tool.name, None)
        if span:
            from opentelemetry.trace import Status, StatusCode
            span.set_attribute("tool.result", str(result)[:1024])
            span.set_status(Status(StatusCode.OK))
            span.end()

    async def on_llm_start(self, context, agent, system_prompt, input_items) -> None:
        logger.debug(f"[{self.namespace}/{self.agent_name}] LLM call starting")

    async def on_llm_end(self, context, agent, response) -> None:
        logger.debug(f"[{self.namespace}/{self.agent_name}] LLM call completed")


class OpenAIAgentsExecutor(BaseExecutor):
    def __init__(self):
        super().__init__("OpenAI Agents SDK")
        if MCP_SERVERS:
            logger.info(f"Configured {len(MCP_SERVERS)} hosted MCP server(s): {[s['label'] for s in MCP_SERVERS]}")

    @staticmethod
    def _resolve_workspace_path(request: ExecutionEngineRequest, agent_id: str) -> Optional[str]:
        if request.workspace and request.workspace.path:
            logger.info(f"[{agent_id}] Using workspace path: {request.workspace.path}")
            return request.workspace.path
        logger.info(f"[{agent_id}] No workspace provided, using default: {DEFAULT_WORKSPACE}")
        return DEFAULT_WORKSPACE

    async def execute_agent(self, request: ExecutionEngineRequest, trace_context: Optional[TraceContext] = None) -> List[Message]:
        agent_id = f"{request.agent.namespace}/{request.agent.name}"
        logger.info(f"[{agent_id}] Executing OpenAI Agents SDK query")

        try:
            workspace_path = self._resolve_workspace_path(request, agent_id)

            openai_client = self._create_openai_client(request)
            set_default_openai_client(openai_client, use_for_tracing=False)
            agent = self._build_agent(request, workspace_path)
            input_messages = self._build_input(request)
            run_config = self._build_run_config(request)
            max_turns = self._resolve_max_turns(request)

            run_kwargs: Dict[str, Any] = {
                "starting_agent": agent,
                "input": input_messages,
                "run_config": run_config,
            }
            if max_turns is not None:
                run_kwargs["max_turns"] = max_turns

            result: RunResult = await Runner.run(**run_kwargs)

            messages = self._convert_result(result, request.agent.name)
            self._attach_token_usage(messages, result)

            logger.info(f"[{agent_id}] Execution completed successfully")
            return messages
        except Exception as e:
            logger.error(f"[{agent_id}] Execution failed: {e}", exc_info=True)
            raise

    async def execute_agent_streaming(self, request: ExecutionEngineRequest) -> AsyncGenerator[dict, None]:
        agent_id = f"{request.agent.namespace}/{request.agent.name}"
        logger.info(f"[{agent_id}] Streaming OpenAI Agents SDK execution")

        try:
            workspace_path = self._resolve_workspace_path(request, agent_id)

            openai_client = self._create_openai_client(request)
            set_default_openai_client(openai_client, use_for_tracing=False)
            agent = self._build_agent(request, workspace_path)
            input_messages = self._build_input(request)
            run_config = self._build_run_config(request)
            max_turns = self._resolve_max_turns(request)

            stream_kwargs: Dict[str, Any] = {
                "starting_agent": agent,
                "input": input_messages,
                "run_config": run_config,
            }
            if max_turns is not None:
                stream_kwargs["max_turns"] = max_turns

            result = Runner.run_streamed(**stream_kwargs)

            async for event in result.stream_events():
                chunk = self._extract_stream_chunk(event, request.agent.name)
                if chunk:
                    yield chunk

            usage = result.context_wrapper.usage
            if usage and usage.total_tokens > 0:
                yield {
                    "type": "usage",
                    "token_usage": {
                        "prompt_tokens": usage.input_tokens,
                        "completion_tokens": usage.output_tokens,
                        "total_tokens": usage.total_tokens,
                    },
                }

            logger.info(f"[{agent_id}] Streaming execution completed successfully")
        except Exception as e:
            logger.error(f"[{agent_id}] Streaming execution failed: {e}", exc_info=True)
            raise

    @staticmethod
    def _extract_stream_chunk(event, agent_name: str) -> Optional[dict]:
        if not isinstance(event, RawResponsesStreamEvent):
            return None
        data = event.data
        if not hasattr(data, "choices") or not data.choices:
            return None
        for choice in data.choices:
            delta = getattr(choice, "delta", None)
            if delta and getattr(delta, "content", None):
                return {"type": "content", "content": delta.content, "agent": agent_name}
        return None

    def _parse_handoffs(self, parameters: List) -> list:
        handoffs_json = None
        for param in parameters:
            if param.name == "handoffs":
                handoffs_json = param.value
                break
        if not handoffs_json:
            return []
        try:
            handoffs_config = json.loads(handoffs_json) if isinstance(handoffs_json, str) else handoffs_json
        except (json.JSONDecodeError, TypeError):
            logger.warning("Invalid handoffs configuration, skipping")
            return []
        handoff_agents = []
        for name, config in handoffs_config.items():
            agent = Agent(
                name=name,
                instructions=config.get("instructions", ""),
                model=config.get("model", "gpt-4o"),
            )
            handoff_agents.append(handoff(agent=agent))
        logger.info(f"Configured {len(handoff_agents)} handoff agent(s): {list(handoffs_config.keys())}")
        return handoff_agents

    def _build_agent(self, request: ExecutionEngineRequest, workspace_path: Optional[str] = None) -> Agent:
        resolved_prompt = self._resolve_prompt(request.agent)
        model_settings = self._build_model_settings(request)
        tools = self._build_tools(request, workspace_path)
        hooks = ArkAgentHooks(request.agent.name, request.agent.namespace)

        kwargs: Dict[str, Any] = {
            "name": request.agent.name,
            "instructions": resolved_prompt,
            "model": request.agent.model.name,
            "model_settings": model_settings,
            "tools": tools,
            "hooks": hooks,
        }

        if request.agent.outputSchema:
            kwargs["output_type"] = request.agent.outputSchema

        handoffs_list = self._parse_handoffs(request.agent.parameters)
        if handoffs_list:
            kwargs["handoffs"] = handoffs_list

        return Agent(**kwargs)

    def _build_tools(self, request: ExecutionEngineRequest, workspace_path: Optional[str] = None) -> list:
        tools: list = []
        labels = request.agent.labels or {}

        if _to_bool(labels.get("openai-web-search", "true")):
            tools.append(WebSearchTool())

        if _to_bool(labels.get("openai-code-interpreter", "false")):
            memory_limit = labels.get("openai-code-interpreter-memory-limit", "1g")
            container_id = labels.get("openai-code-interpreter-container-id")

            if container_id:
                container_config = container_id
            else:
                container_config = {"type": "auto", "memory_limit": memory_limit}

            tools.append(CodeInterpreterTool(tool_config=CodeInterpreter(
                type="code_interpreter",
                container=container_config,
            )))

        file_search_ids = labels.get("openai-file-search-vector-stores", "")
        if file_search_ids:
            vector_store_ids = [v.strip() for v in file_search_ids.split(",") if v.strip()]
            if vector_store_ids:
                tools.append(FileSearchTool(vector_store_ids=vector_store_ids))

        for server in MCP_SERVERS:
            tool_config = {
                "type": "mcp",
                "server_label": server["label"],
                "server_url": server["url"],
                "require_approval": "never",
            }
            if server.get("headers"):
                tool_config["headers"] = server["headers"]
            tools.append(HostedMCPTool(tool_config=tool_config))

        if workspace_path and _to_bool(labels.get("openai-codex", "true")):
            codex = self._build_codex_tool(workspace_path, labels, request.workspace, request)
            tools.append(codex)
            logger.info(f"Codex tool enabled for workspace: {workspace_path}")

        return tools

    @staticmethod
    def _build_codex_tool(
        workspace_path: str,
        labels: Dict[str, str],
        workspace: Optional[WorkspaceConfig] = None,
        request: Optional[ExecutionEngineRequest] = None,
    ):
        codex_model = labels.get("openai-codex-model", os.environ.get("CODEX_MODEL", DEFAULT_CODEX_MODEL))
        idle_timeout = int(labels.get("openai-codex-idle-timeout", os.environ.get("CODEX_IDLE_TIMEOUT", str(DEFAULT_CODEX_IDLE_TIMEOUT))))
        sandbox_mode = labels.get("openai-codex-sandbox", os.environ.get("CODEX_SANDBOX_MODE", "workspace-write"))
        approval_policy = labels.get("openai-codex-approval-policy", os.environ.get("CODEX_APPROVAL_POLICY", "never"))
        network_access = _to_bool(labels.get("openai-codex-network", os.environ.get("CODEX_NETWORK_ACCESS", "true")))
        reasoning_effort = labels.get("openai-codex-reasoning-effort", os.environ.get("CODEX_REASONING_EFFORT", "low"))
        persist_session = _to_bool(labels.get("openai-codex-persist-session", os.environ.get("CODEX_PERSIST_SESSION", "false")))
        skip_git_check = _to_bool(labels.get("openai-codex-skip-git-check", os.environ.get("CODEX_SKIP_GIT_CHECK", "false")))

        additional_dirs = []
        if workspace and workspace.hasEnvironment:
            env_path = os.path.join(workspace_path, "env")
            additional_dirs.append(env_path)
            logger.info(f"Adding environment directory to Codex: {env_path}")
        extra_dirs = labels.get("openai-codex-additional-dirs", "")
        if extra_dirs:
            additional_dirs.extend([d.strip() for d in extra_dirs.split(",") if d.strip()])

        codex_kwargs: Dict[str, Any] = {}
        if request and request.agent and request.agent.model:
            api_key = resolve_api_key(request.agent.model)
            base_url = resolve_base_url(request.agent.model)
            if api_key:
                codex_kwargs["api_key"] = api_key
            if base_url:
                codex_kwargs["base_url"] = base_url

        codex_instance = Codex(**codex_kwargs) if codex_kwargs else None

        kwargs: Dict[str, Any] = {
            "working_directory": workspace_path,
            "sandbox_mode": sandbox_mode,
            "default_thread_options": ThreadOptions(
                model=codex_model,
                model_reasoning_effort=reasoning_effort,
                network_access_enabled=network_access,
                web_search_mode="disabled",
                approval_policy=approval_policy,
            ),
            "default_turn_options": TurnOptions(
                idle_timeout_seconds=idle_timeout,
            ),
            "persist_session": persist_session,
        }

        if codex_instance:
            kwargs["codex"] = codex_instance
        if additional_dirs:
            kwargs["additional_directories"] = additional_dirs
        if skip_git_check:
            kwargs["skip_git_repo_check"] = True

        return codex_tool(**kwargs)

    @staticmethod
    def _build_run_config(request: ExecutionEngineRequest) -> RunConfig:
        return RunConfig(
            tracing_disabled=TRACING_DISABLED,
            workflow_name=f"{request.agent.namespace}/{request.agent.name}",
        )

    @staticmethod
    def _resolve_max_turns(request: ExecutionEngineRequest) -> Optional[int]:
        labels = request.agent.labels or {}
        max_turns_str = labels.get("openai-max-turns", "0")
        try:
            val = int(max_turns_str)
            return val if val > 0 else None
        except (ValueError, TypeError):
            return None

    def _create_openai_client(self, request: ExecutionEngineRequest) -> AsyncOpenAI:
        api_key = resolve_api_key(request.agent.model)
        base_url = resolve_base_url(request.agent.model)

        kwargs = {}
        if api_key:
            kwargs["api_key"] = api_key
        if base_url:
            kwargs["base_url"] = base_url

        return AsyncOpenAI(**kwargs)

    @staticmethod
    def _build_model_settings(request: ExecutionEngineRequest) -> ModelSettings:
        properties = resolve_model_properties(request.agent.model)
        kwargs = {}

        float_keys = ("temperature", "top_p", "frequency_penalty", "presence_penalty")
        for key in float_keys:
            if key in properties:
                kwargs[key] = float(properties[key])

        if "max_tokens" in properties:
            kwargs["max_tokens"] = int(properties["max_tokens"])
        if "tool_choice" in properties:
            kwargs["tool_choice"] = properties["tool_choice"]
        if "parallel_tool_calls" in properties:
            kwargs["parallel_tool_calls"] = _to_bool(properties["parallel_tool_calls"])
        if "truncation" in properties:
            val = properties["truncation"]
            if val in ("auto", "disabled"):
                kwargs["truncation"] = val
        if "store" in properties:
            kwargs["store"] = _to_bool(properties["store"])

        return ModelSettings(**kwargs)

    @staticmethod
    def _attach_token_usage(messages: List[Message], result: RunResult) -> None:
        usage = result.context_wrapper.usage
        if not usage or usage.total_tokens == 0 or not messages:
            return
        messages[-1].token_usage = {
            "prompt_tokens": usage.input_tokens,
            "completion_tokens": usage.output_tokens,
            "total_tokens": usage.total_tokens,
        }

    @staticmethod
    def _build_input(request: ExecutionEngineRequest) -> list:
        messages = [{"role": msg.role, "content": msg.content} for msg in request.history]
        messages.append({"role": request.userInput.role, "content": request.userInput.content})
        return messages

    @staticmethod
    def _extract_text_from_items(items) -> List[str]:
        texts = []
        for item in items:
            output = getattr(item, "output", None)
            if not isinstance(output, list):
                continue
            for output_item in output:
                text = getattr(output_item, "text", None)
                if text:
                    texts.append(text)
        return texts

    def _convert_result(self, result: RunResult, agent_name: str) -> List[Message]:
        if result.final_output:
            return [Message(role="assistant", content=str(result.final_output), name=agent_name)]

        texts = self._extract_text_from_items(result.new_items)
        if texts:
            return [Message(role="assistant", content=t, name=agent_name) for t in texts]

        return [Message(role="assistant", content="No response generated", name=agent_name)]
