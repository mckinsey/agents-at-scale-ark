"""Tests for Query Approval API endpoints."""
import json
import os
import unittest
from unittest.mock import Mock, patch, AsyncMock
from fastapi.testclient import TestClient
from kubernetes_asyncio.client.rest import ApiException

# Set environment variable to skip authentication before importing the app
os.environ["AUTH_MODE"] = "open"
os.environ["READ_ONLY_MODE"] = "false"


class TestGetApprovalDetails(unittest.TestCase):
    """Test cases for GET /v1/queries/{name}/approval endpoint."""

    def setUp(self):
        """Set up test client."""
        from ark_api.main import app
        self.client = TestClient(app)

    @patch('ark_api.api.v1.queries.with_ark_client')
    def test_get_approval_details_success(self, mock_ark_client):
        """Test successful retrieval of approval details when query is input-required."""
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client

        # Mock query in input-required phase
        mock_query = Mock()
        mock_query.to_dict.return_value = {
            "metadata": {
                "name": "test-query",
                "namespace": "default"
            },
            "status": {
                "phase": "input-required",
                "response": {
                    "a2a": {
                        "taskId": "task-123"
                    }
                }
            }
        }

        # Mock A2ATask with approval details
        mock_task = Mock()
        mock_task.to_dict.return_value = {
            "metadata": {
                "name": "a2a-task-task-123",
                "namespace": "default"
            },
            "status": {
                "phase": "input-required",
                "protocolMetadata": {
                    "toolCalls": json.dumps([
                        {
                            "id": "call-1",
                            "type": "function",
                            "function": {
                                "name": "dangerous-tool",
                                "arguments": "{}"
                            }
                        }
                    ]),
                    "timeout": "5m",
                    "onTimeout": "reject",
                    "context": {
                        "agentName": "test-agent"
                    }
                }
            }
        }

        mock_client.queries.a_get = AsyncMock(return_value=mock_query)
        mock_client.a2atasks.a_get = AsyncMock(return_value=mock_task)

        response = self.client.get("/v1/queries/test-query/approval?namespace=default")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["taskId"], "task-123")
        self.assertEqual(len(data["toolCalls"]), 1)
        self.assertEqual(data["toolCalls"][0]["id"], "call-1")
        self.assertEqual(data["toolCalls"][0]["function"]["name"], "dangerous-tool")
        self.assertEqual(data["timeout"], "5m")
        self.assertEqual(data["onTimeout"], "reject")
        self.assertEqual(data["agentName"], "test-agent")
        self.assertEqual(data["phase"], "input-required")

    @patch('ark_api.api.v1.queries.with_ark_client')
    def test_get_approval_details_query_not_found(self, mock_ark_client):
        """Test GET approval details returns 404 when query not found."""
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client

        mock_client.queries.a_get = AsyncMock(side_effect=ApiException(
            status=404,
            reason="Not Found"
        ))

        response = self.client.get("/v1/queries/nonexistent/approval?namespace=default")

        self.assertEqual(response.status_code, 404)

    @patch('ark_api.api.v1.queries.with_ark_client')
    def test_get_approval_details_not_input_required_phase(self, mock_ark_client):
        """Test GET approval details returns 404 when query not in input-required phase."""
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client

        # Mock query in running phase (not input-required)
        mock_query = Mock()
        mock_query.to_dict.return_value = {
            "metadata": {
                "name": "test-query",
                "namespace": "default"
            },
            "status": {
                "phase": "running"
            }
        }

        mock_client.queries.a_get = AsyncMock(return_value=mock_query)

        response = self.client.get("/v1/queries/test-query/approval?namespace=default")

        self.assertEqual(response.status_code, 404)
        data = response.json()
        self.assertIn("not awaiting approval", data["detail"])

    @patch('ark_api.api.v1.queries.with_ark_client')
    def test_get_approval_details_no_task_id(self, mock_ark_client):
        """Test GET approval details returns 404 when no approval task found."""
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client

        # Mock query without taskId
        mock_query = Mock()
        mock_query.to_dict.return_value = {
            "metadata": {
                "name": "test-query",
                "namespace": "default"
            },
            "status": {
                "phase": "input-required",
                "response": {
                    "a2a": {}
                }
            }
        }

        mock_client.queries.a_get = AsyncMock(return_value=mock_query)

        response = self.client.get("/v1/queries/test-query/approval?namespace=default")

        self.assertEqual(response.status_code, 404)
        data = response.json()
        self.assertIn("No approval task found", data["detail"])

    @patch('ark_api.api.v1.queries.with_ark_client')
    def test_get_approval_details_with_multiple_tool_calls(self, mock_ark_client):
        """Test GET approval details with multiple tool calls."""
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client

        mock_query = Mock()
        mock_query.to_dict.return_value = {
            "metadata": {
                "name": "test-query",
                "namespace": "default"
            },
            "status": {
                "phase": "input-required",
                "response": {
                    "a2a": {
                        "taskId": "task-456"
                    }
                }
            }
        }

        mock_task = Mock()
        mock_task.to_dict.return_value = {
            "status": {
                "phase": "input-required",
                "protocolMetadata": {
                    "toolCalls": json.dumps([
                        {
                            "id": "call-1",
                            "type": "function",
                            "function": {"name": "tool-1", "arguments": "{}"}
                        },
                        {
                            "id": "call-2",
                            "type": "function",
                            "function": {"name": "tool-2", "arguments": "{}"}
                        }
                    ]),
                    "context": {}
                }
            }
        }

        mock_client.queries.a_get = AsyncMock(return_value=mock_query)
        mock_client.a2atasks.a_get = AsyncMock(return_value=mock_task)

        response = self.client.get("/v1/queries/test-query/approval?namespace=default")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["toolCalls"]), 2)
        self.assertEqual(data["toolCalls"][0]["function"]["name"], "tool-1")
        self.assertEqual(data["toolCalls"][1]["function"]["name"], "tool-2")


