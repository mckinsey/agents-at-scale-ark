"""Profile resolver for parsing ExecutionProfile from requests."""

import logging
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)


@dataclass
class WorkspaceConfig:
    """Resolved workspace configuration."""
    type: str = "none"  # git, filesystem, none
    git: Optional[Dict[str, Any]] = None


@dataclass
class CriticConfig:
    """Resolved critic configuration."""
    enabled: bool = False
    mode: str = "inline"  # inline, subagent
    max_retries: int = 2
    inline: Optional[Dict[str, Any]] = None
    subagent: Optional[Dict[str, Any]] = None


@dataclass
class HookConfig:
    """Resolved hook configuration."""
    name: str
    action: str
    condition: Optional[str] = None
    params: Dict[str, str] = field(default_factory=dict)


@dataclass
class ResolvedProfile:
    """Fully resolved ExecutionProfile ready for execution.
    
    This represents the profile after it has been loaded from the request
    and is ready to be used by the executor.
    """
    name: str
    namespace: str
    workspace: Optional[WorkspaceConfig] = None
    pre_execute: List[HookConfig] = field(default_factory=list)
    execution: Optional[Dict[str, Any]] = None
    critic: Optional[CriticConfig] = None
    post_execute: List[HookConfig] = field(default_factory=list)
    on_failure: List[HookConfig] = field(default_factory=list)
    sdk_config: Optional[Dict[str, Any]] = None


class ProfileResolver:
    """Resolves ExecutionProfile from request data.
    
    The profile is passed by the Ark controller in the request,
    already resolved from the ExecutionProfile CRD.
    """

    def from_request(self, profile_data: Optional[Dict[str, Any]]) -> ResolvedProfile:
        """Parse ResolvedProfile from request.profile.
        
        Args:
            profile_data: The profile dict from ExecutionEngineRequest
            
        Returns:
            ResolvedProfile with all fields parsed and defaults applied
        """
        if not profile_data:
            logger.info("No profile in request, using defaults")
            return ResolvedProfile(name="default", namespace="default")

        # Parse workspace
        workspace = None
        if "workspace" in profile_data and profile_data["workspace"]:
            ws_data = profile_data["workspace"]
            workspace = WorkspaceConfig(
                type=ws_data.get("type", "none"),
                git=ws_data.get("git"),
            )

        # Parse hooks
        pre_execute = self._parse_hooks(profile_data.get("preExecute", []))
        post_execute = self._parse_hooks(profile_data.get("postExecute", []))
        on_failure = self._parse_hooks(profile_data.get("onFailure", []))

        # Parse critic
        critic = None
        if "critic" in profile_data and profile_data["critic"]:
            critic_data = profile_data["critic"]
            critic = CriticConfig(
                enabled=critic_data.get("enabled", False),
                mode=critic_data.get("mode", "inline"),
                max_retries=critic_data.get("maxRetries", 2),
                inline=critic_data.get("inline"),
                subagent=critic_data.get("subagent"),
            )

        return ResolvedProfile(
            name=profile_data.get("name", "unknown"),
            namespace=profile_data.get("namespace", "default"),
            workspace=workspace,
            pre_execute=pre_execute,
            execution=profile_data.get("execution"),
            critic=critic,
            post_execute=post_execute,
            on_failure=on_failure,
            sdk_config=profile_data.get("sdkConfig"),
        )

    def _parse_hooks(self, hooks_data: List[Dict[str, Any]]) -> List[HookConfig]:
        """Parse a list of hook configurations.
        
        Args:
            hooks_data: List of hook dicts from profile
            
        Returns:
            List of parsed HookConfig objects
        """
        hooks = []
        for hook_data in hooks_data:
            hooks.append(HookConfig(
                name=hook_data.get("name", "unnamed"),
                action=hook_data.get("action", ""),
                condition=hook_data.get("condition"),
                params=hook_data.get("params", {}),
            ))
        return hooks
