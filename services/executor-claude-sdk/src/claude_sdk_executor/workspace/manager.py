"""Workspace lifecycle manager."""

import logging
import os
import shutil
import tempfile
from typing import Optional

from ..profile.resolver import WorkspaceConfig
from .git import GitWorkspace

logger = logging.getLogger(__name__)


class WorkspaceManager:
    """Manages workspace lifecycle for agent execution.
    
    Creates, manages, and cleans up workspaces where agents perform
    file operations. Supports git and filesystem workspace types.
    """

    def __init__(self, base_dir: Optional[str] = None) -> None:
        """Initialize workspace manager.
        
        Args:
            base_dir: Base directory for workspaces, defaults to /workspace or temp
        """
        self.base_dir = base_dir or os.environ.get("WORKSPACE_DIR", "/workspace")
        if not os.path.exists(self.base_dir):
            self.base_dir = tempfile.gettempdir()
        self._workspaces: dict[str, str] = {}

    async def create(self, config: WorkspaceConfig, query_id: str) -> str:
        """Create a new workspace for execution.
        
        Args:
            config: Workspace configuration from profile
            query_id: Unique query identifier for naming
            
        Returns:
            Path to the created workspace directory
        """
        workspace_path = os.path.join(self.base_dir, f"workspace-{query_id}")
        
        # Clean up if exists
        if os.path.exists(workspace_path):
            shutil.rmtree(workspace_path)
        
        os.makedirs(workspace_path, exist_ok=True)
        self._workspaces[query_id] = workspace_path
        
        logger.info(f"Created workspace at {workspace_path}")
        return workspace_path

    async def get_diff(self, workspace_path: str) -> str:
        """Get git diff for the workspace.
        
        Args:
            workspace_path: Path to the workspace
            
        Returns:
            Git diff output as string
        """
        git = GitWorkspace(workspace_path)
        return await git.get_diff()

    async def get_diff_summary(self, workspace_path: str) -> str:
        """Get git diff --stat summary for the workspace.
        
        Args:
            workspace_path: Path to the workspace
            
        Returns:
            Git diff --stat output as string
        """
        git = GitWorkspace(workspace_path)
        return await git.get_diff_stat()

    async def cleanup(self, workspace_path: str) -> None:
        """Clean up a workspace after execution.
        
        Args:
            workspace_path: Path to the workspace to clean up
        """
        try:
            if os.path.exists(workspace_path):
                shutil.rmtree(workspace_path)
                logger.info(f"Cleaned up workspace at {workspace_path}")
        except Exception as e:
            logger.warning(f"Failed to cleanup workspace {workspace_path}: {e}")

    async def cleanup_all(self) -> None:
        """Clean up all workspaces."""
        for query_id, workspace_path in list(self._workspaces.items()):
            await self.cleanup(workspace_path)
            del self._workspaces[query_id]
