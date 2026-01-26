"""Tests for types module."""

import pytest
from claude_sdk_executor.types.claude_config import ClaudeSdkConfig, MCPServerConfig, ClaudeCriticConfig
from claude_sdk_executor.types.telemetry import ExecutionTelemetry


class TestClaudeSdkConfig:
    """Tests for ClaudeSdkConfig."""

    def test_default_config(self):
        """Test default configuration values."""
        config = ClaudeSdkConfig()
        
        # Default includes Skill for .claude/skills/ loading
        assert config.allowed_tools == ["Read", "Edit", "Write", "Bash", "Glob", "Grep", "Skill"]
        assert config.permission_mode == "acceptEdits"
        assert config.setting_sources == ["project"]
        assert config.mcp_servers == {}
        assert config.model is None
        assert config.max_budget_usd is None
        assert config.fallback_model is None
        assert config.subagents == {}
        assert config.sandbox is None
        assert config.output_format is None
        assert config.file_checkpointing is None

    def test_from_sdk_config_empty(self):
        """Test parsing from empty sdkConfig."""
        config = ClaudeSdkConfig.from_sdk_config(None)
        
        # Default includes Skill for .claude/skills/ loading
        assert config.allowed_tools == ["Read", "Edit", "Write", "Bash", "Glob", "Grep", "Skill"]
        assert config.permission_mode == "acceptEdits"

    def test_from_sdk_config_with_claude_section(self):
        """Test parsing from sdkConfig with claude section."""
        sdk_config = {
            "claude": {
                "allowedTools": ["Read", "Glob"],
                "permissionMode": "bypassPermissions",
                "settingSources": [],
                "model": "claude-3-opus",
                "maxBudgetUsd": "5.00",
            }
        }
        
        config = ClaudeSdkConfig.from_sdk_config(sdk_config)
        
        assert config.allowed_tools == ["Read", "Glob"]
        assert config.permission_mode == "bypassPermissions"
        assert config.setting_sources == []
        assert config.model == "claude-3-opus"
        assert config.max_budget_usd == 5.0

    def test_from_sdk_config_with_mcp_servers(self):
        """Test parsing MCP servers from sdkConfig."""
        sdk_config = {
            "claude": {
                "mcpServers": {
                    "github": {
                        "command": "npx",
                        "args": ["-y", "@modelcontextprotocol/server-github"],
                        "env": {"GITHUB_TOKEN": "${GITHUB_TOKEN}"},
                    },
                    "postgres": {
                        "type": "http",
                        "url": "https://mcp.example.com/postgres",
                    },
                }
            }
        }
        
        config = ClaudeSdkConfig.from_sdk_config(sdk_config)
        
        assert "github" in config.mcp_servers
        assert config.mcp_servers["github"].command == "npx"
        assert config.mcp_servers["github"].args == ["-y", "@modelcontextprotocol/server-github"]
        
        assert "postgres" in config.mcp_servers
        assert config.mcp_servers["postgres"].type == "http"
        assert config.mcp_servers["postgres"].url == "https://mcp.example.com/postgres"

    def test_from_sdk_config_with_critic(self):
        """Test parsing critic config from sdkConfig."""
        sdk_config = {
            "claude": {
                "critic": {
                    "passPattern": "LGTM",
                    "criticTools": ["Read", "Grep"],
                }
            }
        }
        
        config = ClaudeSdkConfig.from_sdk_config(sdk_config)
        
        assert config.critic is not None
        assert config.critic.pass_pattern == "LGTM"
        assert config.critic.critic_tools == ["Read", "Grep"]

    def test_from_sdk_config_with_subagents(self):
        """Test parsing subagents from sdkConfig."""
        sdk_config = {
            "claude": {
                "subagents": {
                    "code-reviewer": {
                        "description": "Reviews code quality",
                        "prompt": "You are a code reviewer.",
                        "tools": ["Read", "Grep"],
                        "model": "claude-haiku",
                    },
                    "test-writer": {
                        "description": "Writes tests",
                        "prompt": "You are a test writer.",
                        "tools": ["Read", "Write"],
                    },
                }
            }
        }
        
        config = ClaudeSdkConfig.from_sdk_config(sdk_config)
        
        assert "code-reviewer" in config.subagents
        assert config.subagents["code-reviewer"].description == "Reviews code quality"
        assert config.subagents["code-reviewer"].prompt == "You are a code reviewer."
        assert config.subagents["code-reviewer"].tools == ["Read", "Grep"]
        assert config.subagents["code-reviewer"].model == "claude-haiku"
        
        assert "test-writer" in config.subagents
        assert config.subagents["test-writer"].model is None  # Not specified
        
        # Task tool should be added when subagents configured
        assert "Task" in config.allowed_tools

    def test_from_sdk_config_with_structured_output(self):
        """Test parsing structured output format from sdkConfig."""
        sdk_config = {
            "claude": {
                "outputFormat": {
                    "type": "json_schema",
                    "schema": {
                        "type": "object",
                        "properties": {
                            "summary": {"type": "string"},
                        },
                    },
                }
            }
        }
        
        config = ClaudeSdkConfig.from_sdk_config(sdk_config)
        
        assert config.output_format is not None
        assert config.output_format.type == "json_schema"
        assert "properties" in config.output_format.schema

    def test_from_sdk_config_with_file_checkpointing(self):
        """Test parsing file checkpointing config from sdkConfig."""
        sdk_config = {
            "claude": {
                "fileCheckpointing": {
                    "enabled": True,
                    "rollbackOnCriticFailure": True,
                }
            }
        }
        
        config = ClaudeSdkConfig.from_sdk_config(sdk_config)
        
        assert config.file_checkpointing is not None
        assert config.file_checkpointing.enabled is True
        assert config.file_checkpointing.rollback_on_critic_failure is True

    def test_from_sdk_config_with_sandbox(self):
        """Test parsing sandbox config from sdkConfig."""
        sdk_config = {
            "claude": {
                "sandbox": {
                    "enabled": True,
                    "autoAllowBashIfSandboxed": False,
                    "excludedCommands": ["docker", "kubectl"],
                    "network": {"allowLocalBinding": False},
                }
            }
        }
        
        config = ClaudeSdkConfig.from_sdk_config(sdk_config)
        
        assert config.sandbox is not None
        assert config.sandbox.enabled is True
        assert config.sandbox.auto_allow_bash_if_sandboxed is False
        assert config.sandbox.excluded_commands == ["docker", "kubectl"]
        assert config.sandbox.allow_local_binding is False

    def test_from_sdk_config_with_system_prompt_preset(self):
        """Test parsing system prompt preset from sdkConfig."""
        sdk_config = {
            "claude": {
                "systemPrompt": {
                    "type": "preset",
                    "preset": "claude_code",
                    "append": "Custom instructions",
                }
            }
        }
        
        config = ClaudeSdkConfig.from_sdk_config(sdk_config)
        
        assert config.system_prompt_config is not None
        assert config.system_prompt_config.type == "preset"
        assert config.system_prompt_config.preset == "claude_code"
        assert config.system_prompt_config.append == "Custom instructions"

    def test_from_sdk_config_with_fallback_model(self):
        """Test parsing fallback model from sdkConfig."""
        sdk_config = {
            "claude": {
                "model": "claude-sonnet",
                "fallbackModel": "claude-haiku",
            }
        }
        
        config = ClaudeSdkConfig.from_sdk_config(sdk_config)
        
        assert config.model == "claude-sonnet"
        assert config.fallback_model == "claude-haiku"

    def test_from_sdk_config_with_declarative_hooks(self):
        """Test parsing declarative hooks from sdkConfig."""
        sdk_config = {
            "claude": {
                "hooks": {
                    "presets": ["block-dangerous-commands"],
                    "preToolUse": [
                        {"pattern": r"\.env$", "action": "block", "reason": "No .env"},
                    ],
                    "postToolUse": [
                        {"pattern": "Write", "action": "audit"},
                    ],
                }
            }
        }
        
        config = ClaudeSdkConfig.from_sdk_config(sdk_config)
        
        assert config.declarative_hooks is not None
        assert "block-dangerous-commands" in config.declarative_hooks.presets
        assert len(config.declarative_hooks.pre_tool_use) == 1
        assert config.declarative_hooks.pre_tool_use[0].pattern == r"\.env$"
        assert config.declarative_hooks.pre_tool_use[0].action == "block"
        assert len(config.declarative_hooks.post_tool_use) == 1


