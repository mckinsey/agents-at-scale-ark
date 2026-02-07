import os
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from ark_executor_common.base import Parameter
from ark_executor_common.git import (
    _to_bool,
    _mask_url,
    _build_auth_url,
    _build_git_env,
    GitConfig,
    has_changes,
    commit_changes,
    push_changes,
    commit_and_push,
    _cleanup_workspace,
)


class TestToBool:

    def test_bool_values(self):
        assert _to_bool(True) is True
        assert _to_bool(False) is False

    def test_string_true_values(self):
        assert _to_bool("true") is True
        assert _to_bool("True") is True
        assert _to_bool("1") is True
        assert _to_bool("yes") is True

    def test_string_false_values(self):
        assert _to_bool("false") is False
        assert _to_bool("0") is False
        assert _to_bool("no") is False
        assert _to_bool("") is False
        assert _to_bool("random") is False

    def test_numeric_values(self):
        assert _to_bool(1) is True
        assert _to_bool(0) is False

    def test_none(self):
        assert _to_bool(None) is False


class TestMaskUrl:

    def test_masks_https_credentials(self):
        url = "https://user:password@github.com/org/repo.git"
        assert _mask_url(url) == "https://***@github.com/org/repo.git"

    def test_masks_token_in_url(self):
        url = "https://x-access-token:ghp_abc123@github.com/org/repo.git"
        assert _mask_url(url) == "https://***@github.com/org/repo.git"

    def test_no_credentials_unchanged(self):
        url = "https://github.com/org/repo.git"
        assert _mask_url(url) == "https://github.com/org/repo.git"

    def test_ssh_url_unchanged(self):
        url = "git@github.com:org/repo.git"
        assert _mask_url(url) == "git@github.com:org/repo.git"

    def test_http_credentials_masked(self):
        url = "http://token@gitlab.com/org/repo.git"
        assert _mask_url(url) == "http://***@gitlab.com/org/repo.git"


class TestBuildAuthUrl:

    def test_github_url(self):
        url = "https://github.com/org/repo.git"
        result = _build_auth_url(url, "ghp_abc123")
        assert result == "https://x-access-token:ghp_abc123@github.com/org/repo.git"

    def test_gitlab_url(self):
        url = "https://gitlab.com/org/repo.git"
        result = _build_auth_url(url, "glpat_abc123")
        assert result == "https://oauth2:glpat_abc123@gitlab.com/org/repo.git"

    def test_generic_https_url(self):
        url = "https://bitbucket.org/org/repo.git"
        result = _build_auth_url(url, "token123")
        assert result == "https://token123@bitbucket.org/org/repo.git"

    def test_no_token_returns_original(self):
        url = "https://github.com/org/repo.git"
        assert _build_auth_url(url, "") == url
        assert _build_auth_url(url, None) == url

    def test_ssh_url_with_token_returns_original(self):
        url = "git@github.com:org/repo.git"
        assert _build_auth_url(url, "token") == url


class TestBuildGitEnv:

    def test_basic_env(self):
        config = GitConfig(url="https://github.com/org/repo.git")
        env = _build_git_env(config)
        assert env["GIT_TERMINAL_PROMPT"] == "0"
        assert env["GIT_ASKPASS"] == "echo"
        assert "GIT_SSH_COMMAND" not in env

    def test_ssh_key_env(self, tmp_path):
        key_path = tmp_path / "ssh_key"
        key_path.write_text("fake-key")
        config = GitConfig(
            url="git@github.com:org/repo.git",
            ssh_key_path=str(key_path),
        )
        env = _build_git_env(config)
        assert "GIT_SSH_COMMAND" in env
        assert str(key_path) in env["GIT_SSH_COMMAND"]
        assert "StrictHostKeyChecking=no" in env["GIT_SSH_COMMAND"]

    def test_ssh_strict_host_key(self, tmp_path):
        key_path = tmp_path / "ssh_key"
        key_path.write_text("fake-key")
        config = GitConfig(
            url="git@github.com:org/repo.git",
            ssh_key_path=str(key_path),
            ssh_strict_host_key=True,
        )
        env = _build_git_env(config)
        assert "StrictHostKeyChecking=no" not in env["GIT_SSH_COMMAND"]


