"""Claude SDK execution wrapper using ClaudeSDKClient for session continuity."""

import logging
import os
import re
from typing import Optional, Tuple, Dict, Any, Type, List, Callable

from ..types.claude_config import (
    ClaudeSdkConfig,
    SubagentConfig,
    SandboxConfig,
    OutputFormatConfig,
    FileCheckpointingConfig,
    SystemPromptConfig,
    DeclarativeHooksConfig,
    HookPatternConfig,
)
from ..types.telemetry import ExecutionTelemetry
from ..telemetry import TraceContext, TelemetrySpanManager

logger = logging.getLogger(__name__)

# Try to import Claude SDK - may not be available in all environments
CLAUDE_SDK_AVAILABLE = False
ClaudeSDKClient: Optional[Type] = None
ClaudeAgentOptions: Optional[Type] = None
ResultMessage: Optional[Type] = None
UserMessage: Optional[Type] = None
AgentDefinition: Optional[Type] = None
HookMatcher: Optional[Type] = None
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
    
    # Try to import UserMessage for checkpointing
    try:
        from claude_agent_sdk import UserMessage as _UserMessage
        UserMessage = _UserMessage
    except ImportError:
        pass
    
    # Try to import AgentDefinition for subagents
    try:
        from claude_agent_sdk import AgentDefinition as _AgentDefinition
        AgentDefinition = _AgentDefinition
    except ImportError:
        pass
    
    # Try to import HookMatcher for declarative hooks
    try:
        from claude_agent_sdk import HookMatcher as _HookMatcher
        HookMatcher = _HookMatcher
    except ImportError:
        pass
    
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

