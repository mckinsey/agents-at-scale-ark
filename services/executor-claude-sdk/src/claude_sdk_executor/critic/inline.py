"""Inline critic utilities - test running and evaluation helpers.

Note: Inline critic session handling is implemented directly in executor.py
using sdk_runner.execute_with_critic(). This module provides helper utilities
for test running and response evaluation.

The key insight is that inline critic MUST run in the same ClaudeSDKClient
session as the main task to maintain context. This is handled by calling
client.query() twice within the same async context manager block.
"""

import asyncio
import logging
import re
import shlex
import subprocess
from dataclasses import dataclass
from typing import Optional, Any, List, TYPE_CHECKING

from .base import Critic, CriticResult

if TYPE_CHECKING:
    from ..profile.templates import TemplateContext

logger = logging.getLogger(__name__)

# Default test commands to try when no custom testCommand is specified
DEFAULT_TEST_COMMANDS = [
    ["pytest", "-v", "--tb=short"],
    ["npm", "test"],
    ["go", "test", "./..."],
    ["make", "test"],
]


@dataclass
class TestResult:
    """Result of running tests."""
    success: bool
    output: str


async def run_tests(
    workspace_path: str,
    test_command: Optional[str] = None,
    timeout: int = 300,
) -> TestResult:
    """
    Run tests in the workspace before critic validation.

    If test_command is provided, runs that command directly.
    Otherwise, tries common test commands (pytest, npm test, go test, make test).
    
    Args:
        workspace_path: Path to the workspace directory
        test_command: Custom test command to run (e.g., "pytest -v tests/")
        timeout: Timeout in seconds (default: 300 / 5 minutes)
        
    Returns:
        TestResult with success status and output
    """
    # If custom command provided, use it directly
    if test_command:
        return await _run_single_test(
            shlex.split(test_command),
            workspace_path,
            timeout,
        )
    
    # Otherwise try default test commands
    for cmd in DEFAULT_TEST_COMMANDS:
        result = await _run_single_test(cmd, workspace_path, timeout)
        # If command was found (even if tests failed), return the result
        if result.output != "Command not found":
            return result

    # No test command found - consider it a pass
    logger.info("No test command found in workspace")
    return TestResult(success=True, output="No test command found")


async def _run_single_test(
    cmd: List[str],
    workspace_path: str,
    timeout: int,
) -> TestResult:
    """Run a single test command.
    
    Args:
        cmd: Command to run as list of arguments
        workspace_path: Working directory
        timeout: Timeout in seconds
        
    Returns:
        TestResult with success status and output
    """
    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=workspace_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(
            process.communicate(),
            timeout=timeout,
        )
        
        if process.returncode == 0:
            logger.info(f"Tests passed using: {' '.join(cmd)}")
            return TestResult(success=True, output=stdout.decode())
        else:
            logger.info(f"Tests failed using: {' '.join(cmd)}")
            return TestResult(
                success=False,
                output=stdout.decode() + stderr.decode()
            )
    except FileNotFoundError:
        return TestResult(success=True, output="Command not found")
    except asyncio.TimeoutError:
        logger.warning(f"Test command timed out: {' '.join(cmd)}")
        return TestResult(
            success=False,
            output=f"Test command timed out after {timeout // 60} minutes"
        )


def evaluate_critic_response(response: str, pass_pattern: str = "APPROVED") -> bool:
    """
    Evaluate whether the critic response indicates approval.

    Uses regex pattern matching to check if the response contains
    the pass pattern (case-insensitive).

    Args:
        response: The critic's response text
        pass_pattern: Regex pattern to match for approval (default: "APPROVED")

    Returns:
        True if the response matches the pass pattern
    """
    return bool(re.search(pass_pattern, response, re.IGNORECASE))


class InlineCritic(Critic):
    """Inline critic that validates within the same session.
    
    This is a utility class for post-processing critic responses.
    The actual inline critic execution happens in executor.py using
    sdk_runner.execute_with_critic() for session continuity.
    """

    def __init__(self, config: dict, pass_pattern: str = "APPROVED"):
        """Initialize inline critic.
        
        Args:
            config: Inline critic config from profile
            pass_pattern: Regex pattern for approval
        """
        self.config = config
        self.pass_pattern = pass_pattern
        self.run_tests_enabled = config.get("runTests", False)
        self.test_command = config.get("testCommand")  # Custom test command
        self.test_timeout = config.get("testTimeout", 300)  # Timeout in seconds

    async def validate(
        self,
        agent_output: str,
        context: "TemplateContext",
        state: Any,
    ) -> CriticResult:
        """Validate using the critic response from state.
        
        Note: The actual critic execution happens in executor.py.
        This method evaluates the critic response that was captured.
        """
        critic_response = getattr(state, "critic_feedback", "")
        
        # Run tests if enabled
        if self.run_tests_enabled:
            workspace_path = getattr(state, "workspace_path", None)
            if workspace_path:
                test_result = await run_tests(
                    workspace_path,
                    test_command=self.test_command,
                    timeout=self.test_timeout,
                )
                if not test_result.success:
                    return CriticResult(
                        passed=False,
                        score=0.0,
                        feedback=f"Tests failed:\n{test_result.output}",
                        metadata={"tests_passed": False}
                    )
                context.set("TestsPassed", True)

        # Evaluate critic response
        passed = evaluate_critic_response(critic_response, self.pass_pattern)
        
        return CriticResult(
            passed=passed,
            score=1.0 if passed else 0.0,
            feedback="" if passed else critic_response,
            metadata={"pattern": self.pass_pattern}
        )
