import subprocess
import json
import time
from typing import Dict, List, Optional, Tuple


class McpServersHelper:
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
    
    def get_mcp_server(self, name: str) -> Tuple[bool, Optional[Dict]]:
        success, stdout, stderr = self._run_cmd(
            ["kubectl", "get", "mcpserver", name, "-n", self.namespace, "-o", "json"],
            timeout=10,
            check=False
        )
        
        if success and stdout:
            try:
                return True, json.loads(stdout)
            except json.JSONDecodeError:
                return False, None
        return False, None
    
    def list_mcp_servers(self) -> Tuple[bool, List[str]]:
        success, stdout, stderr = self._run_cmd(
            ["kubectl", "get", "mcpservers", "-n", self.namespace, "-o", "json"],
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
    
    def verify_mcp_server_status(self, name: str, max_retries: int = 24, retry_delay: int = 5) -> Tuple[bool, str]:
        for attempt in range(max_retries):
            success, server_data = self.get_mcp_server(name)
            if not success or not server_data:
                if attempt < max_retries - 1:
                    time.sleep(retry_delay)
                    continue
                return False, "MCP server not found"
            
            status = server_data.get("status", {})
            conditions = status.get("conditions", [])
            
            for condition in conditions:
                if condition.get("type") == "Available" and condition.get("status") == "True":
                    return True, "Available"
                if condition.get("type") == "Failed" and condition.get("status") == "True":
                    return True, f"Failed: {condition.get('message', 'Unknown error')}"
            
            if attempt < max_retries - 1:
                time.sleep(retry_delay)
        
        return False, "MCP server status check timed out"
    
    def get_mcp_server_tools(self, name: str) -> Tuple[bool, List[str]]:
        success, server_data = self.get_mcp_server(name)
        if not success or not server_data:
            return False, []
        
        status = server_data.get("status", {})
        tools = status.get("tools", [])
        
        tool_names = [tool.get("name", "") for tool in tools if tool.get("name")]
        return True, tool_names
    
    def verify_mcp_server_tool_count(self, name: str, min_count: int = 1) -> Tuple[bool, int]:
        success, server_data = self.get_mcp_server(name)
        if not success or not server_data:
            return False, 0
        
        status = server_data.get("status", {})
        tool_count = status.get("toolCount", 0)
        
        if tool_count >= min_count:
            return True, tool_count
        return False, tool_count
    
    def verify_mcp_server_endpoints(self, name: str) -> Tuple[bool, str]:
        success, server_data = self.get_mcp_server(name)
        if not success or not server_data:
            return False, "MCP server not found"
        
        spec = server_data.get("spec", {})
        endpoint = spec.get("endpoint", "")
        address = spec.get("address", {})
        
        if endpoint:
            return True, endpoint
        elif address:
            return True, str(address)
        
        return False, "No endpoint or address configured"
