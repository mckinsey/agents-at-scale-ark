"""Execution engine utilities and types for ARK SDK."""

import logging
from abc import ABC, abstractmethod
from typing import List, Dict, Any
from pydantic import BaseModel


logger = logging.getLogger(__name__)

ARK_METADATA_KEY = "ark.mckinsey.com/execution-engine"


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


class ExecutionProfile(BaseModel):
    """Execution profile declared in the Agent Card."""
    schema_url: str = "https://ark.mckinsey.com/extensions/execution-profile/v1"
    tool_mode: str = "callback"
    memory_mode: str = "inline"
    structured_output: bool = False
    streaming: bool = True
    supported_models: List[str] = []

    def to_card_dict(self) -> Dict[str, Any]:
        return {
            "schema": self.schema_url,
            "toolMode": self.tool_mode,
            "memoryMode": self.memory_mode,
            "structuredOutput": self.structured_output,
            "streaming": self.streaming,
            "supportedModels": self.supported_models,
        }


class ToolCallRequest(BaseModel):
    """A tool call request from the engine to the controller."""
    tool_call_id: str
    tool_name: str
    arguments: str


class ToolCallResult(BaseModel):
    """A tool call result from the controller back to the engine."""
    tool_call_id: str
    tool_name: str
    content: str = ""
    error: str = ""


class BaseExecutor(ABC):
    """Abstract base class for execution engines."""

    def __init__(self, engine_name: str):
        self.engine_name = engine_name
        logger.info(f"{engine_name} executor initialized")

    @abstractmethod
    async def execute_agent(self, request: ExecutionEngineRequest) -> List[Message]:
        """Execute an agent with the given request."""
        pass

    def _resolve_prompt(self, agent_config, base_prompt: str = None) -> str:
        """Resolve agent prompt with parameter substitution."""
        prompt = base_prompt or agent_config.prompt or "You are a helpful assistant."
        
        for param in agent_config.parameters:
            placeholder = f"{{{param.name}}}"
            prompt = prompt.replace(placeholder, param.value)

        return prompt

    def get_execution_profile(self) -> ExecutionProfile:
        """Override to declare engine capabilities."""
        return ExecutionProfile()