def validate_sdk_available() -> None:
    """Validate Claude SDK is available. Call at startup in production.
    
    Raises:
        RuntimeError: If Claude Agent SDK is not installed
    """
    if not CLAUDE_SDK_AVAILABLE:
        raise RuntimeError(
            "Claude Agent SDK is not installed. "
            "Install with: pip install claude-agent-sdk"
        )


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
    The Model CRD's spec.config is used to configure the Claude SDK environment.
    """

    def _prepare_model_env(self, model: Any) -> dict:
        """Validate Model and build environment dict for Claude CLI subprocess.

        This is the ONLY place that reads Model config and builds env vars.
        Called once at the start of execute(). Downstream code trusts the result.

        IMPORTANT: Starts with os.environ to inherit PATH, HOME, etc.
        Then adds/overrides specific vars for Claude SDK.

        Provider detection is based on config keys, not model.type.
        model.type specifies API capability (completions, messages), not provider.

        Args:
            model: The Model object from request.agent.model
                   Expected attributes: type, name, config

        Returns:
            Complete env dict for ClaudeAgentOptions (inherits os.environ)

        Raises:
            ValueError: If model config is invalid or missing required fields
        """
        if not model:
            raise ValueError("Model is required")

        if not model.name:
            raise ValueError("Model name is required")

        env = dict(os.environ)

        env["DISABLE_TELEMETRY"] = "1"
        env["DISABLE_ERROR_REPORTING"] = "1"

        config = model.config or {}
        logger.debug(f"Model config keys: {list(config.keys())}")

        if "anthropic" in config:
            anthropic_config = config["anthropic"]
            api_key = anthropic_config.get("apiKey")
            base_url = anthropic_config.get("baseUrl")

            if not api_key:
                raise ValueError("Model config.anthropic.apiKey is required")

            env["ANTHROPIC_API_KEY"] = api_key
            if base_url:
                env["ANTHROPIC_BASE_URL"] = base_url

        elif "bedrock" in config:
            bedrock_config = config["bedrock"]
            env["CLAUDE_CODE_USE_BEDROCK"] = "1"
            logger.debug(f"Bedrock config: region={bedrock_config.get('region')}, "
                         f"baseUrl={'set' if bedrock_config.get('baseUrl') else 'not set'}, "
                         f"bearerToken={'set' if bedrock_config.get('bearerToken') else 'not set'}, "
                         f"accessKeyId={'set' if bedrock_config.get('accessKeyId') else 'not set'}")

            if bedrock_config.get("region"):
                env["AWS_REGION"] = bedrock_config["region"]

            if bedrock_config.get("bearerToken"):
                env["AWS_BEARER_TOKEN_BEDROCK"] = bedrock_config["bearerToken"]
            elif bedrock_config.get("accessKeyId") and bedrock_config.get("secretAccessKey"):
                env["AWS_ACCESS_KEY_ID"] = bedrock_config["accessKeyId"]
                env["AWS_SECRET_ACCESS_KEY"] = bedrock_config["secretAccessKey"]
                if bedrock_config.get("sessionToken"):
                    env["AWS_SESSION_TOKEN"] = bedrock_config["sessionToken"]

            if bedrock_config.get("baseUrl"):
                env["ANTHROPIC_BEDROCK_BASE_URL"] = bedrock_config["baseUrl"]

        elif "vertex" in config:
            vertex_config = config["vertex"]
            env["CLAUDE_CODE_USE_VERTEX"] = "1"
            if vertex_config.get("project"):
                env["ANTHROPIC_VERTEX_PROJECT_ID"] = vertex_config["project"]
            if vertex_config.get("region"):
                env["CLOUD_ML_REGION"] = vertex_config["region"]

        elif "azure-foundry" in config:
            env["CLAUDE_CODE_USE_FOUNDRY"] = "1"

        else:
            raise ValueError(f"No recognized provider config found. Expected one of: anthropic, bedrock, vertex, azure-foundry. Got: {list(config.keys())}")

        provider_vars = [k for k in env.keys() if any(x in k for x in
            ['ANTHROPIC', 'AWS_', 'CLAUDE_CODE_USE_', 'CLOUD_ML'])]
        logger.debug(f"Provider env vars set: {provider_vars}")

        return env

    async def execute(
        self,
        prompt: str,
        claude_config: ClaudeSdkConfig,
        working_dir: Optional[str],
        max_turns: int,
        system_prompt: Optional[str] = None,
        model: Optional[Any] = None,
        trace_context: Optional[TraceContext] = None,
        telemetry_hooks: Optional[Dict[str, Any]] = None,
        query_id: Optional[str] = None,
        agent_name: Optional[str] = None,
    ) -> Tuple[str, ExecutionTelemetry]:
        """
        Execute Claude Agent SDK with configured tools.

        Authentication is configured via the Model CRD's spec.config.
        The model object comes from the Ark Agent CRD (via Model CRD resolution).

        If output_format is configured with a JSON schema, the telemetry will include
        the structured_output field with the parsed JSON response.

        Args:
            prompt: The user prompt to execute
            claude_config: Parsed from sdkConfig.claude (includes tools and MCP servers)
            working_dir: Working directory for file operations
            max_turns: Maximum agent iterations
            system_prompt: Optional system prompt (from Agent.spec.prompt)
            model: Full Model object from Agent CRD (includes type, name, config)
            trace_context: Optional trace context for distributed tracing
            telemetry_hooks: Optional hooks for tool call tracing
            query_id: Optional query ID for trace correlation
            agent_name: Optional agent name for trace attributes

        Returns:
            Tuple of (agent_output, telemetry)

        Raises:
            RuntimeError: If Claude SDK not installed or execution fails
            ValueError: If model config is invalid
        """
        if not CLAUDE_SDK_AVAILABLE:
            raise RuntimeError(
                "Claude Agent SDK is not installed. "
                "Install with: pip install claude-agent-sdk"
            )

        telemetry = ExecutionTelemetry()

        model_env = self._prepare_model_env(model)
        logger.info(f"Using model {model.name} via {model.type}")

        options = self._build_options(
            claude_config=claude_config,
            working_dir=working_dir,
            max_turns=max_turns,
            system_prompt=system_prompt,
            model_name=model.name,
            model_env=model_env,
            telemetry_hooks=telemetry_hooks,
        )

        result_text = ""

        # Wrap execution in telemetry span manager for trace hierarchy
        with TelemetrySpanManager(trace_context, query_id, agent_name) as span_manager:
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

                            # Capture structured output if output_format was configured
                            structured_output = getattr(message, 'structured_output', None)
                            logger.info(f"ResultMessage: subtype={message.subtype}, structured_output={structured_output is not None}, result_len={len(message.result or '')}")
                            if structured_output:
                                telemetry.structured_output = structured_output
                                logger.info(f"Captured structured output with keys: {list(structured_output.keys()) if isinstance(structured_output, dict) else type(structured_output)}")
                            else:
                                # Log the result to debug why structured output is missing
                                result_preview = (message.result or '')[:500]
                                logger.info(f"No structured_output in ResultMessage. Result preview: {result_preview}")

                            if message.subtype == "success":
                                result_text = message.result or ""
                            elif message.subtype == "error_during_execution":
                                raise RuntimeError("Claude SDK execution error")

                # Record aggregate telemetry on the span (including input/output for Langfuse UI)
                span_manager.record_telemetry(
                    duration_ms=telemetry.duration_ms,
                    num_turns=telemetry.num_turns,
                    total_cost_usd=telemetry.total_cost_usd,
                    input_value=prompt,
                    output_value=result_text,
                )

            except Exception as e:
                self._handle_sdk_exception(e)

        return result_text, telemetry

    def _build_options(
        self,
        claude_config: ClaudeSdkConfig,
        working_dir: Optional[str],
        max_turns: int,
        system_prompt: Optional[str],
        model_name: str,
        model_env: Dict[str, str],
        telemetry_hooks: Optional[Dict[str, Any]] = None,
    ) -> "ClaudeAgentOptions":
        """Build ClaudeAgentOptions from config.

        Args:
            claude_config: Claude SDK configuration
            working_dir: Working directory for file operations
            max_turns: Maximum agent iterations
            system_prompt: System prompt from Agent.spec.prompt
            model_name: Validated model name from Model CRD
            model_env: Pre-validated environment dict from _prepare_model_env()
                       Already inherits os.environ, no need to merge again.
            telemetry_hooks: Optional hooks for tool call tracing
        """
        env = dict(model_env)

        if claude_config.file_checkpointing and claude_config.file_checkpointing.enabled:
            env["CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING"] = "1"

        mcp_servers = self._build_mcp_config(claude_config.mcp_servers)

        allowed_tools = list(claude_config.allowed_tools)
        for server_name in claude_config.mcp_servers.keys():
            allowed_tools.append(f"mcp__{server_name}__*")

        agents = self._build_subagents(claude_config.subagents)
        sandbox = self._build_sandbox_config(claude_config.sandbox)
        output_format = self._build_output_format(claude_config.output_format)

        if output_format:
            logger.info(f"Structured output configured: type={output_format.get('type')}, schema keys={list(output_format.get('schema', {}).get('properties', {}).keys())}")
        else:
            logger.debug("No structured output format configured")

        final_system_prompt = self._build_system_prompt(
            system_prompt, claude_config.system_prompt_config, claude_config.system_prompt_suffix
        )

        declarative_hooks = self._build_declarative_hooks(claude_config.declarative_hooks)
        all_hooks = self._merge_hooks(claude_config.hooks, declarative_hooks)
        hooks = self._merge_hooks(all_hooks, telemetry_hooks)

        extra_args = {}
        if claude_config.file_checkpointing and claude_config.file_checkpointing.enabled:
            extra_args["replay-user-messages"] = None

        options_kwargs: Dict[str, Any] = {
            "allowed_tools": allowed_tools,
            "permission_mode": claude_config.permission_mode,
            "setting_sources": claude_config.setting_sources,
            "cwd": working_dir,
            "max_turns": max_turns,
            "model": model_name,
            "max_budget_usd": claude_config.max_budget_usd,
            "mcp_servers": mcp_servers,
            "system_prompt": final_system_prompt,
            "hooks": hooks if hooks else None,
            "env": env,
        }

        if claude_config.fallback_model:
            options_kwargs["fallback_model"] = claude_config.fallback_model

        if agents:
            options_kwargs["agents"] = agents

        if sandbox:
            options_kwargs["sandbox"] = sandbox

        if output_format:
            options_kwargs["output_format"] = output_format

        if claude_config.file_checkpointing and claude_config.file_checkpointing.enabled:
            options_kwargs["enable_file_checkpointing"] = True
            options_kwargs["extra_args"] = extra_args

        return ClaudeAgentOptions(**options_kwargs)

    def _build_subagents(
        self, subagents: Dict[str, SubagentConfig]
    ) -> Optional[Dict[str, Any]]:
        """Build SDK AgentDefinition dict from SubagentConfig.
        
        Args:
            subagents: Dict of subagent name to SubagentConfig
            
        Returns:
            Dict of subagent name to AgentDefinition, or None if no subagents
        """
        if not subagents or AgentDefinition is None:
            return None

        agents = {}
        for name, config in subagents.items():
            agents[name] = AgentDefinition(
                description=config.description,
                prompt=config.prompt,
                tools=config.tools if config.tools else None,
                model=config.model,
            )
        return agents

    def _build_sandbox_config(
        self, sandbox: Optional[SandboxConfig]
    ) -> Optional[Dict[str, Any]]:
        """Build SDK sandbox configuration dict.
        
        Args:
            sandbox: SandboxConfig or None
            
        Returns:
            SDK sandbox config dict, or None if not configured
        """
        if not sandbox or not sandbox.enabled:
            return None

        return {
            "enabled": True,
            "autoAllowBashIfSandboxed": sandbox.auto_allow_bash_if_sandboxed,
            "excludedCommands": sandbox.excluded_commands,
            "network": {"allowLocalBinding": sandbox.allow_local_binding},
        }

    def _build_output_format(
        self, output_format: Optional[OutputFormatConfig]
    ) -> Optional[Dict[str, Any]]:
        """Build SDK output format configuration.
        
        Args:
            output_format: OutputFormatConfig or None
            
        Returns:
            SDK output format dict, or None if not configured
        """
        if not output_format or not output_format.schema:
            return None

        return {
            "type": output_format.type,
            "schema": output_format.schema,
        }

    def _build_system_prompt(
        self,
        agent_prompt: Optional[str],
        config: Optional[SystemPromptConfig],
        suffix: Optional[str],
    ) -> Any:
        """Build SDK system prompt from configuration.
        
        Supports preset-based prompts with append, or custom prompts.
        
        Args:
            agent_prompt: System prompt from Agent.spec.prompt
            config: SystemPromptConfig or None
            suffix: Legacy system prompt suffix
            
        Returns:
            SDK system prompt (dict for preset, string for custom)
        """
        # If config specifies a preset, use preset format
        if config and config.type == "preset" and config.preset:
            result: Dict[str, Any] = {
                "type": "preset",
                "preset": config.preset,
            }
            # Combine agent prompt and append
            append_parts = []
            if agent_prompt:
                append_parts.append(agent_prompt)
            if config.append:
                append_parts.append(config.append)
            if suffix:
                append_parts.append(suffix)
            if append_parts:
                result["append"] = "\n\n".join(append_parts)
            return result

        # Custom prompt - combine agent prompt and suffix
        if config and config.type == "custom" and config.custom:
            base_prompt = config.custom
        else:
            base_prompt = agent_prompt

        if base_prompt and suffix:
            return f"{base_prompt}\n\n{suffix}"
        return base_prompt or suffix

    def _build_declarative_hooks(
        self, config: Optional[DeclarativeHooksConfig]
    ) -> Optional[Dict[str, Any]]:
        """Build SDK hooks from declarative configuration.
        
        Converts HookPatternConfig to SDK HookMatcher format for
        security policies like blocking dangerous commands.
        
        Args:
            config: DeclarativeHooksConfig or None
            
        Returns:
            SDK hooks dict, or None if not configured
        """
        if not config or HookMatcher is None:
            return None

        hooks: Dict[str, List[Any]] = {}

        # Apply built-in presets first
        for preset in config.presets:
            preset_hooks = self._get_hook_preset(preset)
            for event_name, matchers in preset_hooks.items():
                if event_name not in hooks:
                    hooks[event_name] = []
                hooks[event_name].extend(matchers)

        # Add pre-tool-use patterns
        if config.pre_tool_use:
            if "PreToolUse" not in hooks:
                hooks["PreToolUse"] = []
            for pattern in config.pre_tool_use:
                matcher = self._create_hook_matcher(pattern, "PreToolUse")
                if matcher:
                    hooks["PreToolUse"].append(matcher)

        # Add post-tool-use patterns
        if config.post_tool_use:
            if "PostToolUse" not in hooks:
                hooks["PostToolUse"] = []
            for pattern in config.post_tool_use:
                matcher = self._create_hook_matcher(pattern, "PostToolUse")
                if matcher:
                    hooks["PostToolUse"].append(matcher)

        return hooks if hooks else None

    def _get_hook_preset(self, preset_name: str) -> Dict[str, List[Any]]:
        """Get hook configuration for a named preset.
        
        Available presets:
        - "block-dangerous-commands": Blocks rm -rf, sudo, etc.
        - "audit-file-changes": Logs all file writes
        
        Args:
            preset_name: Name of the preset
            
        Returns:
            Dict of event name to list of HookMatchers
        """
        if HookMatcher is None:
            return {}

        if preset_name == "block-dangerous-commands":
            async def block_dangerous(input_data: Dict, tool_use_id: str, context: Any) -> Dict:
                if input_data.get("tool_name") == "Bash":
                    command = input_data.get("tool_input", {}).get("command", "")
                    dangerous_patterns = [
                        r"\brm\s+-rf\b",
                        r"\bsudo\b",
                        r"\bchmod\s+777\b",
                        r"\b>\s*/dev/sd",
                        r"\bmkfs\b",
                        r"\bdd\s+if=",
                    ]
                    for pattern in dangerous_patterns:
                        if re.search(pattern, command):
                            return {
                                "hookSpecificOutput": {
                                    "hookEventName": "PreToolUse",
                                    "permissionDecision": "deny",
                                    "permissionDecisionReason": f"Blocked dangerous command pattern: {pattern}",
                                }
                            }
                return {}

            return {
                "PreToolUse": [HookMatcher(callback=block_dangerous)]
            }

        if preset_name == "audit-file-changes":
            async def audit_writes(input_data: Dict, tool_use_id: str, context: Any) -> Dict:
                tool_name = input_data.get("tool_name")
                if tool_name in ["Write", "Edit"]:
                    file_path = input_data.get("tool_input", {}).get("file_path", "")
                    logger.info(f"[AUDIT] File change: {tool_name} on {file_path}")
                return {}

            return {
                "PostToolUse": [HookMatcher(callback=audit_writes)]
            }

        logger.warning(f"Unknown hook preset: {preset_name}")
        return {}

    def _create_hook_matcher(
        self, pattern: HookPatternConfig, event_type: str
    ) -> Optional[Any]:
        """Create a HookMatcher from a pattern configuration.
        
        Args:
            pattern: HookPatternConfig with pattern, action, and reason
            event_type: "PreToolUse" or "PostToolUse"
            
        Returns:
            HookMatcher instance, or None if cannot create
        """
        if HookMatcher is None:
            return None

        if event_type == "PreToolUse" and pattern.action == "block":
            async def block_pattern(input_data: Dict, tool_use_id: str, context: Any) -> Dict:
                tool_name = input_data.get("tool_name", "")
                tool_input = input_data.get("tool_input", {})
                
                # Check if pattern matches tool name or input
                match_text = f"{tool_name} {str(tool_input)}"
                if re.search(pattern.pattern, match_text):
                    return {
                        "hookSpecificOutput": {
                            "hookEventName": "PreToolUse",
                            "permissionDecision": "deny",
                            "permissionDecisionReason": pattern.reason or f"Blocked by pattern: {pattern.pattern}",
                        }
                    }
                return {}

            return HookMatcher(callback=block_pattern)

        if event_type == "PostToolUse" and pattern.action == "audit":
            async def audit_pattern(input_data: Dict, tool_use_id: str, context: Any) -> Dict:
                tool_name = input_data.get("tool_name", "")
                tool_input = input_data.get("tool_input", {})
                
                match_text = f"{tool_name} {str(tool_input)}"
                if re.search(pattern.pattern, match_text):
                    logger.info(f"[AUDIT] Pattern matched: {pattern.pattern} on {tool_name}")
                return {}

            return HookMatcher(callback=audit_pattern)

        return None

    def _merge_hooks(
        self,
        profile_hooks: Optional[Dict[str, Any]],
        telemetry_hooks: Optional[Dict[str, Any]],
    ) -> Optional[Dict[str, Any]]:
        """Merge profile hooks with telemetry hooks.
        
        Both hook dicts have the same structure: {event_name: [HookMatcher, ...]}
        Telemetry hooks are added after profile hooks so both run.
        
        Args:
            profile_hooks: Hooks from ExecutionProfile
            telemetry_hooks: Hooks for telemetry tracing
            
        Returns:
            Merged hooks dict, or None if no hooks
        """
        if not profile_hooks and not telemetry_hooks:
            return None
        
        if not profile_hooks:
            return telemetry_hooks
        
        if not telemetry_hooks:
            return profile_hooks
        
        # Merge: for each event, concatenate the hook matchers
        merged = dict(profile_hooks)
        for event_name, matchers in telemetry_hooks.items():
            if event_name in merged:
                # Append telemetry hooks after profile hooks
                merged[event_name] = merged[event_name] + matchers
            else:
                merged[event_name] = matchers
        
        return merged

    async def execute_with_critic(
        self,
        prompt: str,
        critic_prompt: str,
        claude_config: ClaudeSdkConfig,
        working_dir: Optional[str],
        max_turns: int,
        system_prompt: Optional[str] = None,
        model: Optional[Any] = None,
        trace_context: Optional[TraceContext] = None,
        telemetry_hooks: Optional[Dict[str, Any]] = None,
        query_id: Optional[str] = None,
        agent_name: Optional[str] = None,
    ) -> Tuple[str, str, ExecutionTelemetry]:
        """
        Execute Claude Agent SDK and then continue the conversation for inline critic.

        This uses session continuity - the critic validation runs in the SAME
        conversation context as the main task, so Claude remembers:
        - What files it read
        - What changes it made
        - Its reasoning from the main task

        This is the key advantage of inline critic over subagent critic.

        If file checkpointing is enabled with rollbackOnCriticFailure, file changes
        will be automatically reverted when the critic rejects the output.

        Authentication is configured via the Model CRD's spec.config.
        The model object comes from the Ark Agent CRD (via Model CRD resolution).

        Args:
            prompt: The user prompt to execute
            critic_prompt: Follow-up prompt for validation
            claude_config: Parsed from sdkConfig.claude
            working_dir: Working directory for file operations
            max_turns: Maximum agent iterations
            system_prompt: Optional system prompt
            model: Full Model object from Agent CRD (includes type, name, config)
            trace_context: Optional trace context for distributed tracing
            telemetry_hooks: Optional hooks for tool call tracing
            query_id: Optional query ID for trace correlation
            agent_name: Optional agent name for trace attributes

        Returns:
            Tuple of (agent_output, critic_response, telemetry)

        Raises:
            RuntimeError: If Claude SDK not installed or execution fails
            ValueError: If model config is invalid
        """
        if not CLAUDE_SDK_AVAILABLE:
            raise RuntimeError(
                "Claude Agent SDK is not installed. "
                "Install with: pip install claude-agent-sdk"
            )

        telemetry = ExecutionTelemetry()

        model_env = self._prepare_model_env(model)
        logger.info(f"Using model {model.name} via {model.type}")

        options = self._build_options(
            claude_config=claude_config,
            working_dir=working_dir,
            max_turns=max_turns,
            system_prompt=system_prompt,
            model_name=model.name,
            model_env=model_env,
            telemetry_hooks=telemetry_hooks,
        )

        agent_output = ""
        critic_response = ""
        checkpoint_id: Optional[str] = None
        session_id: Optional[str] = None

        # Check if file checkpointing with rollback is enabled
        checkpointing_enabled = (
            claude_config.file_checkpointing
            and claude_config.file_checkpointing.enabled
        )
        rollback_on_failure = (
            checkpointing_enabled
            and claude_config.file_checkpointing.rollback_on_critic_failure
        )

        # Wrap execution in telemetry span manager for trace hierarchy
        with TelemetrySpanManager(trace_context, query_id, agent_name) as span_manager:
            try:
                # ClaudeSDKClient maintains session across multiple query() calls
                async with ClaudeSDKClient(options=options) as client:
                    # Phase 1: Execute main task
                    logger.info("Executing main task")
                    await client.query(prompt)

                    async for message in client.receive_response():
                        # Capture checkpoint ID from UserMessage if checkpointing enabled
                        if checkpointing_enabled and UserMessage is not None:
                            if isinstance(message, UserMessage):
                                checkpoint_id = getattr(message, 'uuid', None)
                                logger.debug(f"Captured checkpoint ID: {checkpoint_id}")

                        if isinstance(message, ResultMessage):
                            telemetry.session_id = message.session_id
                            session_id = message.session_id
                            if message.subtype == "success":
                                agent_output = message.result or ""
                            elif message.subtype == "error_during_execution":
                                raise RuntimeError("Claude SDK execution error during main task")

                    # Phase 2: Inline critic validation (SAME session - Claude remembers context)
                    logger.info("Executing inline critic validation")
                    await client.query(critic_prompt)

                    critic_passed = False
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
                                # Check if critic approved
                                pass_pattern = "APPROVED"
                                if claude_config.critic:
                                    pass_pattern = claude_config.critic.pass_pattern
                                critic_passed = bool(
                                    re.search(pass_pattern, critic_response, re.IGNORECASE)
                                )
                            elif message.subtype == "error_during_execution":
                                raise RuntimeError("Claude SDK execution error during critic")

                    # Phase 3: Rollback on critic failure if configured
                    if rollback_on_failure and not critic_passed and checkpoint_id:
                        logger.info(f"Critic rejected - rolling back files to checkpoint {checkpoint_id}")
                        await self._rewind_files(client, checkpoint_id)

                # Record aggregate telemetry on the span (including input/output for Langfuse UI)
                span_manager.record_telemetry(
                    duration_ms=telemetry.duration_ms,
                    num_turns=telemetry.num_turns,
                    total_cost_usd=telemetry.total_cost_usd,
                    input_value=prompt,
                    output_value=agent_output,
                )

            except Exception as e:
                self._handle_sdk_exception(e)

        return agent_output, critic_response, telemetry

    async def _rewind_files(self, client: Any, checkpoint_id: str) -> None:
        """Rewind files to a previous checkpoint.
        
        Uses the SDK's file checkpointing feature to restore files to their
        state before agent modifications.
        
        Args:
            client: ClaudeSDKClient instance with active session
            checkpoint_id: UUID of the checkpoint to restore
        """
        try:
            if hasattr(client, 'rewind_files'):
                await client.rewind_files(checkpoint_id)
                logger.info(f"Successfully rewound files to checkpoint {checkpoint_id}")
            else:
                logger.warning("rewind_files method not available on client")
        except Exception as e:
            logger.error(f"Failed to rewind files: {e}")

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
