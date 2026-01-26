"""Tests for sample agents and execution profiles.

Validates that all sample YAML files:
1. Parse correctly as valid YAML
2. Have required fields for their CRD type
3. Have consistent references between resources
4. Use valid template variables
"""

import os
import re
from pathlib import Path
from typing import Any, Dict, List

import pytest
import yaml


# Path to samples directory
SAMPLES_DIR = Path(__file__).parent.parent / "samples"


def load_yaml_file(path: Path) -> Dict[str, Any]:
    """Load and parse a YAML file."""
    with open(path) as f:
        return yaml.safe_load(f)


def get_all_sample_dirs() -> List[Path]:
    """Get all sample directories (excluding root README)."""
    return [d for d in SAMPLES_DIR.iterdir() if d.is_dir()]


def get_yaml_files(sample_dir: Path) -> Dict[str, Path]:
    """Get all YAML files in a sample directory."""
    return {f.stem: f for f in sample_dir.glob("*.yaml")}


class TestSamplesExist:
    """Tests that all expected samples exist."""

    def test_samples_directory_exists(self):
        """Verify samples directory exists."""
        assert SAMPLES_DIR.exists(), f"Samples directory not found: {SAMPLES_DIR}"

    def test_samples_readme_exists(self):
        """Verify main README exists."""
        readme = SAMPLES_DIR / "README.md"
        assert readme.exists(), "samples/README.md not found"

    def test_expected_samples_exist(self):
        """Verify all expected sample directories exist."""
        expected_samples = ["pr-reviewer", "feature-developer"]
        
        for sample in expected_samples:
            sample_dir = SAMPLES_DIR / sample
            assert sample_dir.exists(), f"Sample directory not found: {sample}"

    @pytest.mark.parametrize("sample_name", ["pr-reviewer", "feature-developer"])
    def test_sample_has_required_files(self, sample_name: str):
        """Each sample must have agent.yaml, execution-profile.yaml, query.yaml, README.md."""
        sample_dir = SAMPLES_DIR / sample_name
        
        required_files = ["agent.yaml", "execution-profile.yaml", "query.yaml", "README.md"]
        for filename in required_files:
            filepath = sample_dir / filename
            assert filepath.exists(), f"{sample_name}/{filename} not found"


class TestYamlParsing:
    """Tests that all YAML files parse correctly."""

    @pytest.mark.parametrize("sample_name", ["pr-reviewer", "feature-developer"])
    def test_yaml_files_parse(self, sample_name: str):
        """All YAML files in each sample should parse without errors."""
        sample_dir = SAMPLES_DIR / sample_name
        yaml_files = list(sample_dir.glob("*.yaml"))
        
        for yaml_file in yaml_files:
            try:
                data = load_yaml_file(yaml_file)
                assert data is not None, f"{yaml_file.name} parsed to None"
            except yaml.YAMLError as e:
                pytest.fail(f"Failed to parse {yaml_file.name}: {e}")


class TestAgentCRD:
    """Tests for Agent CRD structure."""

    @pytest.mark.parametrize("sample_name", ["pr-reviewer", "feature-developer"])
    def test_agent_has_required_fields(self, sample_name: str):
        """Agent CRD must have required fields."""
        agent_path = SAMPLES_DIR / sample_name / "agent.yaml"
        agent = load_yaml_file(agent_path)
        
        # Check apiVersion and kind
        assert agent.get("apiVersion") == "ark.mckinsey.com/v1alpha1", \
            f"{sample_name}: Wrong Agent apiVersion"
        assert agent.get("kind") == "Agent", \
            f"{sample_name}: Wrong kind"
        
        # Check metadata
        assert "metadata" in agent, f"{sample_name}: Missing metadata"
        assert "name" in agent["metadata"], f"{sample_name}: Missing metadata.name"
        
        # Check spec
        assert "spec" in agent, f"{sample_name}: Missing spec"
        spec = agent["spec"]
        
        assert "prompt" in spec, f"{sample_name}: Missing spec.prompt"
        assert "modelRef" in spec, f"{sample_name}: Missing spec.modelRef"
        assert "executionEngine" in spec, f"{sample_name}: Missing spec.executionEngine"

    @pytest.mark.parametrize("sample_name", ["pr-reviewer", "feature-developer"])
    def test_agent_references_profile(self, sample_name: str):
        """Agent must reference an execution profile."""
        agent_path = SAMPLES_DIR / sample_name / "agent.yaml"
        agent = load_yaml_file(agent_path)
        
        engine = agent["spec"]["executionEngine"]
        assert "profileRef" in engine, f"{sample_name}: Missing executionEngine.profileRef"
        assert "name" in engine["profileRef"], f"{sample_name}: Missing profileRef.name"

    @pytest.mark.parametrize("sample_name", ["pr-reviewer", "feature-developer"])
    def test_agent_prompt_not_empty(self, sample_name: str):
        """Agent prompt should not be empty."""
        agent_path = SAMPLES_DIR / sample_name / "agent.yaml"
        agent = load_yaml_file(agent_path)
        
        prompt = agent["spec"]["prompt"]
        assert prompt and len(prompt.strip()) > 50, \
            f"{sample_name}: Agent prompt is too short"


