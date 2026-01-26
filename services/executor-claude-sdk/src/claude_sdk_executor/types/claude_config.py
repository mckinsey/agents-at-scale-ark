"""Claude SDK-specific configuration parsed from sdkConfig.claude."""

from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any, Union


@dataclass
class MCPServerConfig:
    """MCP server configuration for Claude SDK.
    
    Supports both stdio servers (command + args) and HTTP/SSE servers (url).
    """
    # For stdio servers
    command: Optional[str] = None
    args: List[str] = field(default_factory=list)
    env: Dict[str, str] = field(default_factory=dict)
    # For HTTP/SSE servers
    type: Optional[str] = None  # "http" or "sse"
    url: Optional[str] = None
    headers: Dict[str, str] = field(default_factory=dict)


@dataclass
class ClaudeCriticConfig:
    """Claude-specific critic configuration from sdkConfig.claude.critic."""
    # Regex pattern to match in critic response (e.g., "APPROVED")
    pass_pattern: str = "APPROVED"
    # Tools available during critic phase
    critic_tools: List[str] = field(default_factory=lambda: ["Read", "Glob", "Grep"])


@dataclass
class SubagentConfig:
    """Configuration for a programmatic subagent definition.
    
    Subagents enable parallel task execution, context isolation, and
    specialized agents with restricted tools.
    """
    # Human-readable description of what the subagent does
    description: str
    # System prompt/instructions for the subagent
    prompt: str
    # Tools available to this subagent (subset of parent's tools)
    tools: List[str] = field(default_factory=list)
    # Optional model override for this subagent
    model: Optional[str] = None


@dataclass
class SandboxConfig:
    """Sandbox configuration for secure bash command execution.
    
    Enables network and filesystem restrictions for multi-tenant
    or untrusted content scenarios.
    """
    enabled: bool = False
    # Automatically allow bash commands when sandboxed
    auto_allow_bash_if_sandboxed: bool = True
    # Commands to exclude from sandbox (e.g., ["docker"])
    excluded_commands: List[str] = field(default_factory=list)
    # Network configuration
    allow_local_binding: bool = True


@dataclass
class OutputFormatConfig:
    """Configuration for structured output format.
    
    Enforces output format via JSON Schema validation for
    consistent parseable responses.
    """
    type: str = "json_schema"  # Currently only json_schema supported
    schema: Dict[str, Any] = field(default_factory=dict)


@dataclass
class FileCheckpointingConfig:
    """Configuration for file checkpointing and rollback.
    
    Enables tracking file changes and rewinding to previous states
    for safe experimentation.
    """
    enabled: bool = False
    # Automatically rollback file changes if critic validation fails
    rollback_on_critic_failure: bool = False


@dataclass
class SystemPromptConfig:
    """Configuration for system prompt with preset support.
    
    Allows using Claude Code's full system prompt with custom additions.
    """
    # Preset type: "preset" uses Claude Code's system prompt, "custom" uses raw string
    type: str = "custom"
    # Preset name when type is "preset" (e.g., "claude_code")
    preset: Optional[str] = None
    # Additional instructions to append to the preset
    append: Optional[str] = None
    # Raw system prompt when type is "custom"
    custom: Optional[str] = None


@dataclass
class HookPatternConfig:
    """Configuration for declarative hook patterns.
    
    Enables security policies like blocking dangerous commands or
    auditing file changes via YAML configuration.
    """
    # Pattern to match (e.g., tool name, command pattern)
    pattern: str
    # Action to take: "block", "allow", "audit"
    action: str = "block"
    # Reason message when blocking
    reason: Optional[str] = None


@dataclass
class DeclarativeHooksConfig:
    """Declarative hook configuration for security policies.
    
    Provides built-in hook presets and custom pattern matching.
    """
    # Pre-tool-use patterns (e.g., block dangerous commands)
    pre_tool_use: List[HookPatternConfig] = field(default_factory=list)
    # Post-tool-use patterns (e.g., audit file changes)
    post_tool_use: List[HookPatternConfig] = field(default_factory=list)
    # Built-in security presets to enable
    presets: List[str] = field(default_factory=list)


