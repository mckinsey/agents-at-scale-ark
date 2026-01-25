"""Jira comment hook."""

import logging
import os
from typing import Any

import httpx

from ..base import Hook, HookParams, HookResult
from ...profile.templates import TemplateContext

logger = logging.getLogger(__name__)


class JiraCommentHook(Hook):
    """Add a comment to a Jira ticket.
    
    Parameters:
        ticket: Jira ticket ID (e.g., PROJ-123)
        comment: Comment body
    
    Environment Variables:
        JIRA_URL: Jira base URL (e.g., https://company.atlassian.net)
        JIRA_EMAIL: Jira user email
        JIRA_API_TOKEN: Jira API token
    """

    @property
    def action_name(self) -> str:
        return "jira_comment"

    async def execute(
        self,
        params: HookParams,
        context: TemplateContext,
        state: Any,
    ) -> HookResult:
        """Add a comment to a Jira ticket."""
        jira_url = os.environ.get("JIRA_URL")
        jira_email = os.environ.get("JIRA_EMAIL")
        jira_token = os.environ.get("JIRA_API_TOKEN")
        
        if not all([jira_url, jira_email, jira_token]):
            return HookResult(
                success=False,
                error="Missing Jira credentials. Set JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN."
            )

        ticket = params.resolved_params.get("ticket") or context.get("JiraTicket")
        if not ticket:
            return HookResult(
                success=False,
                error="No Jira ticket specified"
            )

        comment = params.resolved_params.get("comment", "")
        if not comment:
            return HookResult(
                success=False,
                error="No comment body specified"
            )

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{jira_url}/rest/api/3/issue/{ticket}/comment",
                    auth=(jira_email, jira_token),
                    json={
                        "body": {
                            "type": "doc",
                            "version": 1,
                            "content": [
                                {
                                    "type": "paragraph",
                                    "content": [
                                        {
                                            "type": "text",
                                            "text": comment
                                        }
                                    ]
                                }
                            ]
                        }
                    },
                    headers={"Content-Type": "application/json"},
                )
                
                if response.status_code not in (200, 201):
                    return HookResult(
                        success=False,
                        error=f"Jira API error: {response.status_code} - {response.text}"
                    )
                
                return HookResult(
                    success=True,
                    output=f"Added comment to {ticket}",
                    metadata={"ticket": ticket}
                )
                
        except Exception as e:
            logger.error(f"Jira comment failed: {e}")
            return HookResult(
                success=False,
                error=str(e)
            )
