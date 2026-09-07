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

class _RequestState:
    """Per-request streaming state, shared by reference with child tasks."""

    __slots__ = ("broker_client", "query_status_updater", "streamed", "tool_call_index")

    def __init__(self) -> None:
        self.broker_client: Optional["BrokerClient"] = None
        self.query_status_updater: Optional["QueryStatusUpdater"] = None
        self.streamed: bool = False
        self.tool_call_index: int = 0


_request_state_var: ContextVar[_RequestState] = ContextVar("ark_request_state")


def _request_state() -> _RequestState:
    state = _request_state_var.get(None)
    if state is None:
        state = _RequestState()
        _request_state_var.set(state)
    return state


def begin_request_state() -> _RequestState:
    """Install a fresh state object for the current request context."""
    state = _RequestState()
    _request_state_var.set(state)
    return state


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
        return _request_state().broker_client

    @_broker_client.setter
    def _broker_client(self, value: Optional["BrokerClient"]) -> None:
        _request_state().broker_client = value

    @property
    def _query_status_updater(self) -> Optional["QueryStatusUpdater"]:
        return _request_state().query_status_updater

    @_query_status_updater.setter
    def _query_status_updater(self, value: Optional["QueryStatusUpdater"]) -> None:
        _request_state().query_status_updater = value

    @property
    def _streamed(self) -> bool:
        return _request_state().streamed

    @_streamed.setter
    def _streamed(self, value: bool) -> None:
        _request_state().streamed = value

    @property
    def _tool_call_index(self) -> int:
        return _request_state().tool_call_index

    @_tool_call_index.setter
    def _tool_call_index(self, value: int) -> None:
        _request_state().tool_call_index = value

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

        if isinstance(arguments, str):
            serialized = arguments
        else:
            try:
                serialized = json.dumps(arguments, default=str)
            except Exception as e:
                logger.warning(f"Failed to serialize arguments for tool call '{name}': {e}")
                serialized = "{}"

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
