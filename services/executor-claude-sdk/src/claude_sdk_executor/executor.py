"""Main executor orchestration for Claude SDK."""

import logging
import re
from typing import Optional, List, Any
from dataclasses import dataclass, field

from ark_sdk.executor import BaseExecutor, ExecutionEngineRequest, Message

from .types.claude_config import ClaudeSdkConfig
from .types.telemetry import ExecutionTelemetry
from .profile.resolver import ProfileResolver, ResolvedProfile
from .profile.templates import TemplateContext
from .workspace.manager import WorkspaceManager
from .hooks.runner import HookRunner
from .critic.inline import run_tests, evaluate_critic_response
from .critic.subagent import SubagentCritic
from .sdk.runner import ClaudeSdkRunner

logger = logging.getLogger(__name__)


@dataclass
class ExecutionState:
    """Mutable state during execution.
    
    Tracks workspace, branch, output, and other execution artifacts
    that are passed between hooks and the agent.
    """
    workspace_path: Optional[str] = None
    branch_name: Optional[str] = None
    agent_output: str = ""
    diff: str = ""
    diff_summary: str = ""
    has_changes: bool = False
    pr_url: Optional[str] = None
    critic_feedback: str = ""
    critic_score: float = 0.0
    error: Optional[str] = None
    telemetry: ExecutionTelemetry = field(default_factory=ExecutionTelemetry)