class TestGitConfigFromLabelsAndParams:

    def test_from_labels(self):
        labels = {
            "git-repo-url": "https://github.com/org/repo.git",
            "git-branch": "develop",
            "git-path": "src",
        }
        config = GitConfig.from_labels_and_params(labels=labels)
        assert config is not None
        assert config.url == "https://github.com/org/repo.git"
        assert config.branch == "develop"
        assert config.path == "src"

    def test_from_parameters(self):
        params = [
            Parameter(name="git_repo_url", value="https://github.com/org/repo.git"),
            Parameter(name="git_branch", value="feature"),
        ]
        config = GitConfig.from_labels_and_params(parameters=params)
        assert config is not None
        assert config.url == "https://github.com/org/repo.git"
        assert config.branch == "feature"

    def test_params_override_labels(self):
        labels = {"git-repo-url": "https://label-url.git", "git-branch": "label-branch"}
        params = [Parameter(name="git_branch", value="param-branch")]
        config = GitConfig.from_labels_and_params(labels=labels, parameters=params)
        assert config.url == "https://label-url.git"
        assert config.branch == "param-branch"

    def test_no_url_returns_none(self):
        config = GitConfig.from_labels_and_params(labels={"git-branch": "main"})
        assert config is None

    def test_empty_inputs_returns_none(self):
        assert GitConfig.from_labels_and_params() is None
        assert GitConfig.from_labels_and_params(labels={}, parameters=[]) is None

    def test_sparse_paths_parsing(self):
        labels = {
            "git-repo-url": "https://github.com/org/repo.git",
            "git-sparse-paths": "src/main, tests, docs/api",
        }
        config = GitConfig.from_labels_and_params(labels=labels)
        assert config.sparse_paths == ["src/main", "tests", "docs/api"]

    def test_auto_push_enables_auto_commit(self):
        labels = {
            "git-repo-url": "https://github.com/org/repo.git",
            "git-auto-push": "true",
        }
        config = GitConfig.from_labels_and_params(labels=labels)
        assert config.auto_push is True
        assert config.auto_commit is True

    def test_depth_parsing(self):
        labels = {
            "git-repo-url": "https://github.com/org/repo.git",
            "git-depth": "0",
        }
        config = GitConfig.from_labels_and_params(labels=labels)
        assert config.depth == 0

    def test_invalid_depth_defaults_to_one(self):
        labels = {
            "git-repo-url": "https://github.com/org/repo.git",
            "git-depth": "invalid",
        }
        config = GitConfig.from_labels_and_params(labels=labels)
        assert config.depth == 1

    @patch.dict(os.environ, {"GIT_AUTH_TOKEN": "env-token"}, clear=False)
    def test_auth_token_from_env(self):
        labels = {"git-repo-url": "https://github.com/org/repo.git"}
        config = GitConfig.from_labels_and_params(labels=labels)
        assert config.auth_token == "env-token"

    @patch.dict(os.environ, {"GIT_USER_NAME": "Test User", "GIT_USER_EMAIL": "test@example.com"}, clear=False)
    def test_user_identity_from_env(self):
        labels = {"git-repo-url": "https://github.com/org/repo.git"}
        config = GitConfig.from_labels_and_params(labels=labels)
        assert config.user_name == "Test User"
        assert config.user_email == "test@example.com"

    def test_defaults(self):
        labels = {"git-repo-url": "https://github.com/org/repo.git"}
        config = GitConfig.from_labels_and_params(labels=labels)
        assert config.branch == "main"
        assert config.path == ""
        assert config.depth == 1
        assert config.auto_commit is False
        assert config.auto_push is False