class TestExecutionTelemetry:
    """Tests for ExecutionTelemetry."""

    def test_default_values(self):
        """Test default telemetry values."""
        telemetry = ExecutionTelemetry()
        
        assert telemetry.session_id is None
        assert telemetry.duration_ms is None
        assert telemetry.num_turns is None
        assert telemetry.is_error is False

    def test_merge_telemetry(self):
        """Test merging telemetry instances."""
        base = ExecutionTelemetry(
            session_id="session-1",
            duration_ms=100,
            num_turns=5,
            total_cost_usd=0.01,
        )
        
        other = ExecutionTelemetry(
            session_id="session-2",
            duration_ms=50,
            num_turns=3,
            total_cost_usd=0.005,
        )
        
        base.merge(other)
        
        assert base.session_id == "session-2"  # Takes latest
        assert base.duration_ms == 150  # Adds up
        assert base.num_turns == 8  # Adds up
        assert base.total_cost_usd == 0.015  # Adds up

    def test_merge_with_error(self):
        """Test merging telemetry with error."""
        base = ExecutionTelemetry()
        other = ExecutionTelemetry(is_error=True, error_message="Failed")
        
        base.merge(other)
        
        assert base.is_error is True
        assert base.error_message == "Failed"

    def test_to_dict(self):
        """Test converting telemetry to dictionary."""
        telemetry = ExecutionTelemetry(
            session_id="test-session",
            duration_ms=100,
            num_turns=5,
        )
        
        result = telemetry.to_dict()
        
        assert result["session_id"] == "test-session"
        assert result["duration_ms"] == 100
        assert result["num_turns"] == 5
