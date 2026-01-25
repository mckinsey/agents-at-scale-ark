"""Git fetch hook."""

import logging
from typing import Any

from ..base import Hook, HookParams, HookResult
from ...workspace.git import GitWorkspace
from ...profile.templates import TemplateContext

logger = logging.getLogger(__name__)


class GitFetchHook(Hook):
    """Fetch from remote.
    
    Parameters:
        ref: Specific ref to fetch (optional)
        remote: Remote name (default: origin)
    """

    @property
    def action_name(self) -> str:
        return "git_fetch"

    async def execute(
        self,
        params: HookParams,
        context: TemplateContext,
        state: Any,
    ) -> HookResult:
        """Fetch from remote repository."""
        workspace_path = getattr(state, "workspace_path", None)
        if not workspace_path:
            return HookResult(
                success=False,
                error="No workspace path available"
            )

        remote = params.resolved_params.get("remote", "origin")
        ref = params.resolved_params.get("ref")

        try:
            git = GitWorkspace(workspace_path)
            await git.fetch(ref=ref, remote=remote)
            
            return HookResult(
                success=True,
                output=f"Fetched from {remote}" + (f" ref {ref}" if ref else ""),
                metadata={"remote": remote, "ref": ref}
            )
        except Exception as e:
            logger.error(f"Git fetch failed: {e}")
            return HookResult(
                success=False,
                error=str(e)
            )
