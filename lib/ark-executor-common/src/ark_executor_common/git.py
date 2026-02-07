"""Git repository cloning utilities for Ark execution engines."""

import asyncio
import logging
import os
import re
import shutil
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

HTTPS_PREFIX = "https://"
DEFAULT_SSH_KEY_PATH = "/secrets/git-ssh-key"
DEFAULT_COMMIT_MESSAGE = "Changes by Ark agent"
CREDENTIALS_PATTERN = re.compile(r"(https?://)([^@]+)@")


def _to_bool(val: Any) -> bool:
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.lower() in ("true", "1", "yes")
    return bool(val)


def _mask_url(url: str) -> str:
    """Remove credentials from URL for safe logging."""
    return CREDENTIALS_PATTERN.sub(r"\1***@", url)


@dataclass
class GitConfig:
    url: str
    branch: str = "main"
    path: str = ""
    sparse_paths: Optional[List[str]] = None
    depth: int = 1  # 1 = shallow clone, 0 = full history
    auth_token: Optional[str] = None
    ssh_key_path: Optional[str] = None
    ssh_strict_host_key: bool = False
    user_name: str = "Ark Agent"
    user_email: str = "ark-agent@noreply.github.com"
    auto_commit: bool = False
    auto_push: bool = False
    commit_message: str = DEFAULT_COMMIT_MESSAGE
    push_branch: Optional[str] = None

    @classmethod
    def from_labels_and_params(
        cls,
        labels: Optional[Dict[str, str]] = None,
        parameters: Optional[List[Any]] = None,
    ) -> Optional["GitConfig"]:
        labels = labels or {}
        params = {p.name: p.value for p in (parameters or [])}

        url = params.get("git_repo_url") or labels.get("git-repo-url", "")
        if not url:
            return None

        branch = params.get("git_branch") or labels.get("git-branch", "main")
        path = params.get("git_path") or labels.get("git-path", "")
        sparse_paths_raw = params.get("git_sparse_paths") or labels.get("git-sparse-paths", "")
        sparse_paths = [p.strip() for p in sparse_paths_raw.split(",") if p.strip()] if sparse_paths_raw else None

        auto_push = _to_bool(params.get("git_auto_push") or labels.get("git-auto-push", "false"))
        auto_commit = _to_bool(params.get("git_auto_commit") or labels.get("git-auto-commit", "false"))
        if auto_push:
            auto_commit = True

        depth_str = params.get("git_depth") or labels.get("git-depth", "1")
        try:
            depth = int(depth_str)
        except (ValueError, TypeError):
            depth = 1

        auth_token = os.environ.get("GIT_AUTH_TOKEN")

        ssh_key_path = os.environ.get("GIT_SSH_KEY_PATH")
        if not ssh_key_path and os.path.exists(DEFAULT_SSH_KEY_PATH):
            ssh_key_path = DEFAULT_SSH_KEY_PATH

        ssh_strict_host_key = _to_bool(os.environ.get("GIT_SSH_STRICT_HOST_KEY", "false"))

        user_name = os.environ.get("GIT_USER_NAME", "Ark Agent")
        user_email = os.environ.get("GIT_USER_EMAIL", "ark-agent@noreply.github.com")
        commit_message = params.get("git_commit_message") or labels.get("git-commit-message", DEFAULT_COMMIT_MESSAGE)
        push_branch = params.get("git_push_branch") or labels.get("git-push-branch") or None

        return cls(
            url=url,
            branch=branch,
            path=path,
            sparse_paths=sparse_paths,
            depth=depth,
            auth_token=auth_token,
            ssh_key_path=ssh_key_path,
            ssh_strict_host_key=ssh_strict_host_key,
            user_name=user_name,
            user_email=user_email,
            auto_commit=auto_commit,
            auto_push=auto_push,
            commit_message=commit_message,
            push_branch=push_branch,
        )


def _build_git_env(config: GitConfig) -> Dict[str, str]:
    env = {
        "GIT_TERMINAL_PROMPT": "0",
        "GIT_ASKPASS": "echo",
    }
    if config.ssh_key_path and os.path.exists(config.ssh_key_path):
        ssh_opts = f"ssh -i {config.ssh_key_path}"
        if not config.ssh_strict_host_key:
            ssh_opts += " -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
        env["GIT_SSH_COMMAND"] = ssh_opts
    return env


async def _run_git_command(
    args: List[str],
    cwd: Optional[str] = None,
    env: Optional[Dict[str, str]] = None,
    check: bool = True,
) -> Tuple[int, str, str]:
    full_env = os.environ.copy()
    if env:
        full_env.update(env)

    proc = await asyncio.create_subprocess_exec(
        "git",
        *args,
        cwd=cwd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=full_env,
    )
    stdout, stderr = await proc.communicate()
    stdout_str = stdout.decode().strip()
    stderr_str = stderr.decode().strip()

    if check and proc.returncode != 0:
        safe_args = [_mask_url(arg) for arg in args]
        error_msg = _mask_url(stderr_str or stdout_str)
        raise RuntimeError(f"Git command failed: git {' '.join(safe_args)}: {error_msg}")

    return proc.returncode, stdout_str, stderr_str


def _build_auth_url(url: str, token: str) -> str:
    if token and url.startswith(HTTPS_PREFIX):
        if "github.com" in url:
            return url.replace(HTTPS_PREFIX, f"https://x-access-token:{token}@")
        elif "gitlab" in url:
            return url.replace(HTTPS_PREFIX, f"https://oauth2:{token}@")
        else:
            return url.replace(HTTPS_PREFIX, f"https://{token}@")
    return url


