"""Execution engine utilities and types for ARK SDK."""

import logging
from abc import ABC, abstractmethod
from typing import Any
from pydantic import BaseModel


logger = logging.getLogger(__name__)


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


class ExecutionEngineResponse(BaseModel):
    """Response from agent execution."""
    messages: list[Message]
    error: str = ""


class BaseExecutor(ABC):
    """Abstract base class for execution engines."""

    def __init__(self, engine_name: str):
        """Initialize the executor with a name."""
        self.engine_name = engine_name
        logger.info(f"{engine_name} executor initialized")

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
