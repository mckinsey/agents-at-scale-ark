import pytest
import sys
import os
import subprocess

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from helpers.queries_helper import QueriesHelper


class TestQueriesCLI:
    helper = None
    created_queries = []
    agent_name = "test-cli-agent"
    model_name = "test-cli-model"
    secret_name = "test-cli-model-token"
    provider_config = None
    
    @classmethod
    def setup_class(cls):
        cls.helper = QueriesHelper()

        if os.environ.get("CICD_AZURE_API_KEY") and os.environ.get("CICD_AZURE_BASE_URL"):
            cls.provider_config = {
                "type": "azure",
                "model": "gpt-4.1-mini",
                "token": os.environ["CICD_AZURE_API_KEY"],
                "url": os.environ["CICD_AZURE_BASE_URL"],
                "apiVersion": os.environ.get("CICD_AZURE_API_VERSION", "2024-12-01-preview"),
            }
        elif os.environ.get("CICD_OPENAI_API_KEY") and os.environ.get("CICD_OPENAI_BASE_URL"):
            cls.provider_config = {
                "type": "openai",
                "model": os.environ.get("CICD_OPENAI_MODEL", "gpt-4o-mini"),
                "token": os.environ["CICD_OPENAI_API_KEY"],
                "url": os.environ["CICD_OPENAI_BASE_URL"],
            }
        else:
            cls.provider_config = None
    
    @classmethod
    def teardown_class(cls):
        if cls.helper:
            cls.helper.cleanup_queries("test-query-cli-")
        
        subprocess.run(
            ["kubectl", "delete", "agent", cls.agent_name, "-n", "default", "--ignore-not-found=true"],
            capture_output=True
        )
        subprocess.run(
            ["kubectl", "delete", "model", cls.model_name, "-n", "default", "--ignore-not-found=true"],
            capture_output=True
        )
        subprocess.run(
            ["kubectl", "delete", "secret", cls.secret_name, "-n", "default", "--ignore-not-found=true"],
            capture_output=True
        )
    
    def test_setup_prerequisites(self):
        import base64
        
        if not self.provider_config:
            pytest.skip("No model provider credentials configured")
        
        secret_yaml = f"""apiVersion: v1
kind: Secret
metadata:
  name: {self.secret_name}
  namespace: default
type: Opaque
data:
  token: {base64.b64encode(self.provider_config['token'].encode()).decode()}
"""
        
        result = subprocess.run(
            ["kubectl", "apply", "-f", "-"],
            input=secret_yaml,
            capture_output=True,
            text=True
        )
        
        assert result.returncode == 0 or "already exists" in result.stderr.lower(), f"Failed to create secret: {result.stderr}"
        
        provider_type = self.provider_config['type']
        if provider_type == 'openai':
            model_yaml = f"""apiVersion: ark.mckinsey.com/v1alpha1
kind: Model
metadata:
  name: {self.model_name}
  namespace: default
spec:
  type: openai
  model:
    value: {self.provider_config['model']}
  config:
    openai:
      baseUrl:
        value: {self.provider_config['url']}
      apiKey:
        valueFrom:
          secretKeyRef:
            name: {self.secret_name}
            key: token
"""
        elif provider_type == 'azure':
            model_yaml = f"""apiVersion: ark.mckinsey.com/v1alpha1
kind: Model
metadata:
  name: {self.model_name}
  namespace: default
spec:
  type: azure
  model:
    value: {self.provider_config['model']}
  config:
    azure:
      baseUrl:
        value: {self.provider_config['url']}
      apiVersion:
        value: {self.provider_config['apiVersion']}
      apiKey:
        valueFrom:
          secretKeyRef:
            name: {self.secret_name}
            key: token
"""
        elif provider_type == 'bedrock':
            endpoint_config = ""
            if self.provider_config.get('endpoint'):
                endpoint_config = f"""      endpoint:
        value: {self.provider_config['endpoint']}
"""
            model_yaml = f"""apiVersion: ark.mckinsey.com/v1alpha1
kind: Model
metadata:
  name: {self.model_name}
  namespace: default
spec:
  type: bedrock
  model:
    value: {self.provider_config['model']}
  config:
    bedrock:
      region:
        value: {self.provider_config['region']}
{endpoint_config}      bearerToken:
        valueFrom:
          secretKeyRef:
            name: {self.secret_name}
            key: token
"""
        else:
            pytest.skip(f"Unknown provider type: {provider_type}")
        
        result = subprocess.run(
            ["kubectl", "apply", "-f", "-"],
            input=model_yaml,
            capture_output=True,
            text=True
        )
        
        assert result.returncode == 0 or "already exists" in result.stderr.lower(), f"Failed to create model: {result.stderr}"
        
        import time
        time.sleep(2)
        
        result = subprocess.run(
            ["kubectl", "get", "model", self.model_name, "-n", "default", "-o", "json"],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode == 0:
            import json
            model_data = json.loads(result.stdout)
            conditions = model_data.get("status", {}).get("conditions", [])
            available = any(
                c.get("type") == "ModelAvailable" and c.get("status") == "True"
                for c in conditions
            )
            if not available:
                pytest.skip("Model not available yet")
        
        agent_yaml = f"""apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: {self.agent_name}
  namespace: default
spec:
  modelRef:
    name: {self.model_name}
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
        
        assert result.returncode == 0 or "already exists" in result.stderr.lower(), f"Failed to create agent: {result.stderr}"
    
    def test_create_query(self):
        if not self.provider_config:
            pytest.skip("No model provider credentials configured")
        
        query_name = "test-query-cli-create"
        success, message = self.helper.create_query(
            name=query_name,
            agent_name=self.agent_name,
            input_text="Say hello in one sentence",
            timeout=180
        )
        
        assert success, f"Query creation failed: {message}"
        self.created_queries.append(query_name)
    
    def test_get_query(self):
        if not self.provider_config:
            pytest.skip("No model provider credentials configured")
        
        query_name = "test-query-cli-get"
        success, message = self.helper.create_query(
            name=query_name,
            agent_name=self.agent_name,
            input_text="What is 2+2? Answer in one short sentence.",
            timeout=180
        )
        
        if not success:
            pytest.skip(f"Query creation failed: {message}")
        
        self.created_queries.append(query_name)
        
        success, query_data = self.helper.get_query(query_name)
        assert success, "Failed to get query"
        assert query_data is not None
        assert query_data["metadata"]["name"] == query_name
    
    def test_get_query_response(self):
        if not self.provider_config:
            pytest.skip("No model provider credentials configured")
        
        query_name = "test-query-cli-response"
        success, message = self.helper.create_query(
            name=query_name,
            agent_name=self.agent_name,
            input_text="Reply with OK in one sentence.",
            timeout=180
        )
        
        if not success:
            pytest.skip(f"Query creation failed: {message}")
        
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
        if not self.provider_config:
            pytest.skip("No model provider credentials configured")
        
        query_name = "test-query-cli-status"
        success, message = self.helper.create_query(
            name=query_name,
            agent_name=self.agent_name,
            input_text="Status check. Reply in one sentence.",
            timeout=180
        )
        
        if not success:
            pytest.skip(f"Query creation failed: {message}")
        
        self.created_queries.append(query_name)
        
        success, status = self.helper.verify_query_status(query_name)
        assert success, "Failed to verify query status"
        assert status in ["Completed", "Failed", "InProgress"]
    
    def test_delete_query(self):
        if not self.provider_config:
            pytest.skip("No model provider credentials configured")
        
        query_name = "test-query-cli-delete"
        success, message = self.helper.create_query(
            name=query_name,
            agent_name=self.agent_name,
            input_text="Delete me. Reply in one sentence.",
            timeout=180
        )
        
        if not success:
            pytest.skip(f"Query creation failed: {message}")
        
        success, message = self.helper.delete_query(query_name)
        assert success, f"Failed to delete query: {message}"
        
        success, query_data = self.helper.get_query(query_name)
        assert not success or query_data is None, "Query should not exist after deletion"
    
    def test_cleanup_queries(self):
        if not self.provider_config:
            pytest.skip("No model provider credentials configured")
        
        created_count = 0
        for i in range(3):
            query_name = f"test-query-cli-cleanup-{i}"
            success, message = self.helper.create_query(
                name=query_name,
                agent_name=self.agent_name,
                input_text=f"Test {i}. Reply in one sentence.",
                timeout=180
            )
            if success:
                created_count += 1
        
        if created_count == 0:
            pytest.skip("No queries could be created")
        
        success, count = self.helper.cleanup_queries("test-query-cli-cleanup-")
        assert success, "Failed to cleanup queries"
        assert count >= 1, f"Expected at least 1 query deleted, got {count}"
