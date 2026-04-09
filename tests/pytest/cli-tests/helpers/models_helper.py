import base64
import json
import os
import subprocess
import time
from typing import Any, Dict, List, Optional, Tuple

import yaml

DEFAULT_AZURE_API_VERSION = "2024-04-01-preview"


class ModelsHelper:
    NAMESPACE = "default"
    TIMEOUT_CREATE = 30
    TIMEOUT_AVAILABLE = int(os.getenv("MODEL_AVAILABILITY_TIMEOUT", "120"))
    POLL_INTERVAL = 5

    def _run_cmd(self, cmd: List[str], timeout: int = 30, check: bool = False) -> Tuple[bool, str, str]:
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=check,
            )
            return result.returncode == 0, result.stdout, result.stderr
        except subprocess.TimeoutExpired:
            return False, "", f"Command timed out after {timeout}s"
        except Exception as e:
            return False, "", str(e)

    def _apply_yaml(self, resource: Dict[str, Any]) -> Tuple[bool, str]:
        try:
            yaml_str = yaml.safe_dump(resource, default_flow_style=False)
            result = subprocess.run(
                ["kubectl", "apply", "-f", "-"],
                input=yaml_str,
                capture_output=True,
                text=True,
                timeout=self.TIMEOUT_CREATE,
            )
            return result.returncode == 0, result.stderr if result.returncode != 0 else result.stdout
        except Exception as e:
            return False, str(e)

    def create_secret(self, name: str, token: str) -> Tuple[bool, str]:
        encoded = base64.b64encode(token.encode()).decode()
        resource: Dict[str, Any] = {
            "apiVersion": "v1",
            "kind": "Secret",
            "metadata": {"name": name, "namespace": self.NAMESPACE},
            "type": "Opaque",
            "data": {"token": encoded},
        }
        return self._apply_yaml(resource)

    def create_openai_model(self, name: str, secret_name: str, model: str = "gpt-4o-mini", base_url: str = "") -> Tuple[bool, str]:
        resource: Dict[str, Any] = {
            "apiVersion": "ark.mckinsey.com/v1alpha1",
            "kind": "Model",
            "metadata": {"name": name, "namespace": self.NAMESPACE},
            "spec": {
                "config": {
                    "openai": {
                        "apiKey": {"valueFrom": {"secretKeyRef": {"key": "token", "name": secret_name}}},
                        "baseUrl": {"value": base_url},
                    }
                },
                "model": {"value": model},
                "provider": "openai",
                "type": "completions",
            },
        }
        return self._apply_yaml(resource)

    def create_anthropic_model(self, name: str, secret_name: str, model: str = "claude-3-haiku-20240307", base_url: str = "") -> Tuple[bool, str]:
        resource: Dict[str, Any] = {
            "apiVersion": "ark.mckinsey.com/v1alpha1",
            "kind": "Model",
            "metadata": {"name": name, "namespace": self.NAMESPACE},
            "spec": {
                "config": {
                    "anthropic": {
                        "apiKey": {"valueFrom": {"secretKeyRef": {"key": "token", "name": secret_name}}},
                        "baseUrl": {"value": base_url},
                    }
                },
                "model": {"value": model},
                "provider": "anthropic",
                "type": "completions",
            },
        }
        return self._apply_yaml(resource)

    def create_azure_model(self, name: str, secret_name: str, model: str = "gpt-35-turbo", base_url: str = "", api_version: str = DEFAULT_AZURE_API_VERSION) -> Tuple[bool, str]:
        resource: Dict[str, Any] = {
            "apiVersion": "ark.mckinsey.com/v1alpha1",
            "kind": "Model",
            "metadata": {"name": name, "namespace": self.NAMESPACE},
            "spec": {
                "config": {
                    "azure": {
                        "auth": {"apiKey": {"valueFrom": {"secretKeyRef": {"key": "token", "name": secret_name}}}},
                        "baseUrl": {"value": base_url},
                        "apiVersion": {"value": api_version},
                    }
                },
                "model": {"value": model},
                "provider": "azure",
                "type": "completions",
            },
        }
        return self._apply_yaml(resource)

    def get_model(self, name: str) -> Tuple[bool, Optional[Dict[str, Any]]]:
        success, stdout, _ = self._run_cmd(
            ["kubectl", "get", "model", name, "-n", self.NAMESPACE, "-o", "json"],
        )
        if success and stdout:
            try:
                return True, json.loads(stdout)
            except json.JSONDecodeError:
                return False, None
        return False, None

    def model_exists(self, name: str) -> bool:
        success, _ = self.get_model(name)
        return success

    def get_model_availability(self, name: str) -> Tuple[bool, str]:
        success, data = self.get_model(name)
        if not success or not data:
            return False, "model not found"
        conditions = data.get("status", {}).get("conditions", [])
        for cond in conditions:
            if cond.get("type") == "ModelAvailable":
                return cond.get("status") == "True", cond.get("message", "")
        return False, "no ModelAvailable condition"

    def wait_for_availability(self, name: str) -> Tuple[bool, str]:
        elapsed = 0
        while elapsed < self.TIMEOUT_AVAILABLE:
            available, message = self.get_model_availability(name)
            if available:
                return True, message
            time.sleep(self.POLL_INTERVAL)
            elapsed += self.POLL_INTERVAL
        _, message = self.get_model_availability(name)
        return False, message

    def get_model_provider(self, name: str) -> Optional[str]:
        _, data = self.get_model(name)
        if data:
            return data.get("spec", {}).get("provider")
        return None

    def get_model_name_value(self, name: str) -> Optional[str]:
        _, data = self.get_model(name)
        if data:
            return data.get("spec", {}).get("model", {}).get("value")
        return None

    def delete_model(self, name: str) -> Tuple[bool, str]:
        success, _, stderr = self._run_cmd(
            ["kubectl", "delete", "model", name, "-n", self.NAMESPACE, "--ignore-not-found=true"],
        )
        return success, stderr

    def delete_secret(self, name: str) -> Tuple[bool, str]:
        success, _, stderr = self._run_cmd(
            ["kubectl", "delete", "secret", name, "-n", self.NAMESPACE, "--ignore-not-found=true"],
        )
        return success, stderr

    def cleanup(self, model_name: str, secret_name: str) -> None:
        self.delete_model(model_name)
        self.delete_secret(secret_name)
