"""Tests for types module."""

import pytest
from claude_sdk_executor.types.claude_config import ClaudeSdkConfig, MCPServerConfig, ClaudeCriticConfig
from claude_sdk_executor.types.telemetry import ExecutionTelemetry


class TestClaudeSdkConfig:
    """Tests for ClaudeSdkConfig."""

    def test_default_config(self):
        """Test default configuration values."""
        config = ClaudeSdkConfig()
        
        assert config.allowed_tools == ["Read", "Edit", "Write", "Bash", "Glob", "Grep"]
        assert config.permission_mode == "acceptEdits"
        assert config.setting_sources == ["project"]
        assert config.mcp_servers == {}
        assert config.model is None
        assert config.max_budget_usd is None

    def test_from_sdk_config_empty(self):
        """Test parsing from empty sdkConfig."""
        config = ClaudeSdkConfig.from_sdk_config(None)
        
        assert config.allowed_tools == ["Read", "Edit", "Write", "Bash", "Glob", "Grep"]
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
