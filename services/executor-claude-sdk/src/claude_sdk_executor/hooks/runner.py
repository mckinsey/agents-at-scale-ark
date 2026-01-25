"""Hook runner for executing hooks in sequence."""

import logging
from typing import List, Any

from ..profile.resolver import HookConfig
from ..profile.templates import TemplateContext
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
    ) -> List[HookResult]:
        """Run a list of hooks in sequence.
        
        Args:
            hooks: List of hook configurations to run
            context: Template context for variable resolution
            state: Current execution state
            
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
            
            # Execute hook
            logger.info(f"Running hook: {hook_config.name} ({hook_config.action})")
            try:
                result = await hook.execute(params, context, state)
                results.append(result)
                
                if not result.success:
                    logger.error(f"Hook {hook_config.name} failed: {result.error}")
                    raise RuntimeError(f"Hook {hook_config.name} failed: {result.error}")
                
                logger.info(f"Hook {hook_config.name} completed successfully")
                
            except Exception as e:
                logger.error(f"Hook {hook_config.name} raised exception: {e}")
                raise
        
        return results
