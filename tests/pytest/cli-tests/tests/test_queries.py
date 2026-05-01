import json
import subprocess
import sys
import os

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from helpers.queries_helper import QueriesHelper


class TestQueriesCLI:
    helper = None
    created_queries = []
    agent_name = "test-cli-agent"
    model_name = "test-model-mock"

    @classmethod
    def setup_class(cls):
        cls.helper = QueriesHelper()
        cls.created_queries = []

        subprocess.run(
            ["kubectl", "delete", "agent", cls.agent_name, "-n", "default", "--ignore-not-found=true"],
            capture_output=True
        )

        agent_yaml = f"""apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: {cls.agent_name}
  namespace: default
spec:
  modelRef:
    name: {cls.model_name}
  prompt: |
    You are a test agent used for CLI testing.
    Keep responses concise and indicate that you are a test agent.
"""
        result = subprocess.run(
            ["kubectl", "apply", "-f", "-"],
            input=agent_yaml,
            capture_output=True,
            text=True
        )
        assert result.returncode == 0, f"Failed to create test agent: {result.stderr}"

    @classmethod
    def teardown_class(cls):
        if cls.helper:
            cls.helper.cleanup_queries("test-query-cli-")

        subprocess.run(
            ["kubectl", "delete", "agent", cls.agent_name, "-n", "default", "--ignore-not-found=true"],
            capture_output=True
        )

    def test_setup_prerequisites(self):
        result = subprocess.run(
            ["kubectl", "get", "model", self.model_name, "-n", "default", "-o", "json"],
            capture_output=True, text=True, timeout=10
        )
        assert result.returncode == 0, f"Mock model not found: {result.stderr}"

        model_data = json.loads(result.stdout)
        conditions = model_data.get("status", {}).get("conditions", [])
        available = any(
            c.get("type") == "ModelAvailable" and c.get("status") == "True"
            for c in conditions
        )
        assert available, f"Model {self.model_name} is not available"

        result = subprocess.run(
            ["kubectl", "get", "agent", self.agent_name, "-n", "default"],
            capture_output=True, text=True
        )
        assert result.returncode == 0, f"Test agent not found: {result.stderr}"

    def test_create_query(self):
        query_name = "test-query-cli-create"
        success, message = self.helper.create_query(
            name=query_name,
            agent_name=self.agent_name,
            input_text="Say hello in one sentence",
            timeout=60
        )
        assert success, f"Query creation failed: {message}"
        self.created_queries.append(query_name)

    def test_get_query(self):
        query_name = "test-query-cli-get"
        success, message = self.helper.create_query(
            name=query_name,
            agent_name=self.agent_name,
            input_text="What is 2+2? Answer in one short sentence.",
            timeout=60
        )
        assert success, f"Query creation failed: {message}"
        self.created_queries.append(query_name)

        success, query_data = self.helper.get_query(query_name)
        assert success, "Failed to get query"
        assert query_data is not None
        assert query_data["metadata"]["name"] == query_name

    def test_get_query_response(self):
        query_name = "test-query-cli-response"
        success, message = self.helper.create_query(
            name=query_name,
            agent_name=self.agent_name,
            input_text="Reply with OK in one sentence.",
            timeout=60
        )
        assert success, f"Query creation failed: {message}"
        self.created_queries.append(query_name)

        success, response = self.helper.get_query_response(query_name)
        assert success, "Failed to get query response"
        assert response is not None
        assert len(response) > 0
        assert "Phase:" in response

    def test_list_queries(self):
        success, queries = self.helper.list_queries()
        assert success, "Failed to list queries"
        assert isinstance(queries, list)

        for query_name in self.created_queries:
            assert query_name in queries, f"Query {query_name} not found in list"

    def test_verify_query_status(self):
        query_name = "test-query-cli-status"
        success, message = self.helper.create_query(
            name=query_name,
            agent_name=self.agent_name,
            input_text="Status check. Reply in one sentence.",
            timeout=60
        )
        assert success, f"Query creation failed: {message}"
        self.created_queries.append(query_name)

        success, status = self.helper.verify_query_status(query_name)
        assert success, "Failed to verify query status"
        assert status in ["Completed", "Failed", "InProgress"]

    def test_delete_query(self):
        query_name = "test-query-cli-delete"
        success, message = self.helper.create_query(
            name=query_name,
            agent_name=self.agent_name,
            input_text="Delete me. Reply in one sentence.",
            timeout=60
        )
        assert success, f"Query creation failed: {message}"

        success, message = self.helper.delete_query(query_name)
        assert success, f"Failed to delete query: {message}"

        success, query_data = self.helper.get_query(query_name)
        assert not success or query_data is None, "Query should not exist after deletion"

    def test_cleanup_queries(self):
        created_count = 0
        for i in range(3):
            query_name = f"test-query-cli-cleanup-{i}"
            success, message = self.helper.create_query(
                name=query_name,
                agent_name=self.agent_name,
                input_text=f"Test {i}. Reply in one sentence.",
                timeout=60
            )
            if success:
                created_count += 1

        assert created_count > 0, "No queries could be created"

        success, count = self.helper.cleanup_queries("test-query-cli-cleanup-")
        assert success, "Failed to cleanup queries"
        assert count >= 1, f"Expected at least 1 query deleted, got {count}"
