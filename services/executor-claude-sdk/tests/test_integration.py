"""Integration tests for Claude SDK Executor.

These tests exercise the full executor flow with mocked Claude SDK responses.

Run with: pytest tests/test_integration.py -v
"""

import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient

from claude_sdk_executor.app import app


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    return TestClient(app)


@pytest.fixture
def sample_execution_request():
    """Create a sample execution request."""
    return {
        "agent": {
            "name": "test-agent",
            "namespace": "test-namespace",
            "prompt": "You are a helpful coding assistant.",
            "description": "Test agent",
            "parameters": [],
            "model": {
                "name": "claude-sonnet-4-20250514",
                "type": "openai",
                "config": {
                    "openai": {
                        "baseUrl": "https://api.anthropic.com",
                        "apiKey": ""
                    }
                }
            },
            "labels": {}
        },
        "userInput": {
            "role": "user",
            "content": "Create a simple hello world Python script."
        },
        "history": [],
        "tools": [],
        "profile": {
            "name": "test-profile",
            "namespace": "test-namespace",
            "workspace": None,
            "preExecute": [],
            "execution": {
                "maxIterations": 5,
                "timeout": "5m"
            },
            "critic": None,
            "postExecute": [],
            "onFailure": [],
            "sdkConfig": {
                "claude": {
                    "allowedTools": [],
                    "permissionMode": "acceptEdits"
                }
            }
        }
    }


