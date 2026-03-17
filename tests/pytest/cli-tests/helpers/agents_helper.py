import subprocess
import json
from typing import Dict, List, Optional, Tuple


class AgentsHelper:
    def __init__(self, namespace: str = "default"):
        self.namespace = namespace

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

    def create_agent(self, name: str, prompt: str = "You are a helpful assistant.") -> Tuple[bool, str]:
        agent_yaml = f"""apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: {name}
  namespace: {self.namespace}
spec:
  prompt: "{prompt}"
"""
        try:
            result = subprocess.run(
                ["kubectl", "apply", "-f", "-"],
                input=agent_yaml,
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                return True, f"Agent {name} created successfully"
            return False, f"Failed to create agent: {result.stderr}"
        except Exception as e:
            return False, str(e)

    def get_agent(self, name: str) -> Tuple[bool, Optional[Dict]]:
        success, stdout, stderr = self._run_cmd(
            ["kubectl", "get", "agent", name, "-n", self.namespace, "-o", "json"],
            timeout=10,
            check=False
        )
        if success and stdout:
            try:
                return True, json.loads(stdout)
            except json.JSONDecodeError:
                return False, None
        return False, None

    def list_agents(self) -> Tuple[bool, List[str]]:
        success, stdout, stderr = self._run_cmd(
            ["kubectl", "get", "agents", "-n", self.namespace, "-o", "json"],
            timeout=10,
            check=False
        )
        if success and stdout:
            try:
                data = json.loads(stdout)
                names = [item["metadata"]["name"] for item in data.get("items", [])]
                return True, names
            except (json.JSONDecodeError, KeyError):
                return False, []
        return False, []

    def delete_agent(self, name: str) -> Tuple[bool, str]:
        success, stdout, stderr = self._run_cmd(
            ["kubectl", "delete", "agent", name, "-n", self.namespace, "--ignore-not-found=true"],
            timeout=10
        )
        return success, stderr if not success else "Agent deleted successfully"

    def verify_agent_exists(self, name: str) -> bool:
        success, agent_data = self.get_agent(name)
        return success and agent_data is not None

    def get_agent_namespace(self, name: str) -> Optional[str]:
        success, agent_data = self.get_agent(name)
        if success and agent_data:
            return agent_data.get("metadata", {}).get("namespace")
        return None

    def cleanup_agents(self, prefix: str) -> Tuple[bool, int]:
        success, agent_names = self.list_agents()
        if not success:
            return False, 0
        deleted_count = 0
        for name in agent_names:
            if name.startswith(prefix):
                success, _ = self.delete_agent(name)
                if success:
                    deleted_count += 1
        return True, deleted_count
