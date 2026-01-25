"""Subagent critic that calls another Ark agent for validation."""

import logging
import os
from typing import Any, Optional, TYPE_CHECKING

import httpx

from .base import Critic, CriticResult

if TYPE_CHECKING:
    from ..profile.templates import TemplateContext

logger = logging.getLogger(__name__)


class SubagentCritic(Critic):
    """Subagent critic that invokes a separate Ark agent for validation.
    
    This critic calls another Ark agent (via the Ark API) to validate
    the main agent's output. The critic agent runs in its own context
    without access to the main agent's session.
    """

    def __init__(self, config: dict):
        """Initialize subagent critic.
        
        Args:
            config: Subagent critic config from profile
        """
        self.config = config
        self.agent_ref = config.get("agentRef", {})
        self.input_template = config.get("inputTemplate", "")
        self.pass_condition = config.get("passCondition", "{{.CriticScore}} >= 0.8")

    async def validate(
        self,
        agent_output: str,
        context: "TemplateContext",
        state: Any,
    ) -> CriticResult:
        """Validate by calling another Ark agent.
        
        Args:
            agent_output: The main agent's output
            context: Template context
            state: Execution state with diff and changes
            
        Returns:
            CriticResult from the subagent
        """
        agent_name = self.agent_ref.get("name")
        agent_namespace = self.agent_ref.get("namespace", "default")
        
        if not agent_name:
            return CriticResult(
                passed=False,
                score=0.0,
                feedback="No critic agent specified in subagent config"
            )

        # Build input for critic agent
        input_text = self._build_input(agent_output, context, state)

        try:
            # Call the critic agent via Ark API
            result = await self._call_critic_agent(
                agent_name,
                agent_namespace,
                input_text,
            )
            
            # Parse result and determine pass/fail
            score = self._extract_score(result)
            passed = self._evaluate_pass_condition(score, context)
            
            return CriticResult(
                passed=passed,
                score=score,
                feedback=result if not passed else "",
                metadata={
                    "critic_agent": agent_name,
                    "critic_namespace": agent_namespace,
                }
            )
            
        except Exception as e:
            logger.error(f"Subagent critic failed: {e}")
            return CriticResult(
                passed=False,
                score=0.0,
                feedback=f"Critic agent call failed: {e}"
            )

    def _build_input(
        self,
        agent_output: str,
        context: "TemplateContext",
        state: Any,
    ) -> str:
        """Build input for the critic agent."""
        if self.input_template:
            # Use custom input template
            return context.resolve(self.input_template)
        
        # Default input includes output and diff
        diff = getattr(state, "diff", "")
        diff_summary = getattr(state, "diff_summary", "")
        
        return f"""## Agent Output
{agent_output}

## Changes Made
```
{diff_summary}
```

## Full Diff
```diff
{diff}
```

Please review the changes and provide a quality score from 0.0 to 1.0.
Respond with your assessment in the format:
SCORE: X.X
FEEDBACK: Your detailed feedback here
"""

    async def _call_critic_agent(
        self,
        agent_name: str,
        agent_namespace: str,
        input_text: str,
    ) -> str:
        """Call the critic agent via Ark API or A2A.
        
        Args:
            agent_name: Name of the critic agent
            agent_namespace: Namespace of the critic agent
            input_text: Input to send to the critic
            
        Returns:
            Critic agent's response text
        """
        # Get Ark API endpoint
        ark_api_url = os.environ.get("ARK_API_URL", "http://ark-api:8000")
        
        async with httpx.AsyncClient() as client:
            # Create a query for the critic agent
            response = await client.post(
                f"{ark_api_url}/api/v1/namespaces/{agent_namespace}/agents/{agent_name}/query",
                json={
                    "input": input_text,
                },
                timeout=120.0,
            )
            
            if response.status_code != 200:
                raise RuntimeError(f"Ark API error: {response.status_code} - {response.text}")
            
            result = response.json()
            return result.get("output", "")

    def _extract_score(self, result: str) -> float:
        """Extract numeric score from critic response."""
        import re
        
        # Look for SCORE: X.X pattern
        match = re.search(r"SCORE:\s*(\d+\.?\d*)", result, re.IGNORECASE)
        if match:
            try:
                return float(match.group(1))
            except ValueError:
                pass
        
        # Check for approval keywords
        if re.search(r"\b(APPROVED|PASS|ACCEPT)\b", result, re.IGNORECASE):
            return 1.0
        if re.search(r"\b(REJECTED|FAIL|DENY)\b", result, re.IGNORECASE):
            return 0.0
        
        # Default to middle score if unclear
        return 0.5

    def _evaluate_pass_condition(self, score: float, context: "TemplateContext") -> bool:
        """Evaluate the pass condition with the score."""
        context.set("CriticScore", score)
        return context.evaluate_condition(self.pass_condition)