class ClaudeSdkExecutor(BaseExecutor):
    """
    Claude SDK executor with deterministic lifecycle hooks around non-deterministic agent execution.

    The executor separates workflow into three phases:

    DETERMINISTIC PRE-EXECUTION:
    - Load and resolve ExecutionProfile
    - Create workspace (git clone, branch setup)
    - Run pre-execute hooks (environment setup, file preparation)

    NON-DETERMINISTIC AGENT EXECUTION:
    - Claude SDK runs with configured tools and permissions
    - Agent decides what to read, write, and execute
    - Optional critic validation with retry loop

    DETERMINISTIC POST-EXECUTION:
    - Run post-execute hooks (commit, push, PR creation)
    - Capture telemetry and return response

    This separation ensures that git operations, PR creation, and notifications
    happen reliably regardless of agent behavior.
    """

    def __init__(self) -> None:
        super().__init__("ClaudeSdk")
        self.profile_resolver = ProfileResolver()
        self.workspace_manager = WorkspaceManager()
        self.hook_runner = HookRunner()
        self.sdk_runner = ClaudeSdkRunner()

    async def execute_agent(self, request: ExecutionEngineRequest) -> List[Message]:
        """Execute an agent with the configured profile workflow.

        The profile is passed by the Ark controller in request.profile (already resolved).
        SDK-specific config is in request.profile.sdkConfig.claude.

        NOTE: request.tools (Ark Tools) are IGNORED. Tool configuration comes from
        sdkConfig.claude.allowedTools and sdkConfig.claude.mcpServers.
        
        Args:
            request: ExecutionEngineRequest from Ark controller
            
        Returns:
            List of response Messages
        """
        state = ExecutionState()
        profile: Optional[ResolvedProfile] = None
        context: Optional[TemplateContext] = None

        try:
            # Step 1: Get profile from request (resolved by Ark controller)
            profile_data = getattr(request, 'profile', None)
            logger.debug(f"Raw profile_data: {profile_data}, type: {type(profile_data)}")
            # Convert Pydantic model to dict if needed
            if profile_data is not None and hasattr(profile_data, 'model_dump'):
                profile_data = profile_data.model_dump(exclude_none=True)
                logger.debug(f"Converted with model_dump: {profile_data}")
            elif profile_data is not None and hasattr(profile_data, 'dict'):
                profile_data = profile_data.dict(exclude_none=True)
                logger.debug(f"Converted with dict: {profile_data}")
            profile = self.profile_resolver.from_request(profile_data)
            claude_config = ClaudeSdkConfig.from_sdk_config(profile.sdk_config)
            
            # Get model name from Agent CRD (resolved by Ark controller)
            if not request.agent or not request.agent.model:
                raise ValueError("Agent model configuration is required")
            model_name = request.agent.model.name
            
            logger.info(f"Using profile {profile.name} for agent {request.agent.name}")
            logger.info(f"Model: {model_name}")
            logger.info(f"Tools: {claude_config.allowed_tools}, MCP: {list(claude_config.mcp_servers.keys())}")

            # Step 2: Create template context
            context = TemplateContext.from_request(request)

            # Step 3: Setup workspace
            if profile.workspace and profile.workspace.type != "none":
                query_id = context.get("QueryID", "unknown")
                state.workspace_path = await self.workspace_manager.create(
                    profile.workspace,
                    query_id
                )
                context.update_workspace(state.workspace_path)

            # Step 4: Run pre-execute hooks (DETERMINISTIC)
            logger.info("Running pre-execute hooks")
            await self.hook_runner.run(
                profile.pre_execute,
                context,
                state
            )

            # Step 5: Execute agent with critic loop (NON-DETERMINISTIC)
            logger.info("Executing agent with Claude SDK")
            state.agent_output = await self._execute_with_critic(
                request,
                profile,
                claude_config,
                context,
                state,
            )

            # Step 6: Update context with results
            if state.workspace_path:
                state.diff = await self.workspace_manager.get_diff(state.workspace_path)
                state.diff_summary = await self.workspace_manager.get_diff_summary(state.workspace_path)
                state.has_changes = bool(state.diff.strip())
            context.update_results(state)

            # Step 7: Run post-execute hooks (DETERMINISTIC)
            logger.info("Running post-execute hooks")
            await self.hook_runner.run(
                profile.post_execute,
                context,
                state
            )

            logger.info(f"Execution completed successfully for agent {request.agent.name}")

            # Return messages in ark-sdk format
            return [Message(
                role="assistant",
                content=state.agent_output,
                name=request.agent.name
            )]

        except Exception as e:
            logger.error(f"Execution failed: {e}", exc_info=True)
            state.error = str(e)

            # Run failure hooks
            if profile and context:
                try:
                    context.update_error(state.error)
                    await self.hook_runner.run(profile.on_failure, context, state)
                except Exception as hook_err:
                    logger.error(f"Failure hook error: {hook_err}")

            # Raise to let ExecutorApp handle error response
            raise

        finally:
            # Cleanup workspace
            if state.workspace_path:
                await self.workspace_manager.cleanup(state.workspace_path)

    async def _execute_with_critic(
        self,
        request: ExecutionEngineRequest,
        profile: ResolvedProfile,
        claude_config: ClaudeSdkConfig,
        context: TemplateContext,
        state: ExecutionState,
    ) -> str:
        """
        Execute agent with optional critic validation loop.

        For INLINE critic: Uses session continuity - both main task and critic
        run in the same ClaudeSDKClient session, so Claude remembers its work.

        For SUBAGENT critic: Runs main task, then calls a separate Ark agent
        to validate the output.
        
        Args:
            request: Original execution request
            profile: Resolved execution profile
            claude_config: Claude SDK configuration
            context: Template context
            state: Execution state
            
        Returns:
            Agent's final output text
        """
        max_attempts = 1
        critic_enabled = profile.critic and profile.critic.enabled
        critic_mode = profile.critic.mode if critic_enabled else None

        if critic_enabled:
            max_attempts = profile.critic.max_retries + 1

        last_output = ""
        feedback = ""
        max_turns = 25  # Default
        if profile.execution:
            max_turns = profile.execution.get("maxIterations", 25)

        for attempt in range(max_attempts):
            logger.info(f"Agent execution attempt {attempt + 1}/{max_attempts}")

            # Build prompt with feedback if retrying
            prompt = request.userInput.content
            if feedback:
                prompt = f"{prompt}\n\nPREVIOUS ATTEMPT FEEDBACK:\n{feedback}\n\nPlease address the feedback above."

            if critic_enabled and critic_mode == "inline":
                # INLINE CRITIC: Use session continuity
                inline_config = profile.critic.inline or {}
                critic_prompt = self._build_inline_critic_prompt(inline_config, context)

                output, critic_response, run_telemetry = await self.sdk_runner.execute_with_critic(
                    prompt=prompt,
                    critic_prompt=critic_prompt,
                    claude_config=claude_config,
                    working_dir=state.workspace_path,
                    max_turns=max_turns,
                    system_prompt=request.agent.prompt,
                    model_name=request.agent.model.name,
                )

                state.telemetry.merge(run_telemetry)
                last_output = output

                # Evaluate critic response using Claude-specific pass pattern
                pass_pattern = "APPROVED"
                if claude_config.critic:
                    pass_pattern = claude_config.critic.pass_pattern

                passed = bool(re.search(pass_pattern, critic_response, re.IGNORECASE))
                state.critic_score = 1.0 if passed else 0.0
                state.critic_feedback = critic_response if not passed else ""

                # Run tests if configured
                if passed and inline_config.get("runTests", False) and state.workspace_path:
                    test_command = inline_config.get("testCommand")
                    test_timeout = inline_config.get("testTimeout", 300)
                    test_result = await run_tests(
                        state.workspace_path,
                        test_command=test_command,
                        timeout=test_timeout,
                    )
                    if not test_result.success:
                        passed = False
                        state.critic_score = 0.0
                        state.critic_feedback = f"Tests failed:\n{test_result.output}"
                        feedback = state.critic_feedback
                        logger.info("Tests failed, will retry")
                        continue

                if passed:
                    logger.info("Inline critic approved output")
                    break
                else:
                    logger.info(f"Inline critic rejected: {critic_response[:200]}...")
                    feedback = critic_response

            else:
                # NO CRITIC or SUBAGENT CRITIC: Run main task only
                output, run_telemetry = await self.sdk_runner.execute(
                    prompt=prompt,
                    claude_config=claude_config,
                    working_dir=state.workspace_path,
                    max_turns=max_turns,
                    system_prompt=request.agent.prompt,
                    model_name=request.agent.model.name,
                )

                state.telemetry.merge(run_telemetry)
                last_output = output

                # Update state with changes for subagent critic
                if state.workspace_path:
                    state.diff = await self.workspace_manager.get_diff(state.workspace_path)
                    state.diff_summary = await self.workspace_manager.get_diff_summary(state.workspace_path)

                # Run subagent critic if enabled
                if critic_enabled and critic_mode == "subagent":
                    subagent_config = profile.critic.subagent or {}
                    critic = SubagentCritic(subagent_config)
                    result = await critic.validate(output, context, state)

                    state.critic_score = result.score
                    state.critic_feedback = result.feedback

                    if result.passed:
                        logger.info("Subagent critic approved output")
                        break
                    else:
                        logger.info(f"Subagent critic rejected: {result.feedback}")
                        feedback = result.feedback
                else:
                    # No critic - done after first attempt
                    break

        return last_output

    def _build_inline_critic_prompt(self, inline_config: dict, context: TemplateContext) -> str:
        """Build the inline critic prompt from config.
        
        Args:
            inline_config: Inline critic configuration
            context: Template context for variable resolution
            
        Returns:
            Formatted critic prompt
        """
        prompt = inline_config.get("prompt", "")
        if prompt:
            prompt = context.resolve(prompt)

        # Add standard critic framing
        return f"""
Review the work you just completed. Evaluate whether it meets the requirements.

{prompt}

If the work is satisfactory, respond with APPROVED.
If revisions are needed, respond with NEEDS_REVISION followed by specific feedback.
"""
