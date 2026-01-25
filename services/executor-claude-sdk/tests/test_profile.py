"""Tests for profile module."""

import pytest
from claude_sdk_executor.profile.resolver import ProfileResolver, ResolvedProfile
from claude_sdk_executor.profile.templates import TemplateContext


class TestProfileResolver:
    """Tests for ProfileResolver."""

    def test_resolve_empty_profile(self):
        """Test resolving empty/None profile."""
        resolver = ProfileResolver()
        profile = resolver.from_request(None)
        
        assert profile.name == "default"
        assert profile.namespace == "default"
        assert profile.workspace is None
        assert profile.pre_execute == []
        assert profile.post_execute == []

    def test_resolve_full_profile(self):
        """Test resolving a complete profile."""
        profile_data = {
            "name": "feature-builder",
            "namespace": "my-team",
            "workspace": {
                "type": "git",
                "git": {
                    "defaultBranch": "main",
                    "branchPrefix": "agent/feature/",
                },
            },
            "preExecute": [
                {"name": "clone", "action": "git_clone", "params": {"depth": "1"}},
                {"name": "branch", "action": "git_create_branch"},
            ],
            "execution": {
                "maxIterations": 25,
                "timeout": "30m",
            },
            "critic": {
                "enabled": True,
                "mode": "inline",
                "maxRetries": 2,
                "inline": {
                    "prompt": "Review the changes...",
                    "passCondition": "{{.CriticApproved}}",
                },
            },
            "postExecute": [
                {"name": "commit", "action": "git_commit", "condition": "{{.HasChanges}}"},
            ],
            "sdkConfig": {
                "claude": {
                    "allowedTools": ["Read", "Edit", "Write"],
                }
            },
        }
        
        resolver = ProfileResolver()
        profile = resolver.from_request(profile_data)
        
        assert profile.name == "feature-builder"
        assert profile.namespace == "my-team"
        assert profile.workspace.type == "git"
        assert len(profile.pre_execute) == 2
        assert profile.pre_execute[0].action == "git_clone"
        assert profile.pre_execute[0].params == {"depth": "1"}
        assert profile.critic.enabled is True
        assert profile.critic.mode == "inline"
        assert profile.critic.max_retries == 2
        assert len(profile.post_execute) == 1
        assert profile.post_execute[0].condition == "{{.HasChanges}}"
        assert profile.sdk_config["claude"]["allowedTools"] == ["Read", "Edit", "Write"]


class TestTemplateContext:
    """Tests for TemplateContext."""

    def test_get_and_set(self):
        """Test getting and setting variables."""
        ctx = TemplateContext()
        
        ctx.set("Foo", "bar")
        assert ctx.get("Foo") == "bar"
        assert ctx.get("Missing", "default") == "default"

    def test_resolve_go_style_template(self):
        """Test resolving Go-style {{.VarName}} templates."""
        ctx = TemplateContext()
        ctx.set("BranchPrefix", "agent/feature/")
        ctx.set("QueryID", "abc123")
        
        result = ctx.resolve("{{.BranchPrefix}}{{.QueryID}}")
        
        assert result == "agent/feature/abc123"

    def test_resolve_jinja_style_template(self):
        """Test resolving Jinja-style {{ VarName }} templates."""
        ctx = TemplateContext()
        ctx.set("TaskSummary", "Add user auth")
        
        result = ctx.resolve("feat: {{ TaskSummary }}")
        
        assert result == "feat: Add user auth"

    def test_evaluate_condition_true(self):
        """Test evaluating true conditions."""
        ctx = TemplateContext()
        ctx.set("HasChanges", True)
        
        assert ctx.evaluate_condition("{{.HasChanges}}") is True
        assert ctx.evaluate_condition("true") is True
        assert ctx.evaluate_condition("") is True  # Empty = always run

    def test_evaluate_condition_false(self):
        """Test evaluating false conditions."""
        ctx = TemplateContext()
        ctx.set("HasChanges", False)
        
        assert ctx.evaluate_condition("{{.HasChanges}}") is False
        assert ctx.evaluate_condition("false") is False

    def test_update_workspace(self):
        """Test updating workspace path."""
        ctx = TemplateContext()
        ctx.update_workspace("/tmp/workspace-123")
        
        assert ctx.get("WorkspacePath") == "/tmp/workspace-123"

    def test_update_branch(self):
        """Test updating branch info."""
        ctx = TemplateContext()
        ctx.update_branch("agent/feature/abc123", "agent/feature/")
        
        assert ctx.get("BranchName") == "agent/feature/abc123"
        assert ctx.get("BranchPrefix") == "agent/feature/"

    def test_to_dict(self):
        """Test converting context to dictionary."""
        ctx = TemplateContext()
        ctx.set("Foo", "bar")
        ctx.set("Num", 123)
        
        result = ctx.to_dict()
        
        assert result["Foo"] == "bar"
        assert result["Num"] == 123
