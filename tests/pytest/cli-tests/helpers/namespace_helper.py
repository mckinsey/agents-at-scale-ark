import subprocess
from typing import List, Tuple

from helpers.agents_helper import AgentsHelper


class NamespaceHelper:
    def _run_cmd(self, cmd: List[str], timeout: int = 30, check: bool = True) -> Tuple[bool, str, str]:
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=check
            )
            return (result.returncode == 0, result.stdout, result.stderr)
        except subprocess.TimeoutExpired:
            return (False, "", f"Command timed out after {timeout}s")
        except subprocess.CalledProcessError as e:
            return (False, e.stdout, e.stderr)
        except Exception as e:
            return (False, "", str(e))

    def create_namespace(self, name: str) -> Tuple[bool, str]:
        success, stdout, stderr = self._run_cmd(
            ["kubectl", "create", "namespace", name, "--dry-run=client", "-o", "yaml"],
            timeout=10,
            check=False
        )
        if not success:
            return False, stderr

        try:
            result = subprocess.run(
                ["kubectl", "apply", "-f", "-"],
                input=stdout,
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                return True, f"Namespace {name} created successfully"
            return False, f"Failed to create namespace: {result.stderr}"
        except Exception as e:
            return False, str(e)

    def delete_namespace(self, name: str) -> Tuple[bool, str]:
        success, stdout, stderr = self._run_cmd(
            ["kubectl", "delete", "namespace", name, "--ignore-not-found=true"],
            timeout=60
        )
        return success, stderr if not success else "Namespace deleted successfully"

    def namespace_exists(self, name: str) -> bool:
        success, stdout, stderr = self._run_cmd(
            ["kubectl", "get", "namespace", name],
            timeout=10,
            check=False
        )
        return success


class NamespaceTestHelper:
    def __init__(self, test_namespace: str, prefix: str):
        self.test_namespace = test_namespace
        self.prefix = prefix
        self._ns = NamespaceHelper()
        self.default = AgentsHelper(namespace="default")
        self.custom = AgentsHelper(namespace=test_namespace)

    def setup(self):
        self._ns.create_namespace(self.test_namespace)

    def teardown(self):
        self.custom.cleanup_agents(self.prefix)
        self.default.cleanup_agents(self.prefix)
        self._ns.delete_namespace(self.test_namespace)
