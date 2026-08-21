"""Execution engine utilities and types for ARK SDK."""

import json
import logging
import uuid
from abc import ABC, abstractmethod
from contextvars import ContextVar
from typing import TYPE_CHECKING, Any, Optional
from pydantic import BaseModel

if TYPE_CHECKING:
    from .broker import BrokerClient
    from .query_status_updater import QueryStatusUpdater


logger = logging.getLogger(__name__)

_broker_client_var: ContextVar[Optional["BrokerClient"]] = ContextVar(
    "ark_broker_client", default=None
)
_query_status_updater_var: ContextVar[Optional["QueryStatusUpdater"]] = ContextVar(
    "ark_query_status_updater", default=None
)
_streamed_var: ContextVar[bool] = ContextVar("ark_streamed", default=False)
_tool_call_index_var: ContextVar[int] = ContextVar("ark_tool_call_index", default=0)


class Parameter(BaseModel):
    """Parameter for agent configuration."""
    name: str
    value: str


class Model(BaseModel):
    """Model configuration for LLM providers."""
    name: str
    type: str
    config: dict[str, Any] = {}


class AgentConfig(BaseModel):
    """Agent configuration."""
    name: str
    namespace: str
    prompt: str
    description: str = ""
    parameters: list[Parameter] = []
    model: Model
    labels: dict[str, str] = {}
    annotations: dict[str, str] = {}


class MCPServerConfig(BaseModel):
    name: str
    url: str
    transport: str = "http"
    timeout: str = "30s"
    headers: dict[str, str] = {}
    tools: list[str] = []


class Message(BaseModel):
    """Message in conversation history."""
    role: str
    content: str
    name: str = ""

    class Config:
        extra = "allow"


class ExecutionEngineRequest(BaseModel):
    """Request to execute an agent."""
    agent: AgentConfig
    userInput: Message
    mcpServers: list[MCPServerConfig] = []
    conversationId: str = ""
    query_annotations: dict[str, str] = {}
    execution_engine_annotations: dict[str, str] = {}
    message_ttl_seconds: int | None = None


class ExecutionEngineResponse(BaseModel):
    """Response from agent execution."""
    messages: list[Message]
    error: str = ""


class BaseExecutor(ABC):
    """Abstract base class for execution engines."""

    def __init__(self, engine_name: str):
        self.engine_name = engine_name
        logger.info(f"{engine_name} executor initialized")

    @property
    def _broker_client(self) -> Optional["BrokerClient"]:
        return _broker_client_var.get()

    @_broker_client.setter
    def _broker_client(self, value: Optional["BrokerClient"]) -> None:
        _broker_client_var.set(value)

    @property
    def _query_status_updater(self) -> Optional["QueryStatusUpdater"]:
        return _query_status_updater_var.get()

    @_query_status_updater.setter
    def _query_status_updater(self, value: Optional["QueryStatusUpdater"]) -> None:
        _query_status_updater_var.set(value)

    @property
    def _streamed(self) -> bool:
        return _streamed_var.get()

    @_streamed.setter
    def _streamed(self, value: bool) -> None:
        _streamed_var.set(value)

    @property
    def _tool_call_index(self) -> int:
        return _tool_call_index_var.get()

    @_tool_call_index.setter
    def _tool_call_index(self, value: int) -> None:
        _tool_call_index_var.set(value)

    async def stream_chunk(self, chunk: str) -> None:
        if self._broker_client:
            self._streamed = True
            await self._broker_client.send_chunk(chunk)

    async def stream_tool_call(
        self,
        name: str,
        arguments: dict[str, Any] | str = "",
        tool_call_id: str = "",
        index: Optional[int] = None,
    ) -> None:
        """Stream a tool invocation to the broker as an OpenAI delta.tool_calls chunk."""
        if not self._broker_client:
            return

        if index is None:
            index = self._tool_call_index
        self._tool_call_index = max(self._tool_call_index, index + 1)

        serialized = arguments if isinstance(arguments, str) else json.dumps(arguments)

        await self._broker_client.send_chunk(
            "",
            tool_calls=[{
                "index": index,
                "id": tool_call_id or f"call_{uuid.uuid4().hex[:24]}",
                "type": "function",
                "function": {
                    "name": name,
                    "arguments": serialized,
                },
            }],
        )

    async def update_query_phase(
        self, phase: str, reason: str, message: str = ""
    ) -> None:
        if self._query_status_updater:
            await self._query_status_updater.update_query_phase(phase, reason, message)

    @abstractmethod
    async def execute_agent(self, request: ExecutionEngineRequest) -> list[Message]:
        """Execute an agent with the given request.

        Args:
            request: The execution request containing agent config and user input

        Returns:
            List of response messages from the agent execution

        Raises:
            Exception: If execution fails
        """
        pass

    def _resolve_prompt(self, agent_config, base_prompt: str = "You are a helpful assistant.") -> str:
        """Resolve agent prompt with parameter substitution."""
        prompt = agent_config.prompt or base_prompt

        for param in agent_config.parameters:
            placeholder = f"{{{param.name}}}"
            prompt = prompt.replace(placeholder, param.value)

        return prompt
