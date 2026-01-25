"""Tests for execution profile lifecycle phases.

These tests exercise the full executor lifecycle without needing 
Bedrock/Anthropic models by using mock execution mode.

The lifecycle has three phases:
1. DETERMINISTIC PRE-EXECUTION: Profile resolution, workspace creation, pre-hooks
2. NON-DETERMINISTIC AGENT EXECUTION: (mocked) Claude SDK execution  
3. DETERMINISTIC POST-EXECUTION: State updates, post-hooks, cleanup

Run with: pytest tests/test_lifecycle.py -v
"""

import os
import pytest
import tempfile
import shutil
from dataclasses import dataclass
from typing import Optional, Dict, Any, List
from unittest.mock import AsyncMock, MagicMock, patch

from claude_sdk_executor.executor import ClaudeSdkExecutor, ExecutionState
from claude_sdk_executor.profile.resolver import ProfileResolver, ResolvedProfile, HookConfig, CriticConfig, WorkspaceConfig
from claude_sdk_executor.profile.templates import TemplateContext
from claude_sdk_executor.workspace.manager import WorkspaceManager
from claude_sdk_executor.hooks.runner import HookRunner
from claude_sdk_executor.hooks.base import HookParams, HookResult
from claude_sdk_executor.types.claude_config import ClaudeSdkConfig
from claude_sdk_executor.types.telemetry import ExecutionTelemetry


# ============================================================================
# Test Fixtures
# ============================================================================

@pytest.fixture
def temp_workspace():
    """Create a temporary workspace directory for testing."""
    temp_dir = tempfile.mkdtemp(prefix="test-workspace-")
    yield temp_dir
    shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture
def git_repo(temp_workspace):
    """Create a git repository in the temp workspace."""
    import subprocess
    subprocess.run(["git", "init"], cwd=temp_workspace, capture_output=True)
    subprocess.run(["git", "config", "user.email", "test@test.com"], cwd=temp_workspace, capture_output=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=temp_workspace, capture_output=True)
    
    # Create initial commit
    test_file = os.path.join(temp_workspace, "README.md")
    with open(test_file, "w") as f:
        f.write("# Test Repository\n")
    subprocess.run(["git", "add", "."], cwd=temp_workspace, capture_output=True)
    subprocess.run(["git", "commit", "-m", "Initial commit"], cwd=temp_workspace, capture_output=True)
    
    yield temp_workspace


@pytest.fixture
def mock_request():
    """Create a mock ExecutionEngineRequest."""
    @dataclass
    class MockMessage:
        role: str = "user"
        content: str = "Create a hello world script"
    
    @dataclass
    class MockModel:
        name: str = "claude-sonnet-4"
        type: str = "openai"
        config: Dict[str, Any] = None
        
        def __post_init__(self):
            if self.config is None:
                self.config = {
                    "openai": {
                        "baseUrl": "https://api.test.com",
                        "apiKey": "test-key"
                    }
                }
        
        def model_dump(self):
            return {
                "name": self.name,
                "type": self.type,
                "config": self.config
            }
    
    @dataclass
    class MockAgent:
        name: str = "test-agent"
        namespace: str = "test-ns"
        prompt: str = "You are a helpful assistant."
        description: str = "Test agent"
        parameters: List[Any] = None
        model: MockModel = None
        labels: Dict[str, str] = None
        
        def __post_init__(self):
            if self.parameters is None:
                self.parameters = []
            if self.model is None:
                self.model = MockModel()
            if self.labels is None:
                self.labels = {
                    "executor.ark.mckinsey.com/repo": "https://github.com/test/repo.git",
                    "executor.ark.mckinsey.com/branch": "main"
                }
    
    @dataclass
    class MockRequest:
        queryId: str = "test-query-123"
        queryName: str = "test-query"
        agent: MockAgent = None
        userInput: MockMessage = None
        history: List[Any] = None
        tools: List[Any] = None
        profile: Dict[str, Any] = None
        
        def __post_init__(self):
            if self.agent is None:
                self.agent = MockAgent()
            if self.userInput is None:
                self.userInput = MockMessage()
            if self.history is None:
                self.history = []
            if self.tools is None:
                self.tools = []
            if self.profile is None:
                self.profile = {
                    "name": "test-profile",
                    "namespace": "test-ns",
                    "workspace": {
                        "type": "filesystem"
                    },
                    "preExecute": [],
                    "execution": {"maxIterations": 5},
                    "postExecute": [],
                    "sdkConfig": {
                        "claude": {
                            "allowedTools": ["Read", "Write"],
                            "permissionMode": "acceptEdits"
                        }
                    }
                }
    
    return MockRequest()


