"""Hook runner for executing hooks in sequence."""

import logging
from typing import List, Any, Optional

from ..profile.resolver import HookConfig
from ..profile.templates import TemplateContext
from ..telemetry import create_hook_span, end_hook_span
from .base import HookParams, HookResult
from .registry import get_registry

logger = logging.getLogger(__name__)


class HookRunner:
    """Runs hooks in sequence with condition evaluation.
    
    Executes a list of hooks, evaluating conditions and resolving
    template variables before each hook runs.
    """

    def __init__(self) -> None:
        self.registry = get_registry()

    async def run(
        self,
        hooks: List[HookConfig],
        context: TemplateContext,
        state: Any,
        phase_name: str = "hooks",
    ) -> List[HookResult]:
        """Run a list of hooks in sequence.
        
        Args:
            hooks: List of hook configurations to run
            context: Template context for variable resolution
            state: Current execution state
            phase_name: The lifecycle phase name for tracing (e.g., "pre-execute")
            
        Returns:
            List of HookResult for each hook that was run
            
        Raises:
            RuntimeError: If a required hook fails
        """
        results = []
        
        for hook_config in hooks:
            # Check condition
            if hook_config.condition:
                if not context.evaluate_condition(hook_config.condition):
                    logger.info(f"Skipping hook {hook_config.name}: condition not met")
                    continue
            
            # Get hook implementation
            hook = self.registry.get(hook_config.action)
            if not hook:
                logger.warning(f"Unknown hook action: {hook_config.action}")
                continue
            
            # Resolve parameters
            resolved_params = {}
            for key, value in hook_config.params.items():
                resolved_params[key] = context.resolve(value)
            
            params = HookParams(
                raw_params=hook_config.params,
                resolved_params=resolved_params,
            )
            
            # Create telemetry span for this hook
            span = create_hook_span(
                hook_name=hook_config.name,
                action=hook_config.action,
                phase=phase_name,
                params=resolved_params,
            )
            
            # Execute hook
            logger.info(f"Running hook: {hook_config.name} ({hook_config.action})")
            try:
                result = await hook.execute(params, context, state)
                results.append(result)
                
                # End span with result
                end_hook_span(
                    span=span,
                    success=result.success,
                    error=result.error,
                    metadata=result.metadata,
                )
                
                if not result.success:
                    logger.error(f"Hook {hook_config.name} failed: {result.error}")
                    raise RuntimeError(f"Hook {hook_config.name} failed: {result.error}")
                
                logger.info(f"Hook {hook_config.name} completed successfully")
                
            except Exception as e:
                # End span with exception
                end_hook_span(
                    span=span,
                    success=False,
                    error=str(e),
                )
                logger.error(f"Hook {hook_config.name} raised exception: {e}")
                raise
        
        return results
