import os

import pytest

from executor_claude_cli.config import EngineConfig


class TestEngineConfig:
    def test_defaults(self):
        config = EngineConfig()
        assert config.workspace_dir == "/workspace"
        assert config.allowed_tools == ["Read", "Write", "Edit", "Bash", "Glob", "Grep"]
        assert config.permission_mode == "acceptEdits"
        assert config.max_turns == 25
        assert config.max_budget_usd is None
        assert config.supported_models == ["anthropic", "bedrock", "vertex"]
        assert config.port == 8000
        assert config.host == "0.0.0.0"
        assert config.mock_mode is False

    def test_from_env(self, monkeypatch):
        monkeypatch.setenv("WORKSPACE_DIR", "/custom/workspace")
        monkeypatch.setenv("ALLOWED_TOOLS", "Read,Bash")
        monkeypatch.setenv("PERMISSION_MODE", "bypassPermissions")
        monkeypatch.setenv("MAX_TURNS", "50")
        monkeypatch.setenv("MAX_BUDGET_USD", "10.5")
        monkeypatch.setenv("PORT", "3000")
        monkeypatch.setenv("HOST", "127.0.0.1")
        monkeypatch.setenv("MOCK_MODE", "true")
        monkeypatch.setenv("MOCK_RESPONSE", "custom mock")

        config = EngineConfig.from_env()

        assert config.workspace_dir == "/custom/workspace"
        assert config.allowed_tools == ["Read", "Bash"]
        assert config.permission_mode == "bypassPermissions"
        assert config.max_turns == 50
        assert config.max_budget_usd == 10.5
        assert config.port == 3000
        assert config.host == "127.0.0.1"
        assert config.mock_mode is True
        assert config.mock_response == "custom mock"

    def test_from_env_defaults(self, monkeypatch):
        for key in [
            "WORKSPACE_DIR", "ALLOWED_TOOLS", "PERMISSION_MODE",
            "MAX_TURNS", "MAX_BUDGET_USD", "PORT", "HOST",
            "MOCK_MODE", "MOCK_RESPONSE",
        ]:
            monkeypatch.delenv(key, raising=False)

        config = EngineConfig.from_env()
        assert config.workspace_dir == "/workspace"
        assert config.mock_mode is False

    def test_mock_mode_variations(self, monkeypatch):
        for val in ("true", "True", "TRUE", "1", "yes"):
            monkeypatch.setenv("MOCK_MODE", val)
            config = EngineConfig.from_env()
            assert config.mock_mode is True, f"Failed for MOCK_MODE={val}"

        for val in ("false", "0", "no", ""):
            monkeypatch.setenv("MOCK_MODE", val)
            config = EngineConfig.from_env()
            assert config.mock_mode is False, f"Failed for MOCK_MODE={val}"