async def _configure_git_identity(config: GitConfig, repo_path: str, env: Dict[str, str]) -> None:
    await _run_git_command(["config", "user.name", config.user_name], cwd=repo_path, env=env)
    await _run_git_command(["config", "user.email", config.user_email], cwd=repo_path, env=env)


async def clone_repository(config: GitConfig, workspace: str) -> str:
    target_path = os.path.join(workspace, config.path) if config.path else workspace

    if os.path.exists(target_path) and os.listdir(target_path):
        logger.info(f"Cleaning existing workspace at {target_path}")
        shutil.rmtree(target_path)

    os.makedirs(target_path, exist_ok=True)

    clone_env = _build_git_env(config)
    auth_url = _build_auth_url(config.url, config.auth_token) if config.auth_token else config.url

    if config.sparse_paths:
        await _sparse_clone(auth_url, config, target_path, clone_env)
    else:
        await _full_clone(auth_url, config, target_path, clone_env)

    if config.auto_commit or config.auto_push:
        await _configure_git_identity(config, target_path, clone_env)

    logger.info(f"Successfully cloned {_mask_url(config.url)} (branch: {config.branch}) to {target_path}")
    return target_path


async def _full_clone(url: str, config: GitConfig, target_path: str, env: Dict[str, str]) -> None:
    clone_args = ["clone", "--single-branch", "-b", config.branch]
    if config.depth > 0:
        clone_args.extend(["--depth", str(config.depth)])
    clone_args.extend([url, "."])

    await _run_git_command(clone_args, cwd=target_path, env=env)


async def _sparse_clone(url: str, config: GitConfig, target_path: str, env: Dict[str, str]) -> None:
    await _run_git_command(["init"], cwd=target_path, env=env)
    await _run_git_command(["remote", "add", "origin", url], cwd=target_path, env=env)
    await _run_git_command(["config", "core.sparseCheckout", "true"], cwd=target_path, env=env)

    sparse_checkout_file = os.path.join(target_path, ".git", "info", "sparse-checkout")
    os.makedirs(os.path.dirname(sparse_checkout_file), exist_ok=True)
    with open(sparse_checkout_file, "w") as f:
        for path in config.sparse_paths:
            f.write(f"{path}\n")

    fetch_args = ["fetch", "origin", config.branch]
    if config.depth > 0:
        fetch_args.extend(["--depth", str(config.depth)])
    await _run_git_command(fetch_args, cwd=target_path, env=env)

    await _run_git_command(["checkout", config.branch], cwd=target_path, env=env)


async def has_changes(repo_path: str, env: Optional[Dict[str, str]] = None) -> bool:
    _, stdout, _ = await _run_git_command(["status", "--porcelain"], cwd=repo_path, env=env, check=False)
    return bool(stdout.strip())


async def commit_changes(config: GitConfig, repo_path: str) -> bool:
    env = _build_git_env(config)

    if not await has_changes(repo_path, env):
        logger.info("No changes to commit")
        return False

    await _run_git_command(["add", "-A"], cwd=repo_path, env=env)

    _, stdout, _ = await _run_git_command(["diff", "--cached", "--stat"], cwd=repo_path, env=env, check=False)
    if not stdout.strip():
        logger.info("No staged changes to commit")
        return False

    await _run_git_command(["commit", "-m", config.commit_message], cwd=repo_path, env=env)
    logger.info(f"Committed changes: {config.commit_message}")
    return True


async def push_changes(config: GitConfig, repo_path: str) -> bool:
    env = _build_git_env(config)

    push_branch = config.push_branch or config.branch
    push_args = ["push", "origin", f"HEAD:{push_branch}"]

    await _run_git_command(push_args, cwd=repo_path, env=env)
    logger.info(f"Pushed changes to {push_branch}")
    return True


async def commit_and_push(config: GitConfig, repo_path: str) -> bool:
    if not config.auto_commit and not config.auto_push:
        return False

    committed = False
    if config.auto_commit:
        committed = await commit_changes(config, repo_path)

    if config.auto_push and committed:
        await push_changes(config, repo_path)
        return True

    return committed


@dataclass
class GitWorkspaceResult:
    config: GitConfig
    repo_path: str
    isolated_root: Optional[str] = field(default=None)


async def prepare_workspace_with_git(
    workspace: str,
    labels: Optional[Dict[str, str]] = None,
    parameters: Optional[List[Any]] = None,
    query_id: Optional[str] = None,
) -> Optional[GitWorkspaceResult]:
    config = GitConfig.from_labels_and_params(labels, parameters)
    if not config:
        logger.debug("No git repository configured, skipping clone")
        return None

    isolation_id = query_id or str(uuid.uuid4())
    isolated_workspace = os.path.join(workspace, isolation_id)
    logger.info(f"Using isolated workspace: {isolated_workspace}")

    try:
        repo_path = await clone_repository(config, isolated_workspace)
        return GitWorkspaceResult(config=config, repo_path=repo_path, isolated_root=isolated_workspace)
    except Exception as e:
        logger.error(f"Failed to clone git repository: {e}")
        _cleanup_workspace(isolated_workspace)
        raise


async def finalize_workspace_git(result: Optional[GitWorkspaceResult]) -> None:
    if not result:
        return

    try:
        await commit_and_push(result.config, result.repo_path)
    except Exception as e:
        logger.error(f"Failed to commit/push git changes: {e}")
        raise
    finally:
        if result.isolated_root:
            _cleanup_workspace(result.isolated_root)


def _cleanup_workspace(path: str) -> None:
    try:
        if os.path.exists(path):
            shutil.rmtree(path)
            logger.info(f"Cleaned up workspace at {path}")
    except Exception as e:
        logger.warning(f"Failed to cleanup workspace at {path}: {e}")
