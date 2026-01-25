"""Claude SDK execution wrapper using ClaudeSDKClient for session continuity."""

import logging
import os
from typing import Optional, Tuple, Dict, Any, Type

from ..types.claude_config import ClaudeSdkConfig
from ..types.telemetry import ExecutionTelemetry

logger = logging.getLogger(__name__)

# Try to import Claude SDK - may not be available in all environments
CLAUDE_SDK_AVAILABLE = False
ClaudeSDKClient: Optional[Type] = None
ClaudeAgentOptions: Optional[Type] = None
ResultMessage: Optional[Type] = None
CLINotFoundError: Optional[Type[Exception]] = None
ProcessError: Optional[Type[Exception]] = None

try:
    from claude_agent_sdk import (
        ClaudeSDKClient as _ClaudeSDKClient,
        ClaudeAgentOptions as _ClaudeAgentOptions,
        ResultMessage as _ResultMessage,
    )
    ClaudeSDKClient = _ClaudeSDKClient
    ClaudeAgentOptions = _ClaudeAgentOptions
    ResultMessage = _ResultMessage
    CLAUDE_SDK_AVAILABLE = True
    
    # Try to import specific exceptions
    try:
        from claude_agent_sdk.exceptions import CLINotFoundError as _CLINotFoundError
        CLINotFoundError = _CLINotFoundError
    except ImportError:
        pass
    
    try:
        from claude_agent_sdk.exceptions import ProcessError as _ProcessError
        ProcessError = _ProcessError
    except ImportError:
        pass
        
except ImportError:
    logger.warning("Claude Agent SDK not available - using mock execution")


# Default model to use when not specified
DEFAULT_MODEL = "claude-sonnet-4-20250514"

# Supported provider environment variables
PROVIDER_ENV_VARS = {
    "azure-foundry": "CLAUDE_CODE_USE_FOUNDRY",
    "aws-bedrock": "CLAUDE_CODE_USE_BEDROCK",
    "gcp-vertex": "CLAUDE_CODE_USE_VERTEX",
    "anthropic": "ANTHROPIC_API_KEY",
}


