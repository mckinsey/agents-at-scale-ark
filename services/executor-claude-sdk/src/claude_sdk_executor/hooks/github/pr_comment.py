"""GitHub PR comment hook."""

import logging
import os
import re
from typing import Any, Tuple

from github import Github, GithubException

from ..base import Hook, HookParams, HookResult
from ...profile.templates import TemplateContext

logger = logging.getLogger(__name__)


class PRCommentHook(Hook):
    """Add a comment to a pull request.
    
    Parameters:
        prNumber: PR number (can use template like {{.PRNumber}})
        body: Comment body
    """

    @property
    def action_name(self) -> str:
        return "pr_comment"

    def _parse_repo_info(self, repo_url: str) -> Tuple[str, str]:
        """Parse owner and repo name from git URL."""
        # Handle SSH URLs
        ssh_match = re.match(r"git@github\.com:([^/]+)/([^/]+?)(?:\.git)?$", repo_url)
        if ssh_match:
            return ssh_match.group(1), ssh_match.group(2)
        
        # Handle HTTPS URLs
        https_match = re.match(r"https://github\.com/([^/]+)/([^/]+?)(?:\.git)?$", repo_url)
        if https_match:
            return https_match.group(1), https_match.group(2)
        
        raise ValueError(f"Could not parse GitHub repo from URL: {repo_url}")

    async def execute(
        self,
        params: HookParams,
        context: TemplateContext,
        state: Any,
    ) -> HookResult:
        """Add a comment to a pull request."""
        github_token = os.environ.get("GITHUB_TOKEN")
        if not github_token:
            return HookResult(
                success=False,
                error="GITHUB_TOKEN environment variable not set"
            )

        repo_url = params.resolved_params.get("repo") or context.get("Repo")
        if not repo_url:
            return HookResult(
                success=False,
                error="No repository URL available"
            )

        try:
            owner, repo_name = self._parse_repo_info(repo_url)
        except ValueError as e:
            return HookResult(success=False, error=str(e))

        pr_number_str = params.resolved_params.get("prNumber") or context.get("PRNumber")
        if not pr_number_str:
            return HookResult(
                success=False,
                error="No PR number specified"
            )
        
        try:
            pr_number = int(pr_number_str)
        except ValueError:
            return HookResult(
                success=False,
                error=f"Invalid PR number: {pr_number_str}"
            )

        body = params.resolved_params.get("body", "")
        if not body:
            return HookResult(
                success=False,
                error="No comment body specified"
            )

        try:
            gh = Github(github_token)
            repo = gh.get_repo(f"{owner}/{repo_name}")
            pr = repo.get_pull(pr_number)
            
            comment = pr.create_issue_comment(body)
            
            return HookResult(
                success=True,
                output=f"Added comment to PR #{pr_number}",
                metadata={
                    "pr_number": pr_number,
                    "comment_id": comment.id,
                }
            )
            
        except GithubException as e:
            logger.error(f"GitHub API error: {e}")
            return HookResult(
                success=False,
                error=f"GitHub API error: {e.data.get('message', str(e))}"
            )
        except Exception as e:
            logger.error(f"PR comment failed: {e}")
            return HookResult(
                success=False,
                error=str(e)
            )
