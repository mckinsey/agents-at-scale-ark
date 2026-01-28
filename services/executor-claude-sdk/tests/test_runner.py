"""Tests for the ClaudeSdkRunner class."""

import os
import pytest
from unittest.mock import Mock

from claude_sdk_executor.sdk.runner import ClaudeSdkRunner


class TestPrepareModelEnv:
    """Tests for _prepare_model_env()."""

    def test_anthropic_with_gateway(self, monkeypatch):
        """Test anthropic type with apiKey and baseUrl."""
        monkeypatch.setenv("PATH", "/usr/bin")
        runner = ClaudeSdkRunner()
        model = Mock()
        model.type = "anthropic"
        model.name = "claude-sonnet-4"
        model.config = {
            "anthropic": {
                "apiKey": "test-key",
                "baseUrl": "https://gateway.example.com"
            }
        }

        env = runner._prepare_model_env(model)

        assert env["ANTHROPIC_API_KEY"] == "test-key"
        assert env["ANTHROPIC_BASE_URL"] == "https://gateway.example.com"
        assert env["DISABLE_TELEMETRY"] == "1"
        assert env["DISABLE_ERROR_REPORTING"] == "1"
        assert "PATH" in env

    def test_anthropic_without_base_url(self, monkeypatch):
        """Test anthropic type without baseUrl (direct API)."""
        monkeypatch.setenv("PATH", "/usr/bin")
        monkeypatch.delenv("ANTHROPIC_BASE_URL", raising=False)
        runner = ClaudeSdkRunner()
        model = Mock()
        model.type = "anthropic"
        model.name = "claude-sonnet-4"
        model.config = {
            "anthropic": {
                "apiKey": "direct-api-key"
            }
        }

        env = runner._prepare_model_env(model)

        assert env["ANTHROPIC_API_KEY"] == "direct-api-key"
        assert "ANTHROPIC_BASE_URL" not in env
        assert env["DISABLE_TELEMETRY"] == "1"

    def test_anthropic_missing_api_key(self):
        """Test that missing apiKey raises ValueError."""
        runner = ClaudeSdkRunner()
        model = Mock()
        model.type = "anthropic"
        model.name = "claude-sonnet-4"
        model.config = {"anthropic": {}}

        with pytest.raises(ValueError, match="apiKey is required"):
            runner._prepare_model_env(model)

    def test_anthropic_empty_config(self):
        """Test that empty anthropic config raises ValueError."""
        runner = ClaudeSdkRunner()
        model = Mock()
        model.type = "anthropic"
        model.name = "claude-sonnet-4"
        model.config = {}

        with pytest.raises(ValueError, match="apiKey is required"):
            runner._prepare_model_env(model)

    def test_bedrock(self, monkeypatch):
        """Test bedrock type sets correct env vars."""
        monkeypatch.setenv("PATH", "/usr/bin")
        runner = ClaudeSdkRunner()
        model = Mock()
        model.type = "bedrock"
        model.name = "anthropic.claude-3-5-sonnet"
        model.config = {"bedrock": {"region": "us-west-2"}}

        env = runner._prepare_model_env(model)

        assert env["CLAUDE_CODE_USE_BEDROCK"] == "1"
        assert env["AWS_REGION"] == "us-west-2"
        assert env["DISABLE_TELEMETRY"] == "1"

    def test_bedrock_without_region(self, monkeypatch):
        """Test bedrock type without region uses default."""
        monkeypatch.setenv("PATH", "/usr/bin")
        runner = ClaudeSdkRunner()
        model = Mock()
        model.type = "bedrock"
        model.name = "anthropic.claude-3-5-sonnet"
        model.config = {"bedrock": {}}

        env = runner._prepare_model_env(model)

        assert env["CLAUDE_CODE_USE_BEDROCK"] == "1"
        assert "AWS_REGION" not in env

    def test_vertex(self, monkeypatch):
        """Test vertex type sets correct env vars."""
        monkeypatch.setenv("PATH", "/usr/bin")
        runner = ClaudeSdkRunner()
        model = Mock()
        model.type = "vertex"
        model.name = "claude-3-5-sonnet@20241022"
        model.config = {
            "vertex": {
                "project": "my-gcp-project",
                "region": "us-central1"
            }
        }

        env = runner._prepare_model_env(model)

        assert env["CLAUDE_CODE_USE_VERTEX"] == "1"
        assert env["ANTHROPIC_VERTEX_PROJECT_ID"] == "my-gcp-project"
        assert env["CLOUD_ML_REGION"] == "us-central1"
        assert env["DISABLE_TELEMETRY"] == "1"

    def test_vertex_without_project(self, monkeypatch):
        """Test vertex type without project or region."""
        monkeypatch.setenv("PATH", "/usr/bin")
        runner = ClaudeSdkRunner()
        model = Mock()
        model.type = "vertex"
        model.name = "claude-3-5-sonnet@20241022"
        model.config = {"vertex": {}}

        env = runner._prepare_model_env(model)

        assert env["CLAUDE_CODE_USE_VERTEX"] == "1"
        assert "ANTHROPIC_VERTEX_PROJECT_ID" not in env
        assert "CLOUD_ML_REGION" not in env

    def test_azure_foundry(self, monkeypatch):
        """Test azure-foundry type sets correct env vars."""
        monkeypatch.setenv("PATH", "/usr/bin")
        runner = ClaudeSdkRunner()
        model = Mock()
        model.type = "azure-foundry"
        model.name = "claude-sonnet-4"
        model.config = {"azure-foundry": {}}

        env = runner._prepare_model_env(model)

        assert env["CLAUDE_CODE_USE_FOUNDRY"] == "1"
        assert env["DISABLE_TELEMETRY"] == "1"

    def test_missing_model(self):
        """Test that None model raises ValueError."""
        runner = ClaudeSdkRunner()

        with pytest.raises(ValueError, match="Model is required"):
            runner._prepare_model_env(None)

    def test_missing_type(self):
        """Test that missing type raises ValueError."""
        runner = ClaudeSdkRunner()
        model = Mock()
        model.type = None
        model.name = "test"
        model.config = {}

        with pytest.raises(ValueError, match="Model type is required"):
            runner._prepare_model_env(model)

    def test_missing_name(self):
        """Test that missing name raises ValueError."""
        runner = ClaudeSdkRunner()
        model = Mock()
        model.type = "anthropic"
        model.name = None
        model.config = {}

        with pytest.raises(ValueError, match="Model name is required"):
            runner._prepare_model_env(model)

    def test_unsupported_type(self):
        """Test that unsupported type raises ValueError."""
        runner = ClaudeSdkRunner()
        model = Mock()
        model.type = "openai"
        model.name = "gpt-4"
        model.config = {}

        with pytest.raises(ValueError, match="Unsupported model type: openai"):
            runner._prepare_model_env(model)

    def test_none_config_treated_as_empty(self):
        """Test that None config is treated as empty dict."""
        runner = ClaudeSdkRunner()
        model = Mock()
        model.type = "anthropic"
        model.name = "claude-sonnet-4"
        model.config = None

        with pytest.raises(ValueError, match="apiKey is required"):
            runner._prepare_model_env(model)

    def test_inherits_os_environ(self, monkeypatch):
        """Test that env dict inherits from os.environ."""
        monkeypatch.setenv("MY_CUSTOM_VAR", "custom_value")
        monkeypatch.setenv("PATH", "/usr/bin")

        runner = ClaudeSdkRunner()
        model = Mock()
        model.type = "anthropic"
        model.name = "claude-sonnet-4"
        model.config = {"anthropic": {"apiKey": "test-key"}}

        env = runner._prepare_model_env(model)

        assert env["MY_CUSTOM_VAR"] == "custom_value"
        assert env["PATH"] == "/usr/bin"
