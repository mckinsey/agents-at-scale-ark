"""Base hook interface and types."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, Any, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..profile.templates import TemplateContext


@dataclass
class HookParams:
    """Parameters passed to a hook.
    
    Contains both raw parameters from the profile and resolved
    parameters after template substitution.
    """
    raw_params: Dict[str, str] = field(default_factory=dict)
    resolved_params: Dict[str, str] = field(default_factory=dict)


@dataclass
class HookResult:
    """Result of hook execution."""
    success: bool
    output: str = ""
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class Hook(ABC):
    """Base class for all hooks.
    
    Hooks are lifecycle actions that run before or after agent execution.
    They provide deterministic operations like git clone, commit, push,
    and PR creation around the non-deterministic agent execution.
    """

    @property
    @abstractmethod
    def action_name(self) -> str:
        """The action name this hook handles (e.g., 'git_clone').
        
        This is used to match hooks to profile hook configurations.
        """
        pass

    @abstractmethod
    async def execute(
        self,
        params: HookParams,
        context: "TemplateContext",
        state: Any,
    ) -> HookResult:
        """Execute the hook action.
        
        Args:
            params: Hook parameters (raw and resolved)
            context: Template context for variable resolution
            state: Current execution state
            
        Returns:
            HookResult indicating success/failure
        """
        pass
