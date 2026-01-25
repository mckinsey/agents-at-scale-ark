"""Claude SDK-specific configuration parsed from sdkConfig.claude."""

from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any


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
class ClaudeSdkConfig:
    """Configuration for Claude SDK executor, parsed from sdkConfig.claude.
    
    This is the SDK-specific configuration that tells the executor how to
    configure Claude SDK for this particular execution.
    """

    # Tools to allow (maps to SDK's allowed_tools parameter)
    allowed_tools: List[str] = field(default_factory=lambda: ["Read", "Edit", "Write", "Bash", "Glob", "Grep"])

    # Permission mode: "default", "acceptEdits", "bypassPermissions", "plan"
    permission_mode: str = "acceptEdits"

    # Setting sources to load (e.g., ["project"] to load CLAUDE.md from repos)
    setting_sources: List[str] = field(default_factory=lambda: ["project"])

    # MCP servers configured directly (not via Ark MCPServer CRDs)
    mcp_servers: Dict[str, MCPServerConfig] = field(default_factory=dict)

    # Optional model override
    model: Optional[str] = None

    # Budget limit
    max_budget_usd: Optional[float] = None

    # Additional system prompt suffix
    system_prompt_suffix: Optional[str] = None

    # Claude-specific critic config (regex pattern, critic tools)
    critic: Optional[ClaudeCriticConfig] = None

    # Hooks configuration (typically set programmatically, not from sdkConfig)
    hooks: Optional[Dict[str, Any]] = None

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

        return cls(
            allowed_tools=claude_config.get("allowedTools", ["Read", "Edit", "Write", "Bash", "Glob", "Grep"]),
            permission_mode=claude_config.get("permissionMode", "acceptEdits"),
            setting_sources=claude_config.get("settingSources", ["project"]),
            mcp_servers=mcp_servers,
            model=claude_config.get("model"),
            max_budget_usd=max_budget,
            system_prompt_suffix=claude_config.get("systemPromptSuffix"),
            critic=critic_config,
        )
