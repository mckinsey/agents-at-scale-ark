"""Tests for hooks module."""

import pytest
from claude_sdk_executor.hooks.base import Hook, HookParams, HookResult
from claude_sdk_executor.hooks.registry import HookRegistry, get_registry


class TestHookParams:
    """Tests for HookParams."""

    def test_create_params(self):
        """Test creating hook parameters."""
        params = HookParams(
            raw_params={"depth": "{{.Depth}}"},
            resolved_params={"depth": "1"},
        )
        
        assert params.raw_params["depth"] == "{{.Depth}}"
        assert params.resolved_params["depth"] == "1"

    def test_default_params(self):
        """Test default empty parameters."""
        params = HookParams()
        
        assert params.raw_params == {}
        assert params.resolved_params == {}


class TestHookResult:
    """Tests for HookResult."""

    def test_success_result(self):
        """Test creating a success result."""
        result = HookResult(
            success=True,
            output="Cloned repo successfully",
            metadata={"repo": "example/repo"}
        )
        
        assert result.success is True
        assert result.output == "Cloned repo successfully"
        assert result.error is None
        assert result.metadata["repo"] == "example/repo"

    def test_failure_result(self):
        """Test creating a failure result."""
        result = HookResult(
            success=False,
            error="Repository not found",
        )
        
        assert result.success is False
        assert result.error == "Repository not found"


class TestHookRegistry:
    """Tests for HookRegistry."""

    def test_get_global_registry(self):
        """Test getting the global registry."""
        registry = get_registry()
        
        assert registry is not None
        # Should have registered hooks
        actions = registry.list_actions()
        assert "git_clone" in actions
        assert "git_commit" in actions
        assert "pr_create" in actions

    def test_get_hook_by_action(self):
        """Test getting a hook by action name."""
        registry = get_registry()
        
        hook = registry.get("git_clone")
        assert hook is not None
        assert hook.action_name == "git_clone"

    def test_get_nonexistent_hook(self):
        """Test getting a nonexistent hook returns None."""
        registry = get_registry()
        
        hook = registry.get("nonexistent_action")
        assert hook is None

    def test_list_actions(self):
        """Test listing all registered actions."""
        registry = get_registry()
        actions = registry.list_actions()
        
        # Should have git, github, and jira hooks
        assert len(actions) >= 9  # At least 9 hooks registered
        
        # Git hooks
        assert "git_clone" in actions
        assert "git_create_branch" in actions
        assert "git_checkout" in actions
        assert "git_commit" in actions
        assert "git_push" in actions
        assert "git_fetch" in actions
        
        # GitHub hooks
        assert "pr_create" in actions
        assert "pr_comment" in actions
        assert "pr_submit_review" in actions
        
        # Jira hooks
        assert "jira_comment" in actions
