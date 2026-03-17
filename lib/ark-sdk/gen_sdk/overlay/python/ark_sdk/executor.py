"""Execution engine utilities and types for ARK SDK."""

import logging
from abc import ABC, abstractmethod
from typing import List, Dict, Any
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
    config: Dict[str, Any] = {}


class AgentConfig(BaseModel):
    """Agent configuration."""
    name: str
    namespace: str
    prompt: str
    description: str = ""
    parameters: List[Parameter] = []
    model: Model
    labels: Dict[str, str] = {}


class ToolDefinition(BaseModel):
    """Tool definition for agent capabilities."""
    name: str
    description: str
    parameters: Dict[str, Any] = {}


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
    history: List[Message]
    tools: List[ToolDefinition] = []


class ExecutionEngineResponse(BaseModel):
    """Response from agent execution."""
    messages: List[Message]
    error: str = ""


class BaseExecutor(ABC):
    """Abstract base class for execution engines."""

    def __init__(self, engine_name: str):
        """Initialize the executor with a name."""
        self.engine_name = engine_name
        logger.info(f"{engine_name} executor initialized")

    @abstractmethod
    async def execute_agent(self, request: ExecutionEngineRequest) -> List[Message]:
        """Execute an agent with the given request.
        
        Args:
            request: The execution request containing agent config and user input
            
        Returns:
            List of response messages from the agent execution
            
        Raises:
            Exception: If execution fails
        """
        pass

    def _resolve_prompt(self, agent_config, base_prompt: str = None) -> str:
        """Resolve agent prompt with parameter substitution."""
        prompt = base_prompt or agent_config.prompt or "You are a helpful assistant."
        
        for param in agent_config.parameters:
            placeholder = f"{{{param.name}}}"
            prompt = prompt.replace(placeholder, param.value)

        return prompt
