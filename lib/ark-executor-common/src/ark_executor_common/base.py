"""Base executor types and abstract class for Ark execution engines."""

import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

from pydantic import BaseModel

logger = logging.getLogger(__name__)


class Parameter(BaseModel):
    name: str
    value: str


class Model(BaseModel):
    name: str
    type: str
    config: Dict[str, Any] = {}


class AgentConfig(BaseModel):
    name: str
    namespace: str
    prompt: str
    description: str = ""
    parameters: List[Parameter] = []
    model: Model
    labels: Dict[str, str] = {}
    outputSchema: Optional[Dict[str, Any]] = None


class ToolDefinition(BaseModel):
    name: str
    description: str
    parameters: Dict[str, Any] = {}


class Message(BaseModel):
    role: str
    content: str
    name: str = ""

    class Config:
        extra = "allow"


class WorkspaceConfig(BaseModel):
    path: str = ""
    sessionId: str = ""
    persistent: bool = False
    hasEnvironment: bool = False
    hasGit: bool = False


class ExecutionEngineRequest(BaseModel):
    agent: AgentConfig
    userInput: Message
    history: List[Message]
    tools: List[ToolDefinition] = []
    workspace: Optional[WorkspaceConfig] = None


class TokenUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class ExecutionEngineResponse(BaseModel):
    messages: List[Message]
    error: str = ""
    token_usage: Optional[TokenUsage] = None


class BaseExecutor(ABC):
    def __init__(self, engine_name: str):
        self.engine_name = engine_name
        logger.info(f"{engine_name} executor initialized")

    @abstractmethod
    async def execute_agent(self, request: ExecutionEngineRequest) -> List[Message]:
        pass

    def _resolve_prompt(self, agent_config: AgentConfig, base_prompt: str = None) -> str:
        prompt = base_prompt or agent_config.prompt or "You are a helpful assistant."
        for param in agent_config.parameters:
            placeholder = f"{{{param.name}}}"
            prompt = prompt.replace(placeholder, param.value)
        return prompt

    @staticmethod
    def _get_param(request: ExecutionEngineRequest, name: str, default: str = "") -> str:
        for param in request.agent.parameters:
            if param.name == name:
                return param.value
        return default

    @staticmethod
    def _get_label(request: ExecutionEngineRequest, name: str, default: str = "") -> str:
        if not request.agent.labels:
            return default
        return request.agent.labels.get(name, default)