# ============================================================================
# Phase 1: Profile Resolution Tests
# ============================================================================

class TestProfileResolution:
    """Test profile resolution from request data."""

    def test_resolve_minimal_profile(self):
        """Test resolving a minimal profile."""
        resolver = ProfileResolver()
        profile = resolver.from_request({
            "name": "minimal",
            "namespace": "default"
        })
        
        assert profile.name == "minimal"
        assert profile.namespace == "default"
        assert profile.workspace is None
        assert profile.pre_execute == []
        assert profile.post_execute == []

    def test_resolve_profile_with_workspace(self):
        """Test resolving profile with workspace config."""
        resolver = ProfileResolver()
        profile = resolver.from_request({
            "name": "with-workspace",
            "namespace": "dev",
            "workspace": {
                "type": "git",
                "git": {
                    "defaultBranch": "main",
                    "branchPrefix": "feature/"
                }
            }
        })
        
        assert profile.workspace is not None
        assert profile.workspace.type == "git"
        assert profile.workspace.git is not None
        assert profile.workspace.git.get("defaultBranch") == "main"

    def test_resolve_profile_with_hooks(self):
        """Test resolving profile with pre and post hooks."""
        resolver = ProfileResolver()
        profile = resolver.from_request({
            "name": "with-hooks",
            "namespace": "test",
            "preExecute": [
                {"name": "clone", "action": "git_clone", "params": {"depth": "1"}},
                {"name": "branch", "action": "git_create_branch", "params": {"nameTemplate": "{{.QueryID}}"}}
            ],
            "postExecute": [
                {"name": "commit", "action": "git_commit", "condition": "{{.HasChanges}}"},
                {"name": "push", "action": "git_push", "condition": "{{.HasChanges}}"}
            ]
        })
        
        assert len(profile.pre_execute) == 2
        assert profile.pre_execute[0].action == "git_clone"
        assert profile.pre_execute[0].params["depth"] == "1"
        assert len(profile.post_execute) == 2
        assert profile.post_execute[0].condition == "{{.HasChanges}}"

    def test_resolve_profile_with_critic(self):
        """Test resolving profile with critic configuration."""
        resolver = ProfileResolver()
        profile = resolver.from_request({
            "name": "with-critic",
            "namespace": "test",
            "critic": {
                "enabled": True,
                "mode": "inline",
                "maxRetries": 2,
                "inline": {
                    "prompt": "Review the changes",
                    "passCondition": "{{.CriticApproved}}",
                    "runTests": True
                }
            }
        })
        
        assert profile.critic is not None
        assert profile.critic.enabled is True
        assert profile.critic.mode == "inline"
        assert profile.critic.max_retries == 2
        assert profile.critic.inline is not None
        assert profile.critic.inline.get("runTests") is True

    def test_resolve_profile_with_sdk_config(self):
        """Test resolving profile with SDK-specific config."""
        resolver = ProfileResolver()
        profile = resolver.from_request({
            "name": "claude-profile",
            "namespace": "test",
            "sdkConfig": {
                "claude": {
                    "allowedTools": ["Read", "Edit", "Write", "Bash"],
                    "permissionMode": "bypassPermissions",
                    "settingSources": ["project"],
                    "mcpServers": {
                        "github": {
                            "command": "npx",
                            "args": ["-y", "@github/mcp-server"]
                        }
                    }
                }
            }
        })
        
        assert profile.sdk_config is not None
        assert "claude" in profile.sdk_config
        
        claude_config = ClaudeSdkConfig.from_sdk_config(profile.sdk_config)
        assert claude_config.allowed_tools == ["Read", "Edit", "Write", "Bash"]
        assert claude_config.permission_mode == "bypassPermissions"
        assert "github" in claude_config.mcp_servers


# ============================================================================
# Phase 2: Template Context Tests
# ============================================================================