class TestHasChanges:

    @pytest.mark.asyncio
    async def test_has_changes_with_changes(self):
        with patch("ark_executor_common.git._run_git_command", new_callable=AsyncMock) as mock_cmd:
            mock_cmd.return_value = (0, " M file.txt\n?? new.txt", "")
            assert await has_changes("/repo") is True

    @pytest.mark.asyncio
    async def test_has_changes_no_changes(self):
        with patch("ark_executor_common.git._run_git_command", new_callable=AsyncMock) as mock_cmd:
            mock_cmd.return_value = (0, "", "")
            assert await has_changes("/repo") is False

    @pytest.mark.asyncio
    async def test_has_changes_whitespace_only(self):
        with patch("ark_executor_common.git._run_git_command", new_callable=AsyncMock) as mock_cmd:
            mock_cmd.return_value = (0, "   ", "")
            assert await has_changes("/repo") is False


class TestCommitChanges:

    @pytest.mark.asyncio
    async def test_commit_when_changes_exist(self):
        config = GitConfig(url="https://github.com/org/repo.git", commit_message="test commit")
        with patch("ark_executor_common.git._run_git_command", new_callable=AsyncMock) as mock_cmd:
            mock_cmd.side_effect = [
                (0, " M file.txt", ""),
                (0, "", ""),
                (0, " file.txt | 1 +", ""),
                (0, "", ""),
            ]
            result = await commit_changes(config, "/repo")
            assert result is True
            assert mock_cmd.call_count == 4

    @pytest.mark.asyncio
    async def test_commit_no_changes(self):
        config = GitConfig(url="https://github.com/org/repo.git")
        with patch("ark_executor_common.git._run_git_command", new_callable=AsyncMock) as mock_cmd:
            mock_cmd.return_value = (0, "", "")
            result = await commit_changes(config, "/repo")
            assert result is False


class TestCommitAndPush:

    @pytest.mark.asyncio
    async def test_no_auto_flags_returns_false(self):
        config = GitConfig(url="https://github.com/org/repo.git")
        result = await commit_and_push(config, "/repo")
        assert result is False

    @pytest.mark.asyncio
    async def test_auto_commit_only(self):
        config = GitConfig(url="https://github.com/org/repo.git", auto_commit=True)
        with patch("ark_executor_common.git.commit_changes", new_callable=AsyncMock) as mock_commit:
            mock_commit.return_value = True
            result = await commit_and_push(config, "/repo")
            assert result is True
            mock_commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_auto_push_triggers_push(self):
        config = GitConfig(url="https://github.com/org/repo.git", auto_commit=True, auto_push=True)
        with (
            patch("ark_executor_common.git.commit_changes", new_callable=AsyncMock) as mock_commit,
            patch("ark_executor_common.git.push_changes", new_callable=AsyncMock) as mock_push,
        ):
            mock_commit.return_value = True
            mock_push.return_value = True
            result = await commit_and_push(config, "/repo")
            assert result is True
            mock_push.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_auto_push_skipped_when_no_commit(self):
        config = GitConfig(url="https://github.com/org/repo.git", auto_commit=True, auto_push=True)
        with (
            patch("ark_executor_common.git.commit_changes", new_callable=AsyncMock) as mock_commit,
            patch("ark_executor_common.git.push_changes", new_callable=AsyncMock) as mock_push,
        ):
            mock_commit.return_value = False
            result = await commit_and_push(config, "/repo")
            assert result is False
            mock_push.assert_not_awaited()


class TestCleanupWorkspace:

    def test_cleanup_existing_dir(self, tmp_path):
        ws_dir = tmp_path / "workspace"
        ws_dir.mkdir()
        (ws_dir / "file.txt").write_text("content")
        _cleanup_workspace(str(ws_dir))
        assert not ws_dir.exists()

    def test_cleanup_nonexistent_dir(self, tmp_path):
        _cleanup_workspace(str(tmp_path / "nonexistent"))

    def test_cleanup_handles_error(self, tmp_path):
        with patch("shutil.rmtree", side_effect=OSError("permission denied")):
            with patch("os.path.exists", return_value=True):
                _cleanup_workspace(str(tmp_path))
