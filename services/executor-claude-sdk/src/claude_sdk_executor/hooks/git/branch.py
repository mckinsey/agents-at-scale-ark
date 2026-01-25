"""Git branch hooks."""

import logging
from typing import Any

from ..base import Hook, HookParams, HookResult
from ...workspace.git import GitWorkspace
from ...profile.templates import TemplateContext

logger = logging.getLogger(__name__)


class GitCreateBranchHook(Hook):
    """Create and checkout a new branch.
    
    Parameters:
        nameTemplate: Template for branch name (e.g., "{{.BranchPrefix}}{{.QueryID}}")
    """

    @property
    def action_name(self) -> str:
        return "git_create_branch"

    async def execute(
        self,
        params: HookParams,
        context: TemplateContext,
        state: Any,
    ) -> HookResult:
        """Create a new branch from the name template."""
        workspace_path = getattr(state, "workspace_path", None)
        if not workspace_path:
            return HookResult(
                success=False,
                error="No workspace path available"
            )

        # Get branch name from template or generate one
        name_template = params.resolved_params.get("nameTemplate", "")
        if name_template:
            branch_name = name_template  # Already resolved by runner
        else:
            # Generate default branch name
            prefix = context.get("BranchPrefix", "agent/")
            query_id = context.get("QueryID", "unknown")
            branch_name = f"{prefix}{query_id}"

        try:
            git = GitWorkspace(workspace_path)
            await git.create_branch(branch_name)
            
            # Update context with branch info
            context.update_branch(branch_name, context.get("BranchPrefix", ""))
            state.branch_name = branch_name
            
            return HookResult(
                success=True,
                output=f"Created branch {branch_name}",
                metadata={"branch": branch_name}
            )
        except Exception as e:
            logger.error(f"Git create branch failed: {e}")
            return HookResult(
                success=False,
                error=str(e)
            )


class GitCheckoutHook(Hook):
    """Checkout an existing branch or ref.
    
    Parameters:
        ref: Branch name, tag, or commit SHA to checkout
    """

    @property
    def action_name(self) -> str:
        return "git_checkout"

    async def execute(
        self,
        params: HookParams,
        context: TemplateContext,
        state: Any,
    ) -> HookResult:
        """Checkout the specified ref."""
        workspace_path = getattr(state, "workspace_path", None)
        if not workspace_path:
            return HookResult(
                success=False,
                error="No workspace path available"
            )

        ref = params.resolved_params.get("ref")
        if not ref:
            return HookResult(
                success=False,
                error="No ref specified for checkout"
            )

        try:
            git = GitWorkspace(workspace_path)
            await git.checkout(ref)
            
            return HookResult(
                success=True,
                output=f"Checked out {ref}",
                metadata={"ref": ref}
            )
        except Exception as e:
            logger.error(f"Git checkout failed: {e}")
            return HookResult(
                success=False,
                error=str(e)
            )