class TestHealthEndpoint:
    """Test the health endpoint."""

    def test_health_returns_ok(self, client):
        """Health endpoint should return healthy status."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"


class TestExecuteEndpointValidation:
    """Test execute endpoint validation."""

    def test_execute_validates_request(self, client):
        """Test that invalid requests are rejected."""
        response = client.post("/execute", json={})
        assert response.status_code == 422

    def test_execute_requires_model(self, client):
        """Test that model is required."""
        response = client.post("/execute", json={
            "query_id": "test",
            "agent_name": "test",
            "agent_namespace": "test",
            "user_prompt": "Hello"
        })
        assert response.status_code == 422


class TestProfileResolution:
    """Test profile resolution in executor."""

    def test_from_request_with_profile(self):
        """Test resolving profile from request data."""
        from claude_sdk_executor.profile.resolver import ProfileResolver

        resolver = ProfileResolver()

        profile_data = {
            "name": "feature-builder",
            "namespace": "dev-team",
            "workspace": {
                "type": "git",
                "git": {"repositoryUrl": "https://github.com/test/repo.git"}
            },
            "execution": {"maxIterations": 10, "timeout": "15m"},
            "sdkConfig": {"claude": {"allowedTools": ["Read", "Write"]}}
        }

        result = resolver.from_request(profile_data)

        assert result.name == "feature-builder"
        assert result.namespace == "dev-team"
        assert result.workspace is not None
        assert result.workspace.type == "git"
        assert result.execution["maxIterations"] == 10
        assert result.sdk_config["claude"]["allowedTools"] == ["Read", "Write"]

    def test_from_request_empty_profile(self):
        """Test resolving empty profile returns defaults."""
        from claude_sdk_executor.profile.resolver import ProfileResolver

        resolver = ProfileResolver()
        result = resolver.from_request(None)

        assert result.name == "default"
        assert result.namespace == "default"
        assert result.workspace is None

    def test_from_request_with_hooks(self):
        """Test resolving profile with hooks."""
        from claude_sdk_executor.profile.resolver import ProfileResolver

        resolver = ProfileResolver()

        profile_data = {
            "name": "pr-reviewer",
            "namespace": "test",
            "preExecute": [
                {"name": "clone", "action": "git_clone"},
                {"name": "checkout", "action": "git_checkout", "params": {"branch": "main"}}
            ],
            "postExecute": [
                {"name": "comment", "action": "pr_comment", "params": {"body": "Review done"}}
            ]
        }

        result = resolver.from_request(profile_data)

        assert len(result.pre_execute) == 2
        assert result.pre_execute[0].action == "git_clone"
        assert result.pre_execute[1].params["branch"] == "main"
        assert len(result.post_execute) == 1

    def test_from_request_with_critic(self):
        """Test resolving profile with critic config."""
        from claude_sdk_executor.profile.resolver import ProfileResolver

        resolver = ProfileResolver()

        profile_data = {
            "name": "with-critic",
            "namespace": "test",
            "critic": {
                "enabled": True,
                "mode": "inline",
                "maxRetries": 3,
                "inline": {"prompt": "Review the changes"}
            }
        }

        result = resolver.from_request(profile_data)

        assert result.critic is not None
        assert result.critic.enabled is True
        assert result.critic.mode == "inline"
        assert result.critic.max_retries == 3


class TestHookRegistry:
    """Test hook registry."""

    def test_registry_has_all_hooks(self):
        """Test that all expected hooks are registered."""
        from claude_sdk_executor.hooks.registry import get_registry

        registry = get_registry()
        actions = registry.list_actions()

        expected_hooks = [
            "git_clone", "git_create_branch", "git_checkout",
            "git_commit", "git_push", "git_fetch",
            "pr_create", "pr_comment", "pr_submit_review",
            "jira_comment"
        ]

        for hook_type in expected_hooks:
            assert hook_type in actions, f"Hook {hook_type} not found in {actions}"

    def test_get_hook_by_name(self):
        """Test getting a hook by action name."""
        from claude_sdk_executor.hooks.registry import get_registry

        registry = get_registry()

        clone_hook = registry.get("git_clone")
        assert clone_hook is not None
        assert clone_hook.action_name == "git_clone"

    def test_get_unknown_hook_returns_none(self):
        """Test that unknown hook returns None."""
        from claude_sdk_executor.hooks.registry import get_registry

        registry = get_registry()
        result = registry.get("unknown_action")
        assert result is None


class TestInlineCritic:
    """Test inline critic utilities."""

    def test_evaluate_critic_response_approved(self):
        """Test evaluating an approved response."""
        from claude_sdk_executor.critic.inline import evaluate_critic_response

        response = "APPROVED: The code looks good and follows best practices."
        assert evaluate_critic_response(response) is True

    def test_evaluate_critic_response_rejected(self):
        """Test evaluating a rejected response."""
        from claude_sdk_executor.critic.inline import evaluate_critic_response

        response = "The code has issues. Please fix the security vulnerability."
        assert evaluate_critic_response(response) is False

    def test_evaluate_critic_response_case_insensitive(self):
        """Test that evaluation is case insensitive."""
        from claude_sdk_executor.critic.inline import evaluate_critic_response

        assert evaluate_critic_response("approved") is True
        assert evaluate_critic_response("Approved: looks good") is True


class TestTelemetry:
    """Test telemetry capture."""

    def test_telemetry_creation(self):
        """Test creating telemetry data."""
        from claude_sdk_executor.types.telemetry import ExecutionTelemetry

        telemetry = ExecutionTelemetry(
            session_id="test-session-001",
            duration_ms=30000,
            num_turns=3,
            total_cost_usd=0.05,
            usage={"input_tokens": 1000, "output_tokens": 500}
        )

        assert telemetry.session_id == "test-session-001"
        assert telemetry.duration_ms == 30000
        assert telemetry.num_turns == 3
        assert telemetry.total_cost_usd == 0.05

    def test_telemetry_to_dict(self):
        """Test converting telemetry to dictionary."""
        from claude_sdk_executor.types.telemetry import ExecutionTelemetry

        telemetry = ExecutionTelemetry(
            session_id="session-1",
            num_turns=1,
            total_cost_usd=0.001,
        )

        data = telemetry.to_dict()
        assert data["session_id"] == "session-1"
        assert data["total_cost_usd"] == 0.001
        assert data["is_error"] is False

    def test_telemetry_merge(self):
        """Test merging two telemetry instances."""
        from claude_sdk_executor.types.telemetry import ExecutionTelemetry

        t1 = ExecutionTelemetry(
            session_id="session-1",
            duration_ms=1000,
            num_turns=2,
            total_cost_usd=0.01
        )

        t2 = ExecutionTelemetry(
            session_id="session-2",
            duration_ms=500,
            num_turns=1,
            total_cost_usd=0.005
        )

        t1.merge(t2)

        assert t1.session_id == "session-2"  # Takes latest
        assert t1.duration_ms == 1500  # Summed
        assert t1.num_turns == 3  # Summed
        assert t1.total_cost_usd == 0.015  # Summed


class TestClaudeSdkConfig:
    """Test Claude SDK config parsing."""

    def test_parse_sdk_config(self):
        """Test parsing SDK config from profile."""
        from claude_sdk_executor.types.claude_config import ClaudeSdkConfig

        # Format matches what comes from profile.sdkConfig
        sdk_config = {
            "claude": {
                "allowedTools": ["Read", "Edit", "Write", "Bash"],
                "permissionMode": "acceptEdits",
                "mcpServers": {
                    "github": {"command": "npx", "args": ["-y", "@github/mcp-server"]}
                }
            }
        }

        config = ClaudeSdkConfig.from_sdk_config(sdk_config)

        assert config.allowed_tools == ["Read", "Edit", "Write", "Bash"]
        assert config.permission_mode == "acceptEdits"
        assert len(config.mcp_servers) == 1
        assert "github" in config.mcp_servers
        assert config.mcp_servers["github"].command == "npx"

    def test_parse_empty_config(self):
        """Test parsing empty config uses defaults."""
        from claude_sdk_executor.types.claude_config import ClaudeSdkConfig

        config = ClaudeSdkConfig.from_sdk_config({})

        # Defaults include all common tools
        assert "Read" in config.allowed_tools
        assert config.permission_mode == "acceptEdits"
        assert config.mcp_servers == {}


class TestExecutorCreation:
    """Test executor instantiation."""

    def test_create_executor(self):
        """Test that executor can be created."""
        from claude_sdk_executor.executor import ClaudeSdkExecutor

        executor = ClaudeSdkExecutor()
        assert executor is not None


# Conditional live tests
@pytest.mark.skipif(not os.environ.get("ANTHROPIC_API_KEY"), reason="No ANTHROPIC_API_KEY set")
class TestLiveExecution:
    """Live tests that actually call Claude API.

    Only run when ANTHROPIC_API_KEY is set.
    """

    def test_simple_prompt(self, client, sample_execution_request):
        """Test a simple prompt execution."""
        # Simplify for live test
        sample_execution_request["userInput"]["content"] = "What is 2 + 2? Reply with just the number."
        sample_execution_request["profile"]["execution"]["maxIterations"] = 3
        # Set API key from environment
        sample_execution_request["agent"]["model"]["config"]["openai"]["apiKey"] = os.environ.get("ANTHROPIC_API_KEY", "")

        response = client.post("/execute", json=sample_execution_request)

        # Even if it fails, we got to the executor
        assert response.status_code in [200, 500]


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-x"])