class TestSubmitApproval(unittest.TestCase):
    """Test cases for POST /v1/queries/{name}/approval endpoint."""

    def setUp(self):
        """Set up test client."""
        from ark_api.main import app
        self.client = TestClient(app)

    @patch('ark_api.api.v1.queries.asyncio.to_thread')
    @patch('kubernetes.client.CustomObjectsApi')
    @patch('ark_api.api.v1.queries.with_ark_client')
    def test_submit_approval_approved(self, mock_ark_client, mock_custom_api, mock_to_thread):
        """Test POST approval with action='approved' updates A2ATask to completed."""
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client

        # Mock query in input-required phase
        mock_query = Mock()
        mock_query.to_dict.return_value = {
            "metadata": {
                "name": "test-query",
                "namespace": "default"
            },
            "status": {
                "phase": "input-required",
                "response": {
                    "a2a": {
                        "taskId": "task-789"
                    }
                }
            }
        }

        # Mock current task
        mock_task = Mock()
        mock_task.to_dict.return_value = {
            "metadata": {
                "name": "a2a-task-task-789",
                "namespace": "default"
            },
            "status": {
                "phase": "input-required"
            }
        }

        mock_client.queries.a_get = AsyncMock(return_value=mock_query)
        mock_client.a2atasks.a_get = AsyncMock(return_value=mock_task)

        # Mock kubernetes API patch
        mock_to_thread.return_value = None

        response = self.client.post(
            "/v1/queries/test-query/approval?namespace=default",
            json={"action": "approved"}
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["queryName"], "test-query")
        self.assertEqual(data["queryNamespace"], "default")
        self.assertEqual(data["action"], "approved")
        self.assertEqual(data["taskId"], "task-789")

        # Verify patch was called with completed phase
        mock_to_thread.assert_called_once()
        call_args = mock_to_thread.call_args
        patch_body = call_args.kwargs['body']
        self.assertEqual(patch_body["status"]["phase"], "completed")

    @patch('ark_api.api.v1.queries.asyncio.to_thread')
    @patch('kubernetes.client.CustomObjectsApi')
    @patch('ark_api.api.v1.queries.with_ark_client')
    def test_submit_approval_rejected(self, mock_ark_client, mock_custom_api, mock_to_thread):
        """Test POST approval with action='rejected' updates A2ATask to failed."""
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client

        mock_query = Mock()
        mock_query.to_dict.return_value = {
            "metadata": {
                "name": "test-query",
                "namespace": "default"
            },
            "status": {
                "phase": "input-required",
                "response": {
                    "a2a": {
                        "taskId": "task-999"
                    }
                }
            }
        }

        mock_task = Mock()
        mock_task.to_dict.return_value = {
            "status": {
                "phase": "input-required"
            }
        }

        mock_client.queries.a_get = AsyncMock(return_value=mock_query)
        mock_client.a2atasks.a_get = AsyncMock(return_value=mock_task)
        mock_to_thread.return_value = None

        response = self.client.post(
            "/v1/queries/test-query/approval?namespace=default",
            json={"action": "rejected"}
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["action"], "rejected")

        # Verify patch was called with failed phase and error message
        call_args = mock_to_thread.call_args
        patch_body = call_args.kwargs['body']
        self.assertEqual(patch_body["status"]["phase"], "failed")
        self.assertEqual(patch_body["status"]["error"], "Tool execution rejected by user")

    @patch('ark_api.api.v1.queries.with_ark_client')
    def test_submit_approval_query_not_found(self, mock_ark_client):
        """Test POST approval returns 404 when query not found."""
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client

        mock_client.queries.a_get = AsyncMock(side_effect=ApiException(
            status=404,
            reason="Not Found"
        ))

        response = self.client.post(
            "/v1/queries/nonexistent/approval?namespace=default",
            json={"action": "approved"}
        )

        self.assertEqual(response.status_code, 404)

    @patch('ark_api.api.v1.queries.with_ark_client')
    def test_submit_approval_not_input_required_phase(self, mock_ark_client):
        """Test POST approval returns 409 when query not in input-required phase."""
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client

        # Mock query in completed phase
        mock_query = Mock()
        mock_query.to_dict.return_value = {
            "metadata": {
                "name": "test-query",
                "namespace": "default"
            },
            "status": {
                "phase": "completed"
            }
        }

        mock_client.queries.a_get = AsyncMock(return_value=mock_query)

        response = self.client.post(
            "/v1/queries/test-query/approval?namespace=default",
            json={"action": "approved"}
        )

        self.assertEqual(response.status_code, 409)
        data = response.json()
        self.assertIn("not awaiting approval", data["detail"])

    @patch('ark_api.api.v1.queries.with_ark_client')
    def test_submit_approval_no_task_id(self, mock_ark_client):
        """Test POST approval returns 404 when no approval task found."""
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client

        mock_query = Mock()
        mock_query.to_dict.return_value = {
            "metadata": {
                "name": "test-query",
                "namespace": "default"
            },
            "status": {
                "phase": "input-required",
                "response": {
                    "a2a": {}
                }
            }
        }

        mock_client.queries.a_get = AsyncMock(return_value=mock_query)

        response = self.client.post(
            "/v1/queries/test-query/approval?namespace=default",
            json={"action": "approved"}
        )

        self.assertEqual(response.status_code, 404)
        data = response.json()
        self.assertIn("No approval task found", data["detail"])

    @patch('ark_api.api.v1.queries.asyncio.to_thread')
    @patch('kubernetes.client.CustomObjectsApi')
    @patch('ark_api.api.v1.queries.with_ark_client')
    def test_submit_approval_validates_namespace(self, mock_ark_client, mock_custom_api, mock_to_thread):
        """Test POST approval validates namespace parameter."""
        mock_client = AsyncMock()
        mock_ark_client.return_value.__aenter__.return_value = mock_client

        mock_query = Mock()
        mock_query.to_dict.return_value = {
            "metadata": {
                "name": "test-query",
                "namespace": "custom-namespace"
            },
            "status": {
                "phase": "input-required",
                "response": {
                    "a2a": {
                        "taskId": "task-111"
                    }
                }
            }
        }

        mock_task = Mock()
        mock_task.to_dict.return_value = {
            "status": {
                "phase": "input-required"
            }
        }

        mock_client.queries.a_get = AsyncMock(return_value=mock_query)
        mock_client.a2atasks.a_get = AsyncMock(return_value=mock_task)
        mock_to_thread.return_value = None

        response = self.client.post(
            "/v1/queries/test-query/approval?namespace=custom-namespace",
            json={"action": "approved"}
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["queryNamespace"], "custom-namespace")

        # Verify patch was called with correct namespace
        call_args = mock_to_thread.call_args
        patch_namespace = call_args.kwargs['namespace']
        self.assertEqual(patch_namespace, "custom-namespace")

    def test_submit_approval_invalid_action(self):
        """Test POST approval validates action field."""
        response = self.client.post(
            "/v1/queries/test-query/approval?namespace=default",
            json={"action": "invalid-action"}
        )

        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