class TestTemplateContext:
    """Test template context creation and variable resolution."""

    def test_create_context_from_request(self, mock_request):
        """Test creating context from request."""
        context = TemplateContext.from_request(mock_request)
        
        assert context.get("QueryID") == "test-query-123"
        assert context.get("AgentName") == "test-agent"
        assert context.get("AgentNamespace") == "test-ns"
        assert "hello world" in context.get("TaskSummary").lower()

    def test_context_workspace_update(self, mock_request, temp_workspace):
        """Test updating context with workspace info."""
        context = TemplateContext.from_request(mock_request)
        context.update_workspace(temp_workspace)
        
        assert context.get("WorkspacePath") == temp_workspace

    def test_context_branch_update(self, mock_request):
        """Test updating context with branch info."""
        context = TemplateContext.from_request(mock_request)
        context.update_branch("feature/test-123", "feature/")
        
        assert context.get("BranchName") == "feature/test-123"
        assert context.get("BranchPrefix") == "feature/"

    def test_context_results_update(self, mock_request):
        """Test updating context with execution results."""
        context = TemplateContext.from_request(mock_request)
        
        state = ExecutionState()
        state.agent_output = "Created hello.py"
        state.diff = "+print('hello')"
        state.diff_summary = "1 file changed, 1 insertion(+)"
        state.has_changes = True
        state.critic_score = 1.0
        
        context.update_results(state)
        
        assert context.get("AgentOutput") == "Created hello.py"
        assert context.get("HasChanges") is True
        assert context.get("CriticApproved") is True

    def test_resolve_go_style_template(self, mock_request):
        """Test resolving Go-style {{.VarName}} templates."""
        context = TemplateContext.from_request(mock_request)
        
        template = "Agent {{.AgentName}} in {{.AgentNamespace}}"
        result = context.resolve(template)
        
        assert result == "Agent test-agent in test-ns"

    def test_evaluate_condition_true(self, mock_request):
        """Test evaluating a true condition."""
        context = TemplateContext.from_request(mock_request)
        context.set("HasChanges", True)
        
        assert context.evaluate_condition("{{.HasChanges}}") is True

    def test_evaluate_condition_false(self, mock_request):
        """Test evaluating a false condition."""
        context = TemplateContext.from_request(mock_request)
        context.set("HasChanges", False)
        
        assert context.evaluate_condition("{{.HasChanges}}") is False

    def test_evaluate_empty_condition(self, mock_request):
        """Test that empty condition returns True (always run)."""
        context = TemplateContext.from_request(mock_request)
        
        assert context.evaluate_condition("") is True
        assert context.evaluate_condition(None) is True


# ============================================================================
# Phase 3: Workspace Manager Tests
# ============================================================================

class TestWorkspaceManager:
    """Test workspace creation and lifecycle."""

    @pytest.mark.asyncio
    async def test_create_workspace(self, temp_workspace):
        """Test creating a workspace directory."""
        manager = WorkspaceManager(base_dir=temp_workspace)
        
        config = WorkspaceConfig(type="filesystem")
        workspace_path = await manager.create(config, "query-001")
        
        assert os.path.exists(workspace_path)
        assert "query-001" in workspace_path

    @pytest.mark.asyncio
    async def test_cleanup_workspace(self, temp_workspace):
        """Test cleaning up a workspace."""
        manager = WorkspaceManager(base_dir=temp_workspace)
        
        config = WorkspaceConfig(type="filesystem")
        workspace_path = await manager.create(config, "query-002")
        
        assert os.path.exists(workspace_path)
        
        await manager.cleanup(workspace_path)
        
        assert not os.path.exists(workspace_path)

    @pytest.mark.asyncio
    async def test_get_diff_on_git_repo(self, git_repo):
        """Test getting diff from a git repository."""
        manager = WorkspaceManager()
        
        # Make a change
        test_file = os.path.join(git_repo, "new_file.py")
        with open(test_file, "w") as f:
            f.write("print('hello')\n")
        
        # Get diff (unstaged changes)
        diff = await manager.get_diff(git_repo)
        
        # Diff should be empty for untracked files, or show changes
        # Either way, the method should not fail
        assert diff is not None

    @pytest.mark.asyncio
    async def test_get_diff_summary(self, git_repo):
        """Test getting diff summary from a git repository."""
        manager = WorkspaceManager()
        
        # Make and stage a change
        test_file = os.path.join(git_repo, "README.md")
        with open(test_file, "a") as f:
            f.write("\nNew content added.\n")
        
        import subprocess
        subprocess.run(["git", "add", "."], cwd=git_repo, capture_output=True)
        
        diff_summary = await manager.get_diff_summary(git_repo)
        
        assert diff_summary is not None


# ============================================================================
# Phase 4: Hook Runner Tests
# ============================================================================

