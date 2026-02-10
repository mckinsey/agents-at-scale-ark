import subprocess
import json
import time
from typing import Dict, List, Optional, Tuple


class ToolsHelper:
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
    
    def create_http_tool(self, name: str, description: str, url: str, method: str = "GET") -> Tuple[bool, str]:
        tool_yaml = f"""apiVersion: ark.mckinsey.com/v1alpha1
kind: Tool
metadata:
  name: {name}
  namespace: {self.namespace}
spec:
  description: "{description}"
  type: http
  http:
    url: {url}
    method: {method}
"""
        try:
            result = subprocess.run(
                ["kubectl", "apply", "-f", "-"],
                input=tool_yaml,
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                return True, f"Tool {name} created successfully"
            return False, f"Failed to create tool: {result.stderr}"
        except Exception as e:
            return False, str(e)
    
    def get_tool(self, name: str) -> Tuple[bool, Optional[Dict]]:
        success, stdout, stderr = self._run_cmd(
            ["kubectl", "get", "tool", name, "-n", self.namespace, "-o", "json"],
            timeout=10,
            check=False
        )
        
        if success and stdout:
            try:
                return True, json.loads(stdout)
            except json.JSONDecodeError:
                return False, None
        return False, None
    
    def list_tools(self) -> Tuple[bool, List[str]]:
        success, stdout, stderr = self._run_cmd(
            ["kubectl", "get", "tools", "-n", self.namespace, "-o", "json"],
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
    
    def delete_tool(self, name: str) -> Tuple[bool, str]:
        success, stdout, stderr = self._run_cmd(
            ["kubectl", "delete", "tool", name, "-n", self.namespace, "--ignore-not-found=true"],
            timeout=10
        )
        return success, stderr if not success else "Tool deleted successfully"
    
    def verify_tool_exists(self, name: str) -> bool:
        success, tool_data = self.get_tool(name)
        return success and tool_data is not None
    
    def verify_tool_spec(self, name: str, expected_url: str, expected_method: str = "GET") -> Tuple[bool, str]:
        success, tool_data = self.get_tool(name)
        if not success or not tool_data:
            return False, "Tool not found"
        
        spec = tool_data.get("spec", {})
        http_config = spec.get("http", {})
        
        actual_url = http_config.get("url", "")
        actual_method = http_config.get("method", "")
        
        if actual_url != expected_url:
            return False, f"URL mismatch: expected {expected_url}, got {actual_url}"
        
        if actual_method != expected_method:
            return False, f"Method mismatch: expected {expected_method}, got {actual_method}"
        
        return True, "Tool spec verified successfully"
    
    def cleanup_tools(self, prefix: str) -> Tuple[bool, int]:
        success, tool_names = self.list_tools()
        if not success:
            return False, 0
        
        deleted_count = 0
        for name in tool_names:
            if name.startswith(prefix):
                success, _ = self.delete_tool(name)
                if success:
                    deleted_count += 1
        
        return True, deleted_count