class ClaudeSdkRunner:
    """
    Wraps Claude Agent SDK execution using ClaudeSDKClient.

    Uses ClaudeSDKClient instead of query() because:
    - Session continuity: Required for inline critic (follow-up validation)
    - Custom tools: Supports MCP servers configured in sdkConfig
    - Interrupts: Can stop long-running executions if needed

    Tool configuration comes from sdkConfig.claude in the ExecutionProfile:
    - allowedTools: Claude SDK tools to enable (Read, Edit, Write, etc.)
    - mcpServers: MCP servers configured directly (not Ark MCPServer CRDs)

    Authentication is configured via environment variables at deployment time:
    - ANTHROPIC_API_KEY: Direct Anthropic API access
    - CLAUDE_CODE_USE_BEDROCK=1: AWS Bedrock (uses AWS credentials from environment/IRSA)
    - CLAUDE_CODE_USE_VERTEX=1: Google Vertex AI (uses GCP credentials/workload identity)
    - CLAUDE_CODE_USE_FOUNDRY=1: Azure AI Foundry (uses Azure credentials/managed identity)

    Model Selection:
    The model name comes from the Ark Agent CRD (via Model CRD resolution).
    The Model CRD's spec.config (API keys, base URLs) is NOT used by this executor.
    Only the model name is extracted. Authentication is handled by the deployment.
    """

    def _detect_provider(self) -> str:
        """Detect which authentication provider is configured from environment.

        The Claude SDK reads credentials from environment variables.
        This method detects which provider is configured for logging and validation.

        Returns:
            Provider name: 'azure-foundry', 'aws-bedrock', 'gcp-vertex', 'anthropic', or 'none'
        """
        if os.environ.get("CLAUDE_CODE_USE_FOUNDRY") == "1":
            return "azure-foundry"
        if os.environ.get("CLAUDE_CODE_USE_BEDROCK") == "1":
            return "aws-bedrock"
        if os.environ.get("CLAUDE_CODE_USE_VERTEX") == "1":
            return "gcp-vertex"
        if os.environ.get("ANTHROPIC_API_KEY"):
            return "anthropic"
        return "none"

    def _validate_provider(self) -> str:
        """Validate that an authentication provider is configured.

        Raises:
            RuntimeError: If no provider is configured

        Returns:
            The detected provider name
        """
        provider = self._detect_provider()
        if provider == "none":
            raise RuntimeError(
                "No Claude authentication configured. Set one of:\n"
                "  - ANTHROPIC_API_KEY (direct Anthropic API)\n"
                "  - CLAUDE_CODE_USE_BEDROCK=1 (AWS Bedrock)\n"
                "  - CLAUDE_CODE_USE_VERTEX=1 (Google Vertex AI)\n"
                "  - CLAUDE_CODE_USE_FOUNDRY=1 (Azure AI Foundry)"
            )
        return provider

    async def execute(
        self,
        prompt: str,
        claude_config: ClaudeSdkConfig,
        working_dir: Optional[str],
        max_turns: int,
        system_prompt: Optional[str] = None,
        model_name: Optional[str] = None,
    ) -> Tuple[str, ExecutionTelemetry]:
        """
        Execute Claude Agent SDK with configured tools.

        Authentication is determined by environment variables set at deployment time.
        The model name comes from the Ark Agent CRD (via Model CRD resolution).

        Args:
            prompt: The user prompt to execute
            claude_config: Parsed from sdkConfig.claude (includes tools and MCP servers)
            working_dir: Working directory for file operations
            max_turns: Maximum agent iterations
            system_prompt: Optional system prompt (from Agent.spec.prompt)
            model_name: Model name from Agent CRD (e.g., 'claude-3-5-haiku-latest')

        Returns:
            Tuple of (agent_output, telemetry)

        Raises:
            RuntimeError: If no auth provider configured or execution fails
        """
        telemetry = ExecutionTelemetry()

        if not CLAUDE_SDK_AVAILABLE:
            # Mock execution for testing
            logger.warning("Using mock execution - Claude SDK not available")
            return self._mock_execute(prompt, telemetry)

        # Validate authentication provider is configured
        provider = self._validate_provider()
        logger.info(f"Using {provider} provider")

        # Use provided model or default
        model = claude_config.model or model_name or DEFAULT_MODEL
        options = self._build_options(claude_config, working_dir, max_turns, system_prompt, model)

        result_text = ""

        try:
            # Use ClaudeSDKClient as context manager for proper lifecycle
            async with ClaudeSDKClient(options=options) as client:
                # Send the main prompt
                await client.query(prompt)

                # Process response and capture telemetry
                async for message in client.receive_response():
                    if isinstance(message, ResultMessage):
                        telemetry.total_cost_usd = getattr(message, 'total_cost_usd', None)
                        telemetry.duration_ms = getattr(message, 'duration_ms', None)
                        telemetry.duration_api_ms = getattr(message, 'duration_api_ms', None)
                        telemetry.num_turns = getattr(message, 'num_turns', None)
                        telemetry.session_id = message.session_id
                        telemetry.usage = getattr(message, 'usage', None)

                        if message.subtype == "success":
                            result_text = message.result or ""
                        elif message.subtype == "error_during_execution":
                            raise RuntimeError("Claude SDK execution error")

        except Exception as e:
            self._handle_sdk_exception(e)

        return result_text, telemetry

    def _build_options(
        self,
        claude_config: ClaudeSdkConfig,
        working_dir: Optional[str],
        max_turns: int,
        system_prompt: Optional[str],
        model_name: Optional[str] = None,
    ) -> "ClaudeAgentOptions":
        """Build ClaudeAgentOptions from config."""
        # Build MCP servers config from sdkConfig.claude.mcpServers
        mcp_servers = self._build_mcp_config(claude_config.mcp_servers)

        # Build allowed tools list with MCP wildcards
        allowed_tools = list(claude_config.allowed_tools)
        for server_name in claude_config.mcp_servers.keys():
            allowed_tools.append(f"mcp__{server_name}__*")

        return ClaudeAgentOptions(
            allowed_tools=allowed_tools,
            permission_mode=claude_config.permission_mode,
            setting_sources=claude_config.setting_sources,  # Load CLAUDE.md from repos
            cwd=working_dir,
            max_turns=max_turns,
            model=model_name,
            max_budget_usd=claude_config.max_budget_usd,
            mcp_servers=mcp_servers,
            system_prompt=system_prompt,
        )

    async def execute_with_critic(
        self,
        prompt: str,
        critic_prompt: str,
        claude_config: ClaudeSdkConfig,
        working_dir: Optional[str],
        max_turns: int,
        system_prompt: Optional[str] = None,
        model_name: Optional[str] = None,
    ) -> Tuple[str, str, ExecutionTelemetry]:
        """
        Execute Claude Agent SDK and then continue the conversation for inline critic.

        This uses session continuity - the critic validation runs in the SAME
        conversation context as the main task, so Claude remembers:
        - What files it read
        - What changes it made
        - Its reasoning from the main task

        This is the key advantage of inline critic over subagent critic.

        Authentication is determined by environment variables set at deployment time.
        The model name comes from the Ark Agent CRD (via Model CRD resolution).

        Args:
            prompt: The user prompt to execute
            critic_prompt: Follow-up prompt for validation
            claude_config: Parsed from sdkConfig.claude
            working_dir: Working directory for file operations
            max_turns: Maximum agent iterations
            system_prompt: Optional system prompt
            model_name: Model name from Agent CRD (e.g., 'claude-3-5-haiku-latest')

        Returns:
            Tuple of (agent_output, critic_response, telemetry)

        Raises:
            RuntimeError: If no auth provider configured or execution fails
        """
        telemetry = ExecutionTelemetry()

        if not CLAUDE_SDK_AVAILABLE:
            logger.warning("Using mock execution - Claude SDK not available")
            output, _ = self._mock_execute(prompt, telemetry)
            return output, "APPROVED", telemetry

        # Validate authentication provider is configured
        provider = self._validate_provider()
        logger.info(f"Using {provider} provider")

        # Build options for main task execution
        model = claude_config.model or model_name or DEFAULT_MODEL
        options = self._build_options(claude_config, working_dir, max_turns, system_prompt, model)

        agent_output = ""
        critic_response = ""

        try:
            # ClaudeSDKClient maintains session across multiple query() calls
            async with ClaudeSDKClient(options=options) as client:
                # Phase 1: Execute main task
                logger.info("Executing main task")
                await client.query(prompt)

                async for message in client.receive_response():
                    if isinstance(message, ResultMessage):
                        telemetry.session_id = message.session_id
                        if message.subtype == "success":
                            agent_output = message.result or ""
                        elif message.subtype == "error_during_execution":
                            raise RuntimeError("Claude SDK execution error during main task")

                # Phase 2: Inline critic validation (SAME session - Claude remembers context)
                logger.info("Executing inline critic validation")
                await client.query(critic_prompt)

                async for message in client.receive_response():
                    if isinstance(message, ResultMessage):
                        # Capture final telemetry (includes both phases)
                        telemetry.total_cost_usd = getattr(message, 'total_cost_usd', None)
                        telemetry.duration_ms = getattr(message, 'duration_ms', None)
                        telemetry.duration_api_ms = getattr(message, 'duration_api_ms', None)
                        telemetry.num_turns = getattr(message, 'num_turns', None)
                        telemetry.usage = getattr(message, 'usage', None)

                        if message.subtype == "success":
                            critic_response = message.result or ""
                        elif message.subtype == "error_during_execution":
                            raise RuntimeError("Claude SDK execution error during critic")

        except Exception as e:
            self._handle_sdk_exception(e)

        return agent_output, critic_response, telemetry

    def _handle_sdk_exception(self, e: Exception) -> None:
        """Handle Claude SDK exceptions with proper error messages.
        
        Args:
            e: The exception to handle
            
        Raises:
            RuntimeError: With appropriate error message for the exception type
        """
        # Check for CLI not found using imported exception type if available
        if CLINotFoundError is not None and isinstance(e, CLINotFoundError):
            raise RuntimeError(
                "Claude Code CLI is not installed. "
                "Install with: npm install -g @anthropic-ai/claude-code"
            ) from e
        
        # Check for process errors
        if ProcessError is not None and isinstance(e, ProcessError):
            logger.error(f"Claude SDK process error: {e}")
            raise RuntimeError(f"Claude SDK process failed: {e}") from e
        
        # Fallback: check exception type name for compatibility
        exc_type_name = type(e).__name__
        if exc_type_name == "CLINotFoundError":
            raise RuntimeError(
                "Claude Code CLI is not installed. "
                "Install with: npm install -g @anthropic-ai/claude-code"
            ) from e
        
        # Generic error handling
        logger.error(f"Claude SDK error: {e}")
        raise RuntimeError(f"Claude SDK execution failed: {e}") from e

    def _build_mcp_config(self, mcp_servers: Dict[str, Any]) -> Dict[str, Any]:
        """Convert sdkConfig.claude.mcpServers to SDK format."""
        result = {}
        for name, server in mcp_servers.items():
            if server.command:
                # stdio server
                result[name] = {
                    "command": server.command,
                    "args": server.args,
                    "env": self._resolve_env_vars(server.env),
                }
            elif server.url:
                # HTTP/SSE server
                result[name] = {
                    "type": server.type or "http",
                    "url": server.url,
                    "headers": server.headers,
                }
        return result

    def _resolve_env_vars(self, env: Dict[str, str]) -> Dict[str, str]:
        """Resolve ${VAR} references in environment variables."""
        resolved = {}
        for key, value in env.items():
            if value.startswith("${") and value.endswith("}"):
                var_name = value[2:-1]
                resolved[key] = os.environ.get(var_name, "")
            else:
                resolved[key] = value
        return resolved

    def _mock_execute(self, prompt: str, telemetry: ExecutionTelemetry) -> Tuple[str, ExecutionTelemetry]:
        """Mock execution for testing when SDK is not available."""
        telemetry.session_id = "mock-session"
        telemetry.duration_ms = 100
        telemetry.num_turns = 1
        return f"[Mock response to: {prompt[:50]}...]", telemetry