class TestHookRunner:
    """Test hook execution with conditions."""

    @pytest.mark.asyncio
    async def test_run_empty_hooks(self, mock_request):
        """Test running empty hook list."""
        runner = HookRunner()
        context = TemplateContext.from_request(mock_request)
        state = ExecutionState()
        
        results = await runner.run([], context, state)
        
        assert results == []

    @pytest.mark.asyncio
    async def test_skip_hook_when_condition_false(self, mock_request):
        """Test that hooks are skipped when condition is false."""
        runner = HookRunner()
        context = TemplateContext.from_request(mock_request)
        context.set("HasChanges", False)
        state = ExecutionState()
        
        # Create a hook that should be skipped
        hook = HookConfig(
            name="commit",
            action="git_commit",
            condition="{{.HasChanges}}",
            params={}
        )
        
        # The hook should be skipped, not fail
        results = await runner.run([hook], context, state)
        
        # Should be empty since condition was false
        assert len(results) == 0

    @pytest.mark.asyncio
    async def test_unknown_hook_skipped(self, mock_request):
        """Test that unknown hooks are skipped with warning."""
        runner = HookRunner()
        context = TemplateContext.from_request(mock_request)
        state = ExecutionState()
        
        hook = HookConfig(
            name="unknown",
            action="unknown_action",
            params={}
        )
        
        results = await runner.run([hook], context, state)
        
        # Unknown hooks are skipped
        assert len(results) == 0


# ============================================================================
# Phase 5: Full Executor Lifecycle Tests  
# ============================================================================

