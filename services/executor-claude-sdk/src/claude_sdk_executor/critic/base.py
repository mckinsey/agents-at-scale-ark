"""Base critic interface."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ..profile.templates import TemplateContext


@dataclass
class CriticResult:
    """Result of critic validation."""
    passed: bool
    score: float  # 0.0 to 1.0
    feedback: str = ""
    metadata: dict = None

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


class Critic(ABC):
    """Base class for critics.
    
    Critics validate agent output against quality criteria and
    can trigger retries if the output doesn't meet requirements.
    """

    @abstractmethod
    async def validate(
        self,
        agent_output: str,
        context: "TemplateContext",
        state: Any,
    ) -> CriticResult:
        """Validate agent output.
        
        Args:
            agent_output: The agent's output text
            context: Template context with execution variables
            state: Current execution state
            
        Returns:
            CriticResult indicating pass/fail and feedback
        """
        pass