@dataclass
class ClaudeSdkConfig:
    """Configuration for Claude SDK executor, parsed from sdkConfig.claude.
    
    This is the SDK-specific configuration that tells the executor how to
    configure Claude SDK for this particular execution.
    """

    # Tools to allow (maps to SDK's allowed_tools parameter)
    # Includes "Skill" by default to enable .claude/skills/ loading
    allowed_tools: List[str] = field(default_factory=lambda: ["Read", "Edit", "Write", "Bash", "Glob", "Grep", "Skill"])

    # Permission mode: "default", "acceptEdits", "bypassPermissions", "plan"
    permission_mode: str = "acceptEdits"

    # Setting sources to load (e.g., ["project"] to load CLAUDE.md and Skills)
    setting_sources: List[str] = field(default_factory=lambda: ["project"])

    # MCP servers configured directly (not via Ark MCPServer CRDs)
    mcp_servers: Dict[str, MCPServerConfig] = field(default_factory=dict)

    # Optional model override
    model: Optional[str] = None

    # Fallback model for resilience when primary model fails
    fallback_model: Optional[str] = None

    # Budget limit
    max_budget_usd: Optional[float] = None

    # Additional system prompt suffix (legacy - use system_prompt_config for presets)
    system_prompt_suffix: Optional[str] = None

    # System prompt configuration with preset support
    system_prompt_config: Optional[SystemPromptConfig] = None

    # Claude-specific critic config (regex pattern, critic tools)
    critic: Optional[ClaudeCriticConfig] = None

    # Hooks configuration (typically set programmatically, not from sdkConfig)
    hooks: Optional[Dict[str, Any]] = None

    # Declarative hooks for security policies (parsed from sdkConfig.claude.hooks)
    declarative_hooks: Optional[DeclarativeHooksConfig] = None

    # Subagents for parallel task execution and context isolation
    subagents: Dict[str, SubagentConfig] = field(default_factory=dict)

    # Sandbox configuration for secure bash execution
    sandbox: Optional[SandboxConfig] = None

    # Structured output format configuration
    output_format: Optional[OutputFormatConfig] = None

    # File checkpointing configuration
    file_checkpointing: Optional[FileCheckpointingConfig] = None

    @classmethod
    def from_sdk_config(cls, sdk_config: Optional[Dict[str, Any]]) -> "ClaudeSdkConfig":
        """Parse ClaudeSdkConfig from profile.sdkConfig.
        
        Args:
            sdk_config: The sdkConfig dict from ExecutionProfile, may be None
            
        Returns:
            Parsed ClaudeSdkConfig with defaults for missing fields
        """
        if not sdk_config:
            return cls()

        claude_config = sdk_config.get("claude", {})

        # Parse MCP servers
        mcp_servers: Dict[str, MCPServerConfig] = {}
        for name, server_config in claude_config.get("mcpServers", {}).items():
            mcp_servers[name] = MCPServerConfig(
                command=server_config.get("command"),
                args=server_config.get("args", []),
                env=server_config.get("env", {}),
                type=server_config.get("type"),
                url=server_config.get("url"),
                headers=server_config.get("headers", {}),
            )

        # Parse Claude-specific critic config
        critic_config = None
        if "critic" in claude_config:
            critic_dict = claude_config["critic"]
            critic_config = ClaudeCriticConfig(
                pass_pattern=critic_dict.get("passPattern", "APPROVED"),
                critic_tools=critic_dict.get("criticTools", ["Read", "Glob", "Grep"]),
            )

        # Parse max budget (may be string from CRD)
        max_budget = claude_config.get("maxBudgetUsd")
        if isinstance(max_budget, str):
            try:
                max_budget = float(max_budget)
            except ValueError:
                max_budget = None

        # Parse subagents
        subagents: Dict[str, SubagentConfig] = {}
        for name, agent_config in claude_config.get("subagents", {}).items():
            subagents[name] = SubagentConfig(
                description=agent_config.get("description", ""),
                prompt=agent_config.get("prompt", ""),
                tools=agent_config.get("tools", []),
                model=agent_config.get("model"),
            )

        # Parse sandbox config
        sandbox_config = None
        if "sandbox" in claude_config:
            sandbox_dict = claude_config["sandbox"]
            sandbox_config = SandboxConfig(
                enabled=sandbox_dict.get("enabled", False),
                auto_allow_bash_if_sandboxed=sandbox_dict.get("autoAllowBashIfSandboxed", True),
                excluded_commands=sandbox_dict.get("excludedCommands", []),
                allow_local_binding=sandbox_dict.get("network", {}).get("allowLocalBinding", True),
            )

        # Parse output format
        output_format = None
        if "outputFormat" in claude_config:
            output_dict = claude_config["outputFormat"]
            output_format = OutputFormatConfig(
                type=output_dict.get("type", "json_schema"),
                schema=output_dict.get("schema", {}),
            )

        # Parse file checkpointing config
        file_checkpointing = None
        if "fileCheckpointing" in claude_config:
            fc_dict = claude_config["fileCheckpointing"]
            file_checkpointing = FileCheckpointingConfig(
                enabled=fc_dict.get("enabled", False),
                rollback_on_critic_failure=fc_dict.get("rollbackOnCriticFailure", False),
            )

        # Parse system prompt config
        system_prompt_config = None
        if "systemPrompt" in claude_config:
            sp_dict = claude_config["systemPrompt"]
            if isinstance(sp_dict, dict):
                system_prompt_config = SystemPromptConfig(
                    type=sp_dict.get("type", "custom"),
                    preset=sp_dict.get("preset"),
                    append=sp_dict.get("append"),
                    custom=sp_dict.get("custom"),
                )

        # Parse declarative hooks
        declarative_hooks = None
        if "hooks" in claude_config:
            hooks_dict = claude_config["hooks"]
            pre_tool_use = []
            for pattern_config in hooks_dict.get("preToolUse", []):
                pre_tool_use.append(HookPatternConfig(
                    pattern=pattern_config.get("pattern", ""),
                    action=pattern_config.get("action", "block"),
                    reason=pattern_config.get("reason"),
                ))
            post_tool_use = []
            for pattern_config in hooks_dict.get("postToolUse", []):
                post_tool_use.append(HookPatternConfig(
                    pattern=pattern_config.get("pattern", ""),
                    action=pattern_config.get("action", "audit"),
                    reason=pattern_config.get("reason"),
                ))
            declarative_hooks = DeclarativeHooksConfig(
                pre_tool_use=pre_tool_use,
                post_tool_use=post_tool_use,
                presets=hooks_dict.get("presets", []),
            )

        # Default allowed tools - includes Skill for .claude/skills/ loading
        default_tools = ["Read", "Edit", "Write", "Bash", "Glob", "Grep", "Skill"]
        allowed_tools = claude_config.get("allowedTools", default_tools)

        # Add Task tool automatically if subagents are configured
        if subagents and "Task" not in allowed_tools:
            allowed_tools = list(allowed_tools) + ["Task"]

        return cls(
            allowed_tools=allowed_tools,
            permission_mode=claude_config.get("permissionMode", "acceptEdits"),
            setting_sources=claude_config.get("settingSources", ["project"]),
            mcp_servers=mcp_servers,
            model=claude_config.get("model"),
            fallback_model=claude_config.get("fallbackModel"),
            max_budget_usd=max_budget,
            system_prompt_suffix=claude_config.get("systemPromptSuffix"),
            system_prompt_config=system_prompt_config,
            critic=critic_config,
            declarative_hooks=declarative_hooks,
            subagents=subagents,
            sandbox=sandbox_config,
            output_format=output_format,
            file_checkpointing=file_checkpointing,
        )