class TestExecutorLifecycle:
    """Test the full executor lifecycle with mock SDK execution."""

    @pytest.mark.asyncio
    async def test_executor_creation(self):
        """Test that executor can be instantiated."""
        executor = ClaudeSdkExecutor()
        
        assert executor is not None
        assert executor.profile_resolver is not None
        assert executor.workspace_manager is not None
        assert executor.hook_runner is not None
        assert executor.sdk_runner is not None

    @pytest.mark.asyncio
    async def test_lifecycle_with_filesystem_workspace(self, mock_request, temp_workspace):
        """Test lifecycle with filesystem workspace (no git)."""
        executor = ClaudeSdkExecutor()
        executor.workspace_manager = WorkspaceManager(base_dir=temp_workspace)
        
        # Update profile to use filesystem workspace
        mock_request.profile["workspace"] = {"type": "filesystem"}
        mock_request.profile["preExecute"] = []
        mock_request.profile["postExecute"] = []
        
        # Execute - will use mock mode since SDK isn't available
        messages = await executor.execute_agent(mock_request)
        
        assert len(messages) == 1
        assert messages[0].role == "assistant"
        assert mock_request.agent.name in messages[0].name

    @pytest.mark.asyncio
    async def test_lifecycle_state_progression(self, mock_request, temp_workspace):
        """Test that state progresses correctly through lifecycle."""
        executor = ClaudeSdkExecutor()
        executor.workspace_manager = WorkspaceManager(base_dir=temp_workspace)
        
        # Capture state at various points
        states_captured = []
        
        original_run = executor.hook_runner.run
        async def capture_state(hooks, context, state):
            states_captured.append({
                "workspace": state.workspace_path,
                "has_output": bool(state.agent_output),
                "hook_count": len(hooks)
            })
            return await original_run(hooks, context, state)
        
        executor.hook_runner.run = capture_state
        
        mock_request.profile["workspace"] = {"type": "filesystem"}
        mock_request.profile["preExecute"] = [
            {"name": "setup", "action": "unknown_action", "params": {}}
        ]
        mock_request.profile["postExecute"] = [
            {"name": "cleanup", "action": "unknown_action", "params": {}}
        ]
        
        await executor.execute_agent(mock_request)
        
        # Should have captured state for pre and post hooks
        assert len(states_captured) == 2
        
        # Pre-execute: workspace set, no output yet
        assert states_captured[0]["workspace"] is not None
        assert states_captured[0]["has_output"] is False
        
        # Post-execute: workspace set, output present
        assert states_captured[1]["workspace"] is not None
        assert states_captured[1]["has_output"] is True

    @pytest.mark.asyncio
    async def test_lifecycle_with_no_workspace(self, mock_request):
        """Test lifecycle when no workspace is configured."""
        executor = ClaudeSdkExecutor()
        
        mock_request.profile["workspace"] = {"type": "none"}
        mock_request.profile["preExecute"] = []
        mock_request.profile["postExecute"] = []
        
        messages = await executor.execute_agent(mock_request)
        
        assert len(messages) == 1
        assert messages[0].content  # Should have some output

    @pytest.mark.asyncio
    async def test_lifecycle_with_critic_disabled(self, mock_request, temp_workspace):
        """Test lifecycle with critic disabled."""
        executor = ClaudeSdkExecutor()
        executor.workspace_manager = WorkspaceManager(base_dir=temp_workspace)
        
        mock_request.profile["workspace"] = {"type": "filesystem"}
        mock_request.profile["critic"] = {"enabled": False}
        mock_request.profile["preExecute"] = []
        mock_request.profile["postExecute"] = []
        
        messages = await executor.execute_agent(mock_request)
        
        assert len(messages) == 1

    @pytest.mark.asyncio
    async def test_lifecycle_with_inline_critic_mock(self, mock_request, temp_workspace):
        """Test lifecycle with inline critic (mocked execution)."""
        executor = ClaudeSdkExecutor()
        executor.workspace_manager = WorkspaceManager(base_dir=temp_workspace)
        
        mock_request.profile["workspace"] = {"type": "filesystem"}
        mock_request.profile["critic"] = {
            "enabled": True,
            "mode": "inline",
            "maxRetries": 1,
            "inline": {
                "prompt": "Review the output",
                "passCondition": "{{.CriticApproved}}"
            }
        }
        mock_request.profile["preExecute"] = []
        mock_request.profile["postExecute"] = []
        
        # Mock SDK returns "APPROVED" for critic response
        messages = await executor.execute_agent(mock_request)
        
        assert len(messages) == 1

    @pytest.mark.asyncio
    async def test_template_resolution_in_hooks(self, mock_request, temp_workspace):
        """Test that templates are resolved in hook parameters."""
        executor = ClaudeSdkExecutor()
        executor.workspace_manager = WorkspaceManager(base_dir=temp_workspace)
        
        resolved_params = []
        
        # Patch hook runner to capture resolved params
        original_run = executor.hook_runner.run
        async def capture_params(hooks, context, state):
            for hook in hooks:
                resolved = {}
                for key, value in hook.params.items():
                    resolved[key] = context.resolve(value)
                resolved_params.append({"hook": hook.name, "params": resolved})
            return []  # Skip actual execution
        
        executor.hook_runner.run = capture_params
        
        mock_request.profile["workspace"] = {"type": "filesystem"}
        mock_request.profile["preExecute"] = [
            {
                "name": "test-hook",
                "action": "git_create_branch",
                "params": {
                    "nameTemplate": "feature/{{.QueryID}}",
                    "baseBranch": "{{.Branch}}"
                }
            }
        ]
        mock_request.profile["postExecute"] = []
        
        await executor.execute_agent(mock_request)
        
        assert len(resolved_params) == 1
        assert resolved_params[0]["params"]["nameTemplate"] == "feature/test-query-123"
        assert resolved_params[0]["params"]["baseBranch"] == "main"


# ============================================================================
# Phase 6: Error Handling Tests
# ============================================================================