class TestExecutionProfileCRD:
    """Tests for ExecutionProfile CRD structure."""

    @pytest.mark.parametrize("sample_name", ["pr-reviewer", "feature-developer"])
    def test_profile_has_required_fields(self, sample_name: str):
        """ExecutionProfile CRD must have required fields."""
        profile_path = SAMPLES_DIR / sample_name / "execution-profile.yaml"
        profile = load_yaml_file(profile_path)
        
        # Check apiVersion and kind
        assert profile.get("apiVersion") == "ark.mckinsey.com/v1prealpha1", \
            f"{sample_name}: Wrong ExecutionProfile apiVersion"
        assert profile.get("kind") == "ExecutionProfile", \
            f"{sample_name}: Wrong kind"
        
        # Check metadata
        assert "metadata" in profile, f"{sample_name}: Missing metadata"
        assert "name" in profile["metadata"], f"{sample_name}: Missing metadata.name"
        
        # Check spec
        assert "spec" in profile, f"{sample_name}: Missing spec"

    @pytest.mark.parametrize("sample_name", ["pr-reviewer", "feature-developer"])
    def test_profile_has_workspace(self, sample_name: str):
        """ExecutionProfile should have workspace config."""
        profile_path = SAMPLES_DIR / sample_name / "execution-profile.yaml"
        profile = load_yaml_file(profile_path)
        
        spec = profile["spec"]
        assert "workspace" in spec, f"{sample_name}: Missing workspace config"
        assert "type" in spec["workspace"], f"{sample_name}: Missing workspace.type"

    @pytest.mark.parametrize("sample_name", ["pr-reviewer", "feature-developer"])
    def test_profile_has_sdk_config(self, sample_name: str):
        """ExecutionProfile should have sdkConfig for Claude."""
        profile_path = SAMPLES_DIR / sample_name / "execution-profile.yaml"
        profile = load_yaml_file(profile_path)
        
        spec = profile["spec"]
        assert "sdkConfig" in spec, f"{sample_name}: Missing sdkConfig"
        assert "claude" in spec["sdkConfig"], f"{sample_name}: Missing sdkConfig.claude"
        
        claude = spec["sdkConfig"]["claude"]
        assert "allowedTools" in claude, f"{sample_name}: Missing allowedTools"
        assert isinstance(claude["allowedTools"], list), \
            f"{sample_name}: allowedTools should be a list"


class TestQueryCRD:
    """Tests for Query CRD structure."""

    @pytest.mark.parametrize("sample_name", ["pr-reviewer", "feature-developer"])
    def test_query_has_required_fields(self, sample_name: str):
        """Query CRD must have required fields."""
        query_path = SAMPLES_DIR / sample_name / "query.yaml"
        query = load_yaml_file(query_path)
        
        # Check apiVersion and kind
        assert query.get("apiVersion") == "ark.mckinsey.com/v1alpha1", \
            f"{sample_name}: Wrong Query apiVersion"
        assert query.get("kind") == "Query", \
            f"{sample_name}: Wrong kind"
        
        # Check metadata
        assert "metadata" in query, f"{sample_name}: Missing metadata"
        assert "name" in query["metadata"], f"{sample_name}: Missing metadata.name"
        
        # Check spec
        assert "spec" in query, f"{sample_name}: Missing spec"
        spec = query["spec"]
        
        # Target agent reference
        assert "target" in spec, f"{sample_name}: Missing spec.target"
        assert "name" in spec["target"], f"{sample_name}: Missing spec.target.name"
        assert spec["target"].get("type") == "agent", f"{sample_name}: target.type should be 'agent'"
        
        # Input prompt
        assert "input" in spec, f"{sample_name}: Missing spec.input"

    @pytest.mark.parametrize("sample_name", ["pr-reviewer", "feature-developer"])
    def test_query_has_parameters(self, sample_name: str):
        """Query should have parameters for template variables."""
        query_path = SAMPLES_DIR / sample_name / "query.yaml"
        query = load_yaml_file(query_path)
        
        spec = query["spec"]
        assert "parameters" in spec, f"{sample_name}: Missing parameters"
        assert len(spec["parameters"]) > 0, f"{sample_name}: No parameters defined"
    
    @pytest.mark.parametrize("sample_name", ["pr-reviewer", "feature-developer"])
    def test_query_has_timeout(self, sample_name: str):
        """Query should have a timeout."""
        query_path = SAMPLES_DIR / sample_name / "query.yaml"
        query = load_yaml_file(query_path)
        
        spec = query["spec"]
        assert "timeout" in spec, f"{sample_name}: Missing timeout"


