"""GitHub PR review hook."""

import logging
import os
import re
from typing import Any, Tuple

from github import Github, GithubException

from ..base import Hook, HookParams, HookResult
from ...profile.templates import TemplateContext

logger = logging.getLogger(__name__)


class PRSubmitReviewHook(Hook):
    """Submit a review on a pull request.
    
    Parameters:
        prNumber: PR number
        bodyTemplate: Review body template
        event: Review event type (APPROVE, REQUEST_CHANGES, COMMENT)
    """

    @property
    def action_name(self) -> str:
        return "pr_submit_review"

    def _parse_repo_info(self, repo_url: str) -> Tuple[str, str]:
        """Parse owner and repo name from git URL."""
        ssh_match = re.match(r"git@github\.com:([^/]+)/([^/]+?)(?:\.git)?$", repo_url)
        if ssh_match:
            return ssh_match.group(1), ssh_match.group(2)
        
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
        """Submit a review on a pull request."""
        github_token = os.environ.get("GITHUB_TOKEN")
        if not github_token:
            return HookResult(
                success=False,
                error="GITHUB_TOKEN environment variable not set"
            )

        repo_url = context.get("Repo")
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

        body = params.resolved_params.get("bodyTemplate", "")
        event = params.resolved_params.get("event", "COMMENT").upper()
        
        # Validate event type
        valid_events = ["APPROVE", "REQUEST_CHANGES", "COMMENT"]
        if event not in valid_events:
            return HookResult(
                success=False,
                error=f"Invalid review event: {event}. Must be one of {valid_events}"
            )

        try:
            gh = Github(github_token)
            repo = gh.get_repo(f"{owner}/{repo_name}")
            pr = repo.get_pull(pr_number)
            
            review = pr.create_review(body=body, event=event)
            
            return HookResult(
                success=True,
                output=f"Submitted {event} review on PR #{pr_number}",
                metadata={
                    "pr_number": pr_number,
                    "review_id": review.id,
                    "event": event,
                }
            )
            
        except GithubException as e:
            logger.error(f"GitHub API error: {e}")
            return HookResult(
                success=False,
                error=f"GitHub API error: {e.data.get('message', str(e))}"
            )
        except Exception as e:
            logger.error(f"PR review failed: {e}")
            return HookResult(
                success=False,
                error=str(e)
            )
