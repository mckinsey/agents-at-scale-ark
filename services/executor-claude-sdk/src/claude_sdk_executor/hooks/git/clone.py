"""Git clone hook."""

import logging
from typing import Any

from ..base import Hook, HookParams, HookResult
from ...workspace.git import GitWorkspace
from ...profile.templates import TemplateContext

logger = logging.getLogger(__name__)


class GitCloneHook(Hook):
    """Clone a git repository.
    
    Parameters:
        branch: Branch to clone (default: from context or 'main')
        depth: Shallow clone depth (optional)
        ref: Specific ref to checkout after clone (optional)
    """

    @property
    def action_name(self) -> str:
        return "git_clone"

    async def execute(
        self,
        params: HookParams,
        context: TemplateContext,
        state: Any,
    ) -> HookResult:
        """Clone the repository to the workspace.
        
        Uses the repo URL from params.url (if set in profile) or from context
        (set from agent annotations/parameters).
        """
        # Check params first (explicit in profile), then context (from query parameters)
        repo = params.resolved_params.get("url") or context.get("Repo")
        if not repo:
            return HookResult(
                success=False,
                error="No repository URL provided. Set 'url' param in profile or pass Repo parameter in query."
            )

        workspace_path = getattr(state, "workspace_path", None)
        if not workspace_path:
            return HookResult(
                success=False,
                error="No workspace path available"
            )

        branch = params.resolved_params.get("branch") or context.get("Branch", "main")
        depth_str = params.resolved_params.get("depth")
        depth = int(depth_str) if depth_str else None
        ref = params.resolved_params.get("ref")

        try:
            git = GitWorkspace(workspace_path)
            await git.clone(repo, branch=branch, depth=depth, ref=ref)
            
            return HookResult(
                success=True,
                output=f"Cloned {repo} to {workspace_path}",
                metadata={"repo": repo, "branch": branch}
            )
        except Exception as e:
            logger.error(f"Git clone failed: {e}")
            return HookResult(
                success=False,
                error=str(e)
            )