class TestResourceConsistency:
    """Tests that resources reference each other correctly."""

    @pytest.mark.parametrize("sample_name", ["pr-reviewer", "feature-developer"])
    def test_query_references_correct_agent(self, sample_name: str):
        """Query.target.name should match Agent.metadata.name."""
        sample_dir = SAMPLES_DIR / sample_name
        
        agent = load_yaml_file(sample_dir / "agent.yaml")
        query = load_yaml_file(sample_dir / "query.yaml")
        
        agent_name = agent["metadata"]["name"]
        query_agent_ref = query["spec"]["target"]["name"]
        
        assert query_agent_ref == agent_name, \
            f"{sample_name}: Query references '{query_agent_ref}' but agent is '{agent_name}'"

    @pytest.mark.parametrize("sample_name", ["pr-reviewer", "feature-developer"])
    def test_agent_references_correct_profile(self, sample_name: str):
        """Agent.executionEngine.profileRef.name should match ExecutionProfile.metadata.name."""
        sample_dir = SAMPLES_DIR / sample_name
        
        agent = load_yaml_file(sample_dir / "agent.yaml")
        profile = load_yaml_file(sample_dir / "execution-profile.yaml")
        
        profile_name = profile["metadata"]["name"]
        agent_profile_ref = agent["spec"]["executionEngine"]["profileRef"]["name"]
        
        assert agent_profile_ref == profile_name, \
            f"{sample_name}: Agent references profile '{agent_profile_ref}' but profile is '{profile_name}'"


class TestTemplateVariables:
    """Tests for template variable usage."""

    @pytest.mark.parametrize("sample_name", ["pr-reviewer", "feature-developer"])
    def test_profile_template_vars_have_definitions(self, sample_name: str):
        """Template variables used in profile should be defined in query parameters."""
        sample_dir = SAMPLES_DIR / sample_name
        
        profile = load_yaml_file(sample_dir / "execution-profile.yaml")
        query = load_yaml_file(sample_dir / "query.yaml")
        
        # Get parameter names from query
        param_names = {p["name"] for p in query["spec"].get("parameters", [])}
        
        # Add built-in variables (from executor, hooks, and output schemas)
        builtin_vars = {
            # Core executor builtins
            "QueryID", "AgentOutput", "HasChanges", "DiffSummary", "Diff",
            "Error", "CriticApproved", "TestsPassed", "CommitSummary",
            "StructuredOutput",
            # Git/GitHub hook builtins
            "BranchName",
            # Structured output schema fields (used in range/loops)
            "category", "file", "line", "message", "severity", "suggestion",
            "comments", "summary", "findings", "recommendations",
        }
        available_vars = param_names | builtin_vars
        
        # Extract template variables from profile YAML
        profile_yaml = yaml.dump(profile)
        template_vars = set(re.findall(r'\{\{\.(\w+)', profile_yaml))
        
        # Check each template variable is available
        for var in template_vars:
            assert var in available_vars, \
                f"{sample_name}: Template variable '{{{{.{var}}}}}' not in query parameters or builtins"


