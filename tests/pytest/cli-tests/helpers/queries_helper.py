import subprocess
import json
import time
from typing import Dict, List, Optional, Tuple


class QueriesHelper:
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
    
    def create_query(self, name: str, agent_name: str, input_text: str, timeout: int = 300) -> Tuple[bool, str]:
        query_yaml = f"""apiVersion: ark.mckinsey.com/v1alpha1
kind: Query
metadata:
  name: {name}
  namespace: {self.namespace}
spec:
  input: "{input_text}"
  target:
    name: {agent_name}
    type: agent
  type: user
  timeout: 5m
  ttl: 1h
"""
        try:
            result = subprocess.run(
                ["kubectl", "apply", "-f", "-"],
                input=query_yaml,
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode != 0:
                return False, f"Failed to create query: {result.stderr}"
        except Exception as e:
            return False, str(e)
        
        start_time = time.time()
        while time.time() - start_time < timeout:
            success, stdout, stderr = self._run_cmd(
                ["kubectl", "get", "query", name, "-n", self.namespace, "-o", "json"],
                timeout=10,
                check=False
            )
            
            if success and stdout:
                try:
                    query_data = json.loads(stdout)
                    status = query_data.get("status", {})
                    phase = status.get("phase", "")
                    
                    if phase == "done":
                        return True, "Query completed successfully"
                    
                    if phase == "error":
                        return False, "Query failed with error phase"
                    
                    conditions = status.get("conditions", [])
                    for condition in conditions:
                        if condition.get("type") == "Completed" and condition.get("status") == "True":
                            return True, "Query completed successfully"
                        if condition.get("type") == "Failed" and condition.get("status") == "True":
                            return False, f"Query failed: {condition.get('message', 'Unknown error')}"
                except json.JSONDecodeError:
                    pass
            
            time.sleep(5)
        
        return False, "Query timed out waiting for completion"
    
    def get_query(self, name: str) -> Tuple[bool, Optional[Dict]]:
        success, stdout, stderr = self._run_cmd(
            ["kubectl", "get", "query", name, "-n", self.namespace, "-o", "json"],
            timeout=10,
            check=False
        )
        
        if success and stdout:
            try:
                return True, json.loads(stdout)
            except json.JSONDecodeError:
                return False, None
        return False, None
    
    def get_query_response(self, name: str) -> Tuple[bool, Optional[str]]:
        success, query_data = self.get_query(name)
        if success and query_data:
            status = query_data.get("status", {})
            conversation_id = status.get("conversationId", "")
            phase = status.get("phase", "")
            
            if phase == "done" or conversation_id:
                return True, f"Phase: {phase}, ConversationId: {conversation_id}"
            
            return True, f"Phase: {phase}"
        return False, None
    
    def list_queries(self) -> Tuple[bool, List[str]]:
        success, stdout, stderr = self._run_cmd(
            ["kubectl", "get", "queries", "-n", self.namespace, "-o", "json"],
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
    
    def delete_query(self, name: str) -> Tuple[bool, str]:
        success, stdout, stderr = self._run_cmd(
            ["kubectl", "delete", "query", name, "-n", self.namespace, "--ignore-not-found=true"],
            timeout=10
        )
        return success, stderr if not success else "Query deleted successfully"
    
    def verify_query_status(self, name: str) -> Tuple[bool, str]:
        success, query_data = self.get_query(name)
        if not success or not query_data:
            return False, "Query not found"
        
        status = query_data.get("status", {})
        phase = status.get("phase", "pending")
        
        if phase == "done":
            return True, "Completed"
        elif phase == "error":
            return True, "Failed"
        elif phase in ["pending", "executing"]:
            return True, "InProgress"
        
        conditions = status.get("conditions", [])
        for condition in conditions:
            if condition.get("type") == "Completed" and condition.get("status") == "True":
                return True, "Completed"
            if condition.get("type") == "Failed" and condition.get("status") == "True":
                return True, "Failed"
        
        return True, "InProgress"
    
    def cleanup_queries(self, prefix: str) -> Tuple[bool, int]:
        success, query_names = self.list_queries()
        if not success:
            return False, 0
        
        deleted_count = 0
        for name in query_names:
            if name.startswith(prefix):
                success, _ = self.delete_query(name)
                if success:
                    deleted_count += 1
        
        return True, deleted_count
