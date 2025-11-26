"""Tests for A2A Tasks API."""
import os
import unittest
from unittest.mock import Mock, patch, AsyncMock
from fastapi.testclient import TestClient

# Set environment variable to skip authentication before importing the app
os.environ["AUTH_MODE"] = "open"


class TestA2ATasksEndpoint(unittest.TestCase):
    """Test cases for the /a2a-tasks endpoint."""
    
    def setUp(self):
        """Set up test client."""
        from ark_api.main import app
        self.client = TestClient(app)

    @patch('ark_api.api.v1.a2a_tasks.with_ark_client')
    def test_list_a2a_tasks_generic_error(self, mock_ark_client):
        """Test list A2A tasks with generic exception."""
        from kubernetes_asyncio.client.rest import ApiException
        
        mock_client = AsyncMock()
        mock_client.a2atasks.a_list = AsyncMock(side_effect=ApiException(
            status=500,
            reason="Internal Server Error"
        ))
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        response = self.client.get("/v1/a2a-tasks?namespace=default")
        
        self.assertEqual(response.status_code, 500)
        data = response.json()
        self.assertIn("detail", data)

    @patch('ark_api.api.v1.a2a_tasks.with_ark_client')
    def test_list_a2a_tasks_success(self, mock_ark_client):
        """Test successful A2A task listing."""
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        mock_task1 = Mock()
        mock_task1.to_dict.return_value = {
            "metadata": {
                "name": "task-1",
                "namespace": "default",
                "creationTimestamp": "2023-01-01T00:00:00Z"
            },
            "spec": {
                "taskId": "task-id-1",
                "agentRef": {"name": "agent-1"},
                "queryRef": {"name": "query-1"}
            },
            "status": {
                "phase": "Completed"
            }
        }
        
        mock_task2 = Mock()
        mock_task2.to_dict.return_value = {
            "metadata": {
                "name": "task-2",
                "namespace": "default",
                "creationTimestamp": "2023-01-02T00:00:00Z"
            },
            "spec": {
                "taskId": "task-id-2",
                "agentRef": {"name": "agent-2"},
                "queryRef": {"name": "query-2"}
            },
            "status": {
                "phase": "Running"
            }
        }
        
        mock_client.a2atasks.a_list = AsyncMock(return_value=[mock_task1, mock_task2])
        
        response = self.client.get("/v1/a2a-tasks?namespace=default")
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 2)
        self.assertEqual(len(data["items"]), 2)
        
        self.assertEqual(data["items"][0]["name"], "task-1")
        self.assertEqual(data["items"][0]["taskId"], "task-id-1")
        self.assertEqual(data["items"][0]["phase"], "Completed")

        self.assertEqual(data["items"][1]["name"], "task-2")
        self.assertEqual(data["items"][1]["taskId"], "task-id-2")
        self.assertEqual(data["items"][1]["phase"], "Running")

    @patch('ark_api.api.v1.a2a_tasks.with_ark_client')
    def test_get_a2a_task_not_found(self, mock_ark_client):
        """Test get A2A task when task doesn't exist."""
        from kubernetes_asyncio.client.rest import ApiException
        
        mock_client = AsyncMock()
        mock_client.a2atasks.a_get = AsyncMock(side_effect=ApiException(
            status=404,
            reason="Not Found"
        ))
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        response = self.client.get("/v1/a2a-tasks/nonexistent-task?namespace=default")
        
        self.assertEqual(response.status_code, 404)
        data = response.json()
        self.assertIn("not found", data["detail"].lower())

    @patch('ark_api.api.v1.a2a_tasks.with_ark_client')
    def test_get_a2a_task_generic_error(self, mock_ark_client):
        """Test get A2A task with generic exception."""
        from kubernetes_asyncio.client.rest import ApiException
        
        mock_client = AsyncMock()
        mock_client.a2atasks.a_get = AsyncMock(side_effect=ApiException(
            status=403,
            reason="Forbidden"
        ))
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        response = self.client.get("/v1/a2a-tasks/task-1?namespace=default")
        
        self.assertEqual(response.status_code, 403)
        data = response.json()
        self.assertIn("detail", data)

    @patch('ark_api.api.v1.a2a_tasks.with_ark_client')
    def test_get_a2a_task_success(self, mock_ark_client):
        """Test successful retrieval of a single A2A task."""
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        mock_task = Mock()
        mock_task.to_dict.return_value = {
            "metadata": {
                "name": "task-1",
                "namespace": "default",
                "creationTimestamp": "2023-01-01T00:00:00Z"
            },
            "spec": {
                "taskId": "task-id-1",
                "a2aServerRef": {"name": "server-1"},
                "agentRef": {"name": "agent-1"},
                "queryRef": {"name": "query-1"},
                "contextId": "ctx-1",
                "input": "test input",
                "parameters": {"param1": "value1"},
                "pollInterval": "10s",
                "priority": 1,
                "timeout": "1h",
                "ttl": "24h"
            },
            "status": {
                "phase": "Completed",
                "protocolState": "state",
                "protocolMetadata": {"meta": "data"},
                "startTime": "2023-01-01T00:00:01Z",
                "completionTime": "2023-01-01T00:00:10Z",
                "lastStatusTimestamp": "2023-01-01T00:00:10Z",
                "error": None,
                "contextId": "ctx-1",
                "artifacts": [
                    {
                        "artifactId": "art-1",
                        "name": "artifact-1",
                        "description": "desc",
                        "parts": [{"kind": "text", "text": "content"}],
                        "metadata": {"key": "value"}
                    }
                ],
                "history": [
                    {
                        "messageId": "msg-1",
                        "role": "user",
                        "parts": [{"kind": "text", "text": "hello"}],
                        "metadata": {}
                    }
                ],
                "lastStatusMessage": {
                    "messageId": "msg-2",
                    "role": "agent",
                    "parts": [{"kind": "text", "text": "hi"}],
                    "metadata": {}
                },
                "conditions": []
            }
        }
        
        mock_client.a2atasks.a_get = AsyncMock(return_value=mock_task)
        
        response = self.client.get("/v1/a2a-tasks/task-1?namespace=default")
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        self.assertEqual(data["name"], "task-1")
        self.assertEqual(data["taskId"], "task-id-1")
        self.assertEqual(data["input"], "test input")
        self.assertEqual(data["status"]["phase"], "Completed")
        self.assertEqual(len(data["status"]["artifacts"]), 1)
        self.assertEqual(data["status"]["artifacts"][0]["name"], "artifact-1")
        self.assertEqual(len(data["status"]["history"]), 1)
        self.assertEqual(data["status"]["lastStatusMessage"]["role"], "agent")

    @patch('ark_api.api.v1.a2a_tasks.with_ark_client')
    def test_delete_a2a_task_success(self, mock_ark_client):
        """Test successful deletion of an A2A task."""
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        mock_client.a2atasks.a_delete = AsyncMock()
        
        response = self.client.delete("/v1/a2a-tasks/task-1?namespace=default")
        
        self.assertEqual(response.status_code, 204)
        mock_client.a2atasks.a_delete.assert_called_once_with("task-1")

    @patch('ark_api.api.v1.a2a_tasks.with_ark_client')
    def test_delete_a2a_task_not_found(self, mock_ark_client):
        """Test delete A2A task when task doesn't exist."""
        from kubernetes_asyncio.client.rest import ApiException
        
        mock_client = AsyncMock()
        mock_client.a2atasks.a_delete = AsyncMock(side_effect=ApiException(
            status=404,
            reason="Not Found"
        ))
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        response = self.client.delete("/v1/a2a-tasks/nonexistent-task?namespace=default")
        
        self.assertEqual(response.status_code, 404)
        data = response.json()
        self.assertIn("not found", data["detail"].lower())

    @patch('ark_api.api.v1.a2a_tasks.with_ark_client')
    def test_delete_a2a_task_generic_error(self, mock_ark_client):
        """Test delete A2A task with generic exception."""
        mock_client = AsyncMock()
        mock_client.a2atasks.a_delete = AsyncMock(side_effect=Exception("Unexpected error"))
        mock_ark_client.return_value.__aenter__.return_value = mock_client
        
        response = self.client.delete("/v1/a2a-tasks/task-1?namespace=default")
        
        self.assertEqual(response.status_code, 500)
        data = response.json()
        self.assertEqual(data["detail"], "Internal server error")