class TestCriticConfiguration:
    """Tests for critic configuration in profiles."""

    def test_feature_developer_has_inline_critic(self):
        """Feature developer should have inline critic enabled."""
        profile_path = SAMPLES_DIR / "feature-developer" / "execution-profile.yaml"
        profile = load_yaml_file(profile_path)
        
        critic = profile["spec"].get("critic", {})
        assert critic.get("enabled") is True, "Critic should be enabled"
        assert critic.get("mode") == "inline", "Critic mode should be inline"
        assert "inline" in critic, "Missing inline critic config"

    @pytest.mark.skip(reason="code-refactor sample not yet implemented")
    def test_code_refactor_has_test_validation(self):
        """Code refactor should have test validation enabled."""
        profile_path = SAMPLES_DIR / "code-refactor" / "execution-profile.yaml"
        profile = load_yaml_file(profile_path)
        
        critic = profile["spec"].get("critic", {})
        inline = critic.get("inline", {})
        
        assert inline.get("runTests") is True, "runTests should be enabled"
        assert "testCommand" in inline or "testTimeout" in inline, \
            "Should have test configuration"

    def test_pr_reviewer_no_critic(self):
        """PR reviewer should not need critic (read-only)."""
        profile_path = SAMPLES_DIR / "pr-reviewer" / "execution-profile.yaml"
        profile = load_yaml_file(profile_path)
        
        critic = profile["spec"].get("critic", {})
        # Either no critic or critic disabled
        assert not critic.get("enabled", False), \
            "PR reviewer should not have critic enabled (read-only operation)"


class TestToolPermissions:
    """Tests for tool permission configuration."""

    def test_pr_reviewer_has_readonly_tools(self):
        """PR reviewer should have read-only tools (no Write/Edit)."""
        profile_path = SAMPLES_DIR / "pr-reviewer" / "execution-profile.yaml"
        profile = load_yaml_file(profile_path)
        
        tools = profile["spec"]["sdkConfig"]["claude"]["allowedTools"]
        
        # Should have read tools
        assert "Read" in tools, "Should have Read tool"
        assert "Glob" in tools or "Grep" in tools, "Should have search tools"
        
        # Write and Edit should not be in the list for a reviewer
        # (Bash is allowed for git commands but that's acceptable)

    def test_feature_developer_has_write_tools(self):
        """Feature developer should have write tools."""
        profile_path = SAMPLES_DIR / "feature-developer" / "execution-profile.yaml"
        profile = load_yaml_file(profile_path)
        
        tools = profile["spec"]["sdkConfig"]["claude"]["allowedTools"]
        
        assert "Read" in tools, "Should have Read tool"
        assert "Edit" in tools or "Write" in tools, "Should have write capabilities"

    @pytest.mark.skip(reason="code-refactor sample not yet implemented")
    def test_code_refactor_has_write_tools(self):
        """Code refactor should have write tools."""
        profile_path = SAMPLES_DIR / "code-refactor" / "execution-profile.yaml"
        profile = load_yaml_file(profile_path)
        
        tools = profile["spec"]["sdkConfig"]["claude"]["allowedTools"]
        
        assert "Read" in tools, "Should have Read tool"
        assert "Edit" in tools, "Should have Edit tool for refactoring"

    @pytest.mark.parametrize("sample_name", ["pr-reviewer", "feature-developer"])
    def test_all_samples_have_skill_tool(self, sample_name: str):
        """All samples should have Skill tool for .claude/skills/ loading."""
        profile_path = SAMPLES_DIR / sample_name / "execution-profile.yaml"
        profile = load_yaml_file(profile_path)
        
        tools = profile["spec"]["sdkConfig"]["claude"]["allowedTools"]
        assert "Skill" in tools, f"{sample_name}: Should have Skill tool"


