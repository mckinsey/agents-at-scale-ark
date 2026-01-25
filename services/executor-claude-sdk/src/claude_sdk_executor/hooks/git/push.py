"""Git push hook."""

import logging
from typing import Any

from ..base import Hook, HookParams, HookResult
from ...workspace.git import GitWorkspace
from ...profile.templates import TemplateContext

logger = logging.getLogger(__name__)


class GitPushHook(Hook):
    """Push commits to remote.
    
    Parameters:
        remote: Remote name (default: origin)
        force: Force push (default: false)
    """

    @property
    def action_name(self) -> str:
        return "git_push"

    async def execute(
        self,
        params: HookParams,
        context: TemplateContext,
        state: Any,
    ) -> HookResult:
        """Push to remote repository."""
        workspace_path = getattr(state, "workspace_path", None)
        if not workspace_path:
            return HookResult(
                success=False,
                error="No workspace path available"
            )

        remote = params.resolved_params.get("remote", "origin")
        force = params.resolved_params.get("force", "").lower() in ("true", "yes", "1")

        try:
            git = GitWorkspace(workspace_path)
            await git.push(remote=remote, force=force)
            
            branch = await git.get_current_branch()
            
            return HookResult(
                success=True,
                output=f"Pushed to {remote}/{branch}",
                metadata={"remote": remote, "branch": branch, "force": force}
            )
        except Exception as e:
            logger.error(f"Git push failed: {e}")
            return HookResult(
                success=False,
                error=str(e)
            )
