"""Git workspace operations."""

import asyncio
import logging
import os
import subprocess
from typing import Optional, List

logger = logging.getLogger(__name__)


class GitWorkspace:
    """Git operations for a workspace directory.
    
    Provides async wrappers around git commands for cloning,
    branching, committing, and pushing changes.
    """

    def __init__(self, workspace_path: str) -> None:
        """Initialize git workspace.
        
        Args:
            workspace_path: Path to the workspace directory
        """
        self.workspace_path = workspace_path

    def _inject_github_auth(self, repo_url: str) -> str:
        """Inject GitHub token into HTTPS URL for authentication.
        
        Args:
            repo_url: Git repository URL
            
        Returns:
            URL with authentication if token is available, otherwise original URL
        """
        github_token = os.environ.get("GITHUB_TOKEN")
        if not github_token:
            return repo_url
        
        # Only modify GitHub HTTPS URLs
        if "github.com" in repo_url and repo_url.startswith("https://"):
            # Transform https://github.com/org/repo.git to https://token@github.com/org/repo.git
            authenticated_url = repo_url.replace("https://", f"https://x-access-token:{github_token}@")
            logger.debug("Injected GitHub token for authentication")
            return authenticated_url
        
        return repo_url

    async def _run_git(self, args: List[str], check: bool = True) -> subprocess.CompletedProcess:
        """Run a git command in the workspace.
        
        Args:
            args: Git command arguments (without 'git' prefix)
            check: Whether to raise on non-zero exit code
            
        Returns:
            CompletedProcess with stdout and stderr
        """
        cmd = ["git"] + args
        logger.debug(f"Running: {' '.join(cmd)} in {self.workspace_path}")
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=self.workspace_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()
        
        result = subprocess.CompletedProcess(
            args=cmd,
            returncode=process.returncode,
            stdout=stdout.decode() if stdout else "",
            stderr=stderr.decode() if stderr else "",
        )
        
        if check and result.returncode != 0:
            logger.error(f"Git command failed: {result.stderr}")
            raise subprocess.CalledProcessError(
                result.returncode, cmd, result.stdout, result.stderr
            )
        
        return result

    async def clone(
        self,
        repo_url: str,
        branch: str = "main",
        depth: Optional[int] = None,
        ref: Optional[str] = None,
    ) -> None:
        """Clone a repository.
        
        Args:
            repo_url: Git repository URL
            branch: Branch to clone
            depth: Shallow clone depth (None for full clone)
            ref: Specific ref to checkout after clone
        """
        # Inject GitHub token for HTTPS authentication if available
        authenticated_url = self._inject_github_auth(repo_url)
        
        args = ["clone", "--branch", branch]
        if depth:
            args.extend(["--depth", str(depth)])
        args.extend([authenticated_url, self.workspace_path])
        
        # Clone to parent, then move contents
        parent = os.path.dirname(self.workspace_path)
        temp_dir = f"{self.workspace_path}-temp"
        
        clone_cmd = ["git", "clone", "--branch", branch]
        if depth:
            clone_cmd.extend(["--depth", str(depth)])
        clone_cmd.extend([authenticated_url, temp_dir])
        
        process = await asyncio.create_subprocess_exec(
            *clone_cmd,
            cwd=parent,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            raise subprocess.CalledProcessError(
                process.returncode, clone_cmd, stdout.decode(), stderr.decode()
            )
        
        # Move contents to workspace path
        import shutil
        if os.path.exists(self.workspace_path):
            shutil.rmtree(self.workspace_path)
        shutil.move(temp_dir, self.workspace_path)
        
        logger.info(f"Cloned {repo_url} to {self.workspace_path}")
        
        # Set the remote URL with auth for subsequent pushes
        if authenticated_url != repo_url:
            await self._run_git(["remote", "set-url", "origin", authenticated_url])
        
        # Checkout specific ref if provided
        if ref:
            await self.checkout(ref)

    async def create_branch(self, branch_name: str) -> None:
        """Create and checkout a new branch.
        
        Args:
            branch_name: Name of the new branch
        """
        await self._run_git(["checkout", "-b", branch_name])
        logger.info(f"Created branch {branch_name}")

    async def checkout(self, ref: str) -> None:
        """Checkout a branch or ref.
        
        Args:
            ref: Branch name, tag, or commit SHA
        """
        await self._run_git(["checkout", ref])
        logger.info(f"Checked out {ref}")

    async def fetch(self, ref: Optional[str] = None, remote: str = "origin") -> None:
        """Fetch from remote.
        
        Args:
            ref: Specific ref to fetch (None for all)
            remote: Remote name
        """
        args = ["fetch", remote]
        if ref:
            args.append(ref)
        await self._run_git(args)
        logger.info(f"Fetched from {remote}")

    async def add_all(self) -> None:
        """Stage all changes."""
        await self._run_git(["add", "-A"])

    async def commit(self, message: str) -> bool:
        """Commit staged changes.
        
        Args:
            message: Commit message
            
        Returns:
            True if commit was made, False if nothing to commit
        """
        # Check if there are changes to commit
        result = await self._run_git(["status", "--porcelain"], check=False)
        if not result.stdout.strip():
            logger.info("No changes to commit")
            return False
        
        await self.add_all()
        
        # Configure git user if not set
        await self._run_git(["config", "user.email", "agent@ark.mckinsey.com"], check=False)
        await self._run_git(["config", "user.name", "Ark Agent"], check=False)
        
        await self._run_git(["commit", "-m", message])
        logger.info("Committed changes")
        return True

    async def push(self, remote: str = "origin", force: bool = False) -> None:
        """Push to remote.
        
        Args:
            remote: Remote name
            force: Force push
        """
        # Get current branch name
        result = await self._run_git(["rev-parse", "--abbrev-ref", "HEAD"])
        branch = result.stdout.strip()
        
        args = ["push", "-u", remote, branch]
        if force:
            args.insert(1, "--force")
        
        await self._run_git(args)
        logger.info(f"Pushed to {remote}/{branch}")

    async def get_diff(self) -> str:
        """Get full diff of uncommitted changes.
        
        Returns:
            Git diff output
        """
        result = await self._run_git(["diff", "HEAD"], check=False)
        return result.stdout

    async def get_diff_stat(self) -> str:
        """Get diff --stat summary.
        
        Returns:
            Git diff --stat output
        """
        result = await self._run_git(["diff", "--stat", "HEAD"], check=False)
        return result.stdout

    async def get_current_branch(self) -> str:
        """Get current branch name.
        
        Returns:
            Current branch name
        """
        result = await self._run_git(["rev-parse", "--abbrev-ref", "HEAD"])
        return result.stdout.strip()

    async def has_changes(self) -> bool:
        """Check if there are uncommitted changes.
        
        Returns:
            True if there are changes
        """
        result = await self._run_git(["status", "--porcelain"], check=False)
        return bool(result.stdout.strip())