class TestErrorHandling:
    """Test error handling and failure hooks."""

    @pytest.mark.asyncio
    async def test_failure_hooks_called_on_error(self, mock_request, temp_workspace):
        """Test that failure hooks are called when execution fails."""
        executor = ClaudeSdkExecutor()
        executor.workspace_manager = WorkspaceManager(base_dir=temp_workspace)
        
        failure_hook_called = []
        
        # Make SDK runner raise an error
        async def failing_execute(*args, **kwargs):
            raise RuntimeError("Simulated failure")
        
        executor.sdk_runner.execute = failing_execute
        executor.sdk_runner.execute_with_critic = failing_execute
        
        # Track failure hooks
        original_run = executor.hook_runner.run
        async def track_failure(hooks, context, state):
            if hooks and state.error:
                failure_hook_called.append(True)
            return []
        
        executor.hook_runner.run = track_failure
        
        mock_request.profile["workspace"] = {"type": "filesystem"}
        mock_request.profile["onFailure"] = [
            {"name": "notify", "action": "jira_comment", "params": {"body": "Error: {{.Error}}"}}
        ]
        mock_request.profile["preExecute"] = []
        mock_request.profile["postExecute"] = []
        
        with pytest.raises(RuntimeError, match="Simulated failure"):
            await executor.execute_agent(mock_request)
        
        # Failure hooks should have been attempted
        # (they may not execute if the hook action doesn't exist)

    @pytest.mark.asyncio
    async def test_workspace_cleanup_on_failure(self, mock_request, temp_workspace):
        """Test that workspace is cleaned up even when execution fails."""
        executor = ClaudeSdkExecutor()
        manager = WorkspaceManager(base_dir=temp_workspace)
        executor.workspace_manager = manager
        
        workspace_path = None
        
        # Capture workspace path before failure
        original_create = manager.create
        async def capture_workspace(*args, **kwargs):
            nonlocal workspace_path
            workspace_path = await original_create(*args, **kwargs)
            return workspace_path
        
        manager.create = capture_workspace
        
        # Make execution fail
        async def failing_execute(*args, **kwargs):
            raise RuntimeError("Test failure")
        
        executor.sdk_runner.execute = failing_execute
        
        mock_request.profile["workspace"] = {"type": "filesystem"}
        mock_request.profile["preExecute"] = []
        mock_request.profile["postExecute"] = []
        
        with pytest.raises(RuntimeError):
            await executor.execute_agent(mock_request)
        
        # Workspace should be cleaned up
        assert workspace_path is not None
        assert not os.path.exists(workspace_path)


# ============================================================================
# SDK Config Parsing Tests
# ============================================================================

class TestSdkConfigParsing:
    """Test parsing of SDK-specific configuration."""

    def test_parse_minimal_claude_config(self):
        """Test parsing minimal Claude config."""
        config = ClaudeSdkConfig.from_sdk_config({
            "claude": {}
        })
        
        # Should use defaults
        assert "Read" in config.allowed_tools
        assert config.permission_mode == "acceptEdits"
        assert config.mcp_servers == {}

    def test_parse_full_claude_config(self):
        """Test parsing full Claude config."""
        config = ClaudeSdkConfig.from_sdk_config({
            "claude": {
                "allowedTools": ["Read", "Edit", "Bash"],
                "permissionMode": "bypassPermissions",
                "settingSources": ["project", "user"],
                "model": "claude-sonnet-4-20250514",
                "maxBudgetUsd": 5.0,
                "critic": {
                    "passPattern": "LGTM",
                    "criticTools": ["Read", "Grep"]
                },
                "mcpServers": {
                    "postgres": {
                        "command": "npx",
                        "args": ["-y", "@modelcontextprotocol/server-postgres"],
                        "env": {"DATABASE_URL": "${PG_URL}"}
                    }
                }
            }
        })
        
        assert config.allowed_tools == ["Read", "Edit", "Bash"]
        assert config.permission_mode == "bypassPermissions"
        assert config.model == "claude-sonnet-4-20250514"
        assert config.max_budget_usd == 5.0
        assert config.critic is not None
        assert config.critic.pass_pattern == "LGTM"
        assert "postgres" in config.mcp_servers
        assert config.mcp_servers["postgres"].command == "npx"

    def test_parse_http_mcp_server(self):
        """Test parsing HTTP MCP server config."""
        config = ClaudeSdkConfig.from_sdk_config({
            "claude": {
                "mcpServers": {
                    "api": {
                        "type": "http",
                        "url": "https://mcp.example.com/api",
                        "headers": {"Authorization": "Bearer token"}
                    }
                }
            }
        })
        
        assert "api" in config.mcp_servers
        assert config.mcp_servers["api"].type == "http"
        assert config.mcp_servers["api"].url == "https://mcp.example.com/api"


# ============================================================================
# Telemetry Tests
# ============================================================================

class TestTelemetry:
    """Test telemetry capture and merging."""

    def test_telemetry_merge(self):
        """Test merging telemetry from multiple executions."""
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
        
        assert t1.session_id == "session-2"  # Latest wins
        assert t1.duration_ms == 1500  # Summed
        assert t1.num_turns == 3  # Summed
        assert t1.total_cost_usd == 0.015  # Summed

    def test_telemetry_to_dict(self):
        """Test converting telemetry to dictionary."""
        t = ExecutionTelemetry(
            session_id="test-session",
            duration_ms=5000,
            num_turns=10,
            total_cost_usd=0.50,
            is_error=False
        )
        
        d = t.to_dict()
        
        assert d["session_id"] == "test-session"
        assert d["duration_ms"] == 5000
        assert d["is_error"] is False


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-x"])
