import logging
import os
from typing import Any

from ark_sdk.executor import (
    BaseExecutor,
    ExecutionEngineRequest,
    ExecutionProfile,
    Message,
)

from .config import EngineConfig

logger = logging.getLogger(__name__)

SUPPORTED_MODEL_TYPES = {"anthropic", "bedrock", "vertex", ""}


class ClaudeCliExecutor(BaseExecutor):
    def __init__(self, config: EngineConfig | None = None):
        super().__init__("claude-cli")
        self.config = config or EngineConfig.from_env()

    async def execute_agent(self, request: ExecutionEngineRequest) -> list[Message]:
        model_type = request.agent.model.type
        if model_type and model_type not in SUPPORTED_MODEL_TYPES:
            raise ValueError(
                f"Unsupported model type: {model_type}. "
                f"Supported types: {', '.join(t or '(empty)' for t in SUPPORTED_MODEL_TYPES)}"
            )

        if self.config.mock_mode:
            return self._mock_execute(request)

        return await self._claude_execute(request)

    async def _claude_execute(self, request: ExecutionEngineRequest) -> list[Message]:
        from claude_agent_sdk import ClaudeAgentOptions, query as claude_query

        prompt = self._build_prompt(request)
        model_env = self._build_model_env(request.agent.model)
        model_name = self._resolve_model_name(request.agent.model)

        options = ClaudeAgentOptions(
            system_prompt=request.agent.prompt or None,
            allowed_tools=self.config.allowed_tools,
            permission_mode=self.config.permission_mode,
            cwd=self.config.workspace_dir,
            max_turns=self.config.max_turns,
            model=model_name,
        )

        if self.config.max_budget_usd is not None:
            options.max_budget_usd = self.config.max_budget_usd

        output_format = self._build_output_format(request.agent)
        if output_format:
            options.output_format = output_format

        env_override = {**os.environ, **model_env}
        for key, val in env_override.items():
            os.environ[key] = val

        messages: list[Message] = []
        try:
            async for msg in claude_query(prompt=prompt, options=options):
                text = self._extract_message_text(msg)
                if text:
                    messages.append(Message(role="assistant", content=text))
        except Exception:
            logger.exception("Claude SDK execution failed")
            raise

        if not messages:
            messages.append(
                Message(role="assistant", content="No response generated.")
            )

        return messages

    def _mock_execute(self, request: ExecutionEngineRequest) -> list[Message]:
        logger.info("Mock mode: returning canned response")
        return [Message(role="assistant", content=self.config.mock_response)]

    def get_execution_profile(self) -> ExecutionProfile:
        return ExecutionProfile(
            tool_mode="autonomous",
            memory_mode="inline",
            structured_output=True,
            streaming=False,
            supported_models=self.config.supported_models,
        )

    def _build_prompt(self, request: ExecutionEngineRequest) -> str:
        parts: list[str] = []

        if request.history:
            for msg in request.history:
                parts.append(f"[{msg.role}]: {msg.content}")
            parts.append("")

        parts.append(request.userInput.content)
        return "\n".join(parts)

    def _build_model_env(self, model: Any) -> dict[str, str]:
        env: dict[str, str] = {}
        config = model.config or {}

        if model.type == "bedrock":
            bedrock = config.get("bedrock", {})
            if region := bedrock.get("region"):
                env["AWS_REGION"] = region
            if key := bedrock.get("accessKeyId"):
                env["AWS_ACCESS_KEY_ID"] = key
            if secret := bedrock.get("secretAccessKey"):
                env["AWS_SECRET_ACCESS_KEY"] = secret

        elif model.type == "vertex":
            vertex = config.get("vertex", {})
            if project := vertex.get("project"):
                env["GOOGLE_CLOUD_PROJECT"] = project
            if region := vertex.get("region"):
                env["GOOGLE_CLOUD_REGION"] = region

        elif model.type in ("anthropic", ""):
            anthropic = config.get("anthropic", {})
            if key := anthropic.get("apiKey"):
                env["ANTHROPIC_API_KEY"] = key

        return env

    def _resolve_model_name(self, model: Any) -> str | None:
        if model.name:
            return model.name
        return None

    def _build_output_format(self, agent: Any) -> dict[str, Any] | None:
        output_schema = getattr(agent, "outputSchema", None) or getattr(
            agent, "output_schema", None
        )
        if output_schema:
            return {"type": "json_schema", "schema": output_schema}
        return None

    def _extract_message_text(self, msg: Any) -> str:
        if hasattr(msg, "type"):
            if msg.type == "result":
                if hasattr(msg, "subtype") and msg.subtype == "success":
                    return getattr(msg, "result", "")
            elif msg.type == "text":
                return getattr(msg, "text", "")
        return ""