@pytest.mark.skip(reason="advanced sample not yet implemented")
class TestAdvancedSampleFeatures:
    """Tests for advanced sample specific features."""

    def test_advanced_has_subagents(self):
        """Advanced sample should have subagent configuration."""
        profile_path = SAMPLES_DIR / "advanced" / "execution-profile.yaml"
        profile = load_yaml_file(profile_path)
        
        claude = profile["spec"]["sdkConfig"]["claude"]
        assert "subagents" in claude, "Should have subagents config"
        
        subagents = claude["subagents"]
        assert "code-reviewer" in subagents, "Should have code-reviewer subagent"
        assert "test-writer" in subagents, "Should have test-writer subagent"
        
        # Check subagent structure
        for name, config in subagents.items():
            assert "description" in config, f"{name}: Should have description"
            assert "prompt" in config, f"{name}: Should have prompt"
            assert "tools" in config, f"{name}: Should have tools"

    def test_advanced_has_task_tool_for_subagents(self):
        """Advanced sample should have Task tool when subagents are configured."""
        profile_path = SAMPLES_DIR / "advanced" / "execution-profile.yaml"
        profile = load_yaml_file(profile_path)
        
        tools = profile["spec"]["sdkConfig"]["claude"]["allowedTools"]
        assert "Task" in tools, "Should have Task tool for subagents"

    def test_advanced_has_structured_output(self):
        """Advanced sample should have structured output configuration."""
        profile_path = SAMPLES_DIR / "advanced" / "execution-profile.yaml"
        profile = load_yaml_file(profile_path)
        
        claude = profile["spec"]["sdkConfig"]["claude"]
        assert "outputFormat" in claude, "Should have outputFormat config"
        
        output_format = claude["outputFormat"]
        assert output_format.get("type") == "json_schema", "Should use json_schema type"
        assert "schema" in output_format, "Should have schema defined"
        assert "properties" in output_format["schema"], "Schema should have properties"

    def test_advanced_has_file_checkpointing(self):
        """Advanced sample should have file checkpointing with rollback."""
        profile_path = SAMPLES_DIR / "advanced" / "execution-profile.yaml"
        profile = load_yaml_file(profile_path)
        
        claude = profile["spec"]["sdkConfig"]["claude"]
        assert "fileCheckpointing" in claude, "Should have fileCheckpointing config"
        
        fc = claude["fileCheckpointing"]
        assert fc.get("enabled") is True, "File checkpointing should be enabled"
        assert fc.get("rollbackOnCriticFailure") is True, "Should rollback on critic failure"

    def test_advanced_has_sandbox(self):
        """Advanced sample should have sandbox configuration."""
        profile_path = SAMPLES_DIR / "advanced" / "execution-profile.yaml"
        profile = load_yaml_file(profile_path)
        
        claude = profile["spec"]["sdkConfig"]["claude"]
        assert "sandbox" in claude, "Should have sandbox config"
        
        sandbox = claude["sandbox"]
        assert sandbox.get("enabled") is True, "Sandbox should be enabled"
        assert "excludedCommands" in sandbox, "Should have excluded commands"

    def test_advanced_has_declarative_hooks(self):
        """Advanced sample should have declarative security hooks."""
        profile_path = SAMPLES_DIR / "advanced" / "execution-profile.yaml"
        profile = load_yaml_file(profile_path)
        
        claude = profile["spec"]["sdkConfig"]["claude"]
        assert "hooks" in claude, "Should have hooks config"
        
        hooks = claude["hooks"]
        assert "presets" in hooks, "Should have presets"
        assert "block-dangerous-commands" in hooks["presets"], "Should have block-dangerous-commands preset"

    def test_advanced_has_system_prompt_preset(self):
        """Advanced sample should have system prompt preset configuration."""
        profile_path = SAMPLES_DIR / "advanced" / "execution-profile.yaml"
        profile = load_yaml_file(profile_path)
        
        claude = profile["spec"]["sdkConfig"]["claude"]
        assert "systemPrompt" in claude, "Should have systemPrompt config"
        
        sp = claude["systemPrompt"]
        assert sp.get("type") == "preset", "Should use preset type"
        assert sp.get("preset") == "claude_code", "Should use claude_code preset"
        assert "append" in sp, "Should have append content"

    def test_advanced_has_fallback_model(self):
        """Advanced sample should have fallback model configured."""
        profile_path = SAMPLES_DIR / "advanced" / "execution-profile.yaml"
        profile = load_yaml_file(profile_path)
        
        claude = profile["spec"]["sdkConfig"]["claude"]
        assert "fallbackModel" in claude, "Should have fallbackModel"
        assert claude["fallbackModel"], "Fallback model should not be empty"

    def test_advanced_has_inline_critic_with_test_validation(self):
        """Advanced sample should have inline critic with test validation."""
        profile_path = SAMPLES_DIR / "advanced" / "execution-profile.yaml"
        profile = load_yaml_file(profile_path)
        
        critic = profile["spec"].get("critic", {})
        assert critic.get("enabled") is True, "Critic should be enabled"
        assert critic.get("mode") == "inline", "Should use inline critic"
        
        inline = critic.get("inline", {})
        assert inline.get("runTests") is True, "Should run tests"
