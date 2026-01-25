"""Hook registry for discovering and instantiating hooks."""

import logging
from typing import Dict, Optional, Type

from .base import Hook

logger = logging.getLogger(__name__)

# Global registry instance
_registry: Optional["HookRegistry"] = None


class HookRegistry:
    """Registry for hook implementations.
    
    Maintains a mapping of action names to hook classes, allowing
    hooks to be looked up and instantiated by name.
    """

    def __init__(self) -> None:
        self._hooks: Dict[str, Type[Hook]] = {}
        self._instances: Dict[str, Hook] = {}

    def register(self, hook_class: Type[Hook]) -> None:
        """Register a hook class.
        
        Args:
            hook_class: Hook class to register
        """
        # Create temporary instance to get action name
        instance = hook_class()
        action_name = instance.action_name
        self._hooks[action_name] = hook_class
        self._instances[action_name] = instance
        logger.debug(f"Registered hook: {action_name}")

    def get(self, action_name: str) -> Optional[Hook]:
        """Get a hook instance by action name.
        
        Args:
            action_name: The action name (e.g., 'git_clone')
            
        Returns:
            Hook instance or None if not found
        """
        return self._instances.get(action_name)

    def list_actions(self) -> list[str]:
        """List all registered action names.
        
        Returns:
            List of registered action names
        """
        return list(self._hooks.keys())


def get_registry() -> HookRegistry:
    """Get the global hook registry, initializing if needed.
    
    Returns:
        Global HookRegistry instance with all hooks registered
    """
    global _registry
    if _registry is None:
        _registry = HookRegistry()
        _register_all_hooks(_registry)
    return _registry


def _register_all_hooks(registry: HookRegistry) -> None:
    """Register all built-in hooks."""
    # Import and register git hooks
    from .git.clone import GitCloneHook
    from .git.branch import GitCreateBranchHook, GitCheckoutHook
    from .git.commit import GitCommitHook
    from .git.push import GitPushHook
    from .git.fetch import GitFetchHook

    registry.register(GitCloneHook)
    registry.register(GitCreateBranchHook)
    registry.register(GitCheckoutHook)
    registry.register(GitCommitHook)
    registry.register(GitPushHook)
    registry.register(GitFetchHook)

    # Import and register github hooks
    from .github.pr_create import PRCreateHook
    from .github.pr_comment import PRCommentHook
    from .github.pr_review import PRSubmitReviewHook

    registry.register(PRCreateHook)
    registry.register(PRCommentHook)
    registry.register(PRSubmitReviewHook)

    # Import and register jira hooks
    from .jira.comment import JiraCommentHook

    registry.register(JiraCommentHook)

    # Import and register utility hooks
    from .log import LogHook

    registry.register(LogHook)

    logger.info(f"Registered {len(registry.list_actions())} hooks")
