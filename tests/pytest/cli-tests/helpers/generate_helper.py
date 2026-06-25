import shutil
import subprocess
from typing import List, Optional, Tuple

import pexpect


class GenerateHelper:
    """Drives the `ark generate` CLI and validates generated manifests."""

    def __init__(self, namespace: str = "default"):
        self.namespace = namespace
        self.ark = shutil.which("ark")

    def _run(self, cmd: List[str], timeout: int = 120) -> Tuple[bool, str, str]:
        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=timeout
            )
        except subprocess.TimeoutExpired:
            return False, "", f"Command timed out after {timeout}s"
        return result.returncode == 0, result.stdout, result.stderr

    def generate_project(
        self,
        name: str,
        parent_dir: str,
        selected_models: str,
        project_type: str = "with-samples",
    ) -> Tuple[bool, str, str]:
        return self._run(
            [
                self.ark, "generate", "project", name,
                "--project-type", project_type,
                "--namespace", name,
                "--selected-models", selected_models,
                "--skip-git",
                "--no-interactive",
                "--destination", parent_dir,
            ]
        )

    def _drive(
        self,
        args: List[str],
        interactions: List[Tuple[str, str]],
        cwd: str,
        timeout: int = 60,
    ) -> Tuple[Optional[int], str]:
        child = pexpect.spawn(
            self.ark, list(args), cwd=cwd, timeout=timeout, encoding="utf-8"
        )
        try:
            for pattern, keys in interactions:
                child.expect(pattern)
                child.send(keys)
            child.expect(pexpect.EOF)
        finally:
            child.close()
        return child.exitstatus, child.before or ""

    def generate_query(self, name: str, project_dir: str) -> Tuple[Optional[int], str]:
        return self._drive(
            ["generate", "query", name, "--no-interactive"],
            [("target", "\r"), ("Which", "\r"), ("message", "\r")],
            cwd=project_dir,
        )

    def generate_agent(self, name: str, project_dir: str) -> Tuple[Optional[int], str]:
        return self._drive(
            ["generate", "agent", name, "--no-interactive"],
            [("sample query", "\r")],
            cwd=project_dir,
        )

    def generate_team(self, name: str, project_dir: str) -> Tuple[Optional[int], str]:
        return self._drive(
            ["generate", "team", name, "--no-interactive"],
            [
                ("strategy", "\r"),
                ("Select team members", "\r"),
                ("Select team members", "\x1b[B\r"),
                ("sample query", "\r"),
            ],
            cwd=project_dir,
        )

    def dry_run_apply(self, manifest_path: str) -> Tuple[bool, str]:
        ok, out, err = self._run(
            [
                "kubectl", "apply", "--dry-run=server",
                "-n", self.namespace, "-f", manifest_path,
            ],
            timeout=60,
        )
        return ok, (err or out)
