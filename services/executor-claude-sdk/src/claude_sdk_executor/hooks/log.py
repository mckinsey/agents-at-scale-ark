"""Log hook for simple message logging."""

import logging
from typing import Any

from .base import Hook, HookParams, HookResult
from ..profile.templates import TemplateContext

logger = logging.getLogger(__name__)


class LogHook(Hook):
    """Log a message. Useful for debugging and failure notifications.
    
    Parameters:
        message: Message to log (supports template variables)
        level: Log level (info, warning, error). Default: info
    """

    @property
    def action_name(self) -> str:
        return "log"

    async def execute(
        self,
        params: HookParams,
        context: TemplateContext,
        state: Any,
    ) -> HookResult:
        """Log a message at the specified level.
        
        Args:
            params: Hook parameters with 'message' and optional 'level'
            context: Template context (not used directly, params are pre-resolved)
            state: Execution state (not used)
            
        Returns:
            HookResult with success=True and the logged message
        """
        message = params.resolved_params.get("message", "")
        level = params.resolved_params.get("level", "info").lower()
        
        log_func = getattr(logger, level, logger.info)
        log_func(f"[Hook] {message}")
        
        return HookResult(
            success=True,
            output=message,
        )
