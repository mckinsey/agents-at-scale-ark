"""Tests for the Ark query extension (ark/api/extensions/query/v1/)."""

import base64
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from types import SimpleNamespace

from ark_sdk.extensions.query import (
    QUERY_EXTENSION_URI,
    QUERY_EXTENSION_METADATA_KEY,
    QueryRef,
    extract_query_ref,
    resolve_query,
    _resolve_value_source,
)


class TestExtractQueryRef(unittest.TestCase):
    def test_extracts_valid_query_ref(self):
        message = SimpleNamespace(
            metadata={
                QUERY_EXTENSION_METADATA_KEY: {
                    "name": "my-query",
                    "namespace": "test-ns",
                }
            }
        )
        ref = extract_query_ref(message)
        self.assertEqual(ref.name, "my-query")
        self.assertEqual(ref.namespace, "test-ns")

    def test_raises_on_missing_metadata(self):
        message = SimpleNamespace(metadata={})
        with self.assertRaises(ValueError) as ctx:
            extract_query_ref(message)
        self.assertIn("Missing or invalid", str(ctx.exception))

    def test_raises_on_none_metadata(self):
        message = SimpleNamespace(metadata=None)
        with self.assertRaises(ValueError):
            extract_query_ref(message)

    def test_raises_on_missing_name(self):
        message = SimpleNamespace(
            metadata={
                QUERY_EXTENSION_METADATA_KEY: {
                    "namespace": "test-ns",
                }
            }
        )
        with self.assertRaises(ValueError) as ctx:
            extract_query_ref(message)
        self.assertIn("name", str(ctx.exception))

    def test_raises_on_missing_namespace(self):
        message = SimpleNamespace(
            metadata={
                QUERY_EXTENSION_METADATA_KEY: {
                    "name": "my-query",
                }
            }
        )
        with self.assertRaises(ValueError) as ctx:
            extract_query_ref(message)
        self.assertIn("namespace", str(ctx.exception))

    def test_raises_on_non_dict_value(self):
        message = SimpleNamespace(
            metadata={QUERY_EXTENSION_METADATA_KEY: "not-a-dict"}
        )
        with self.assertRaises(ValueError):
            extract_query_ref(message)

    def test_no_metadata_attribute(self):
        message = SimpleNamespace()
        with self.assertRaises(ValueError):
            extract_query_ref(message)


class TestResolveQuery(unittest.IsolatedAsyncioTestCase):
    @patch("ark_sdk.k8s.init_k8s", new_callable=AsyncMock)
    @patch("ark_sdk.client.with_ark_client")
    async def test_resolves_agent_target(self, mock_with_client, mock_init_k8s):
        mock_ark = AsyncMock()

        mock_query = MagicMock()
        mock_query.metadata = {"name": "my-query"}
        mock_query.spec.target.type = "agent"
        mock_query.spec.target.name = "my-agent"
        mock_query.spec.parameters = None

        mock_agent = MagicMock()
        mock_agent.metadata = {"name": "my-agent", "labels": {}}
        mock_agent.spec.prompt = "You are helpful"
        mock_agent.spec.description = "Test agent"
        mock_agent.spec.model_ref = None
        mock_agent.spec.parameters = None
        mock_agent.spec.tools = None
        mock_agent.spec.execution_engine = None
        mock_agent.spec.executionEngine = None

        mock_ark.queries.a_get = AsyncMock(return_value=mock_query)
        mock_ark.agents.a_get = AsyncMock(return_value=mock_agent)

        mock_ctx = AsyncMock()
        mock_ctx.__aenter__.return_value = mock_ark
        mock_ctx.__aexit__.return_value = False
        mock_with_client.return_value = mock_ctx

        ref = QueryRef(name="my-query", namespace="default")
        request = await resolve_query(ref, "hello")

        self.assertEqual(request.agent.name, "my-agent")
        self.assertEqual(request.agent.namespace, "default")
        self.assertEqual(request.agent.prompt, "You are helpful")
        self.assertEqual(request.userInput.role, "user")
        self.assertEqual(request.userInput.content, "hello")

    @patch("ark_sdk.k8s.init_k8s", new_callable=AsyncMock)
    @patch("ark_sdk.client.with_ark_client")
    async def test_raises_on_non_agent_target(self, mock_with_client, mock_init_k8s):
        mock_ark = AsyncMock()

        mock_query = MagicMock()
        mock_query.metadata = {"name": "my-query"}
        mock_query.spec.target.type = "model"
        mock_query.spec.target.name = "my-model"

        mock_ark.queries.a_get = AsyncMock(return_value=mock_query)

        mock_ctx = AsyncMock()
        mock_ctx.__aenter__.return_value = mock_ark
        mock_ctx.__aexit__.return_value = False
        mock_with_client.return_value = mock_ctx

        ref = QueryRef(name="my-query", namespace="default")
        with self.assertRaises(ValueError) as ctx:
            await resolve_query(ref, "hello")
        self.assertIn("agent targets", str(ctx.exception))


class TestResolveValueSource(unittest.IsolatedAsyncioTestCase):
    async def test_direct_value_from_dict(self):
        vs = {"value": "direct-val"}
        result = await _resolve_value_source(vs, "default")
        self.assertEqual(result, "direct-val")

    async def test_direct_value_from_object(self):
        vs = SimpleNamespace(value="obj-val", value_from=None)
        result = await _resolve_value_source(vs, "default")
        self.assertEqual(result, "obj-val")

    async def test_empty_when_no_value_or_value_from(self):
        vs = SimpleNamespace(value=None, value_from=None)
        result = await _resolve_value_source(vs, "default")
        self.assertEqual(result, "")

    async def test_empty_dict(self):
        result = await _resolve_value_source({}, "default")
        self.assertEqual(result, "")

    @patch("ark_sdk.extensions.query.SecretClient")
    async def test_secret_key_ref_from_object(self, mock_secret_cls):
        mock_sc = AsyncMock()
        encoded_val = base64.b64encode(b"my-secret-key").decode()
        mock_sc.get_secret_value = AsyncMock(return_value={"value": encoded_val})
        mock_secret_cls.return_value = mock_sc

        secret_ref = SimpleNamespace(name="my-secret", key="token")
        value_from = SimpleNamespace(
            secret_key_ref=secret_ref,
            config_map_key_ref=None,
            secretKeyRef=None,
            configMapKeyRef=None,
        )
        vs = SimpleNamespace(value=None, value_from=value_from, valueFrom=None)
        result = await _resolve_value_source(vs, "test-ns")

        self.assertEqual(result, "my-secret-key")
        mock_secret_cls.assert_called_with(namespace="test-ns")

    @patch("ark_sdk.extensions.query.SecretClient")
    async def test_secret_key_ref_from_dict(self, mock_secret_cls):
        mock_sc = AsyncMock()
        encoded_val = base64.b64encode(b"dict-secret").decode()
        mock_sc.get_secret_value = AsyncMock(return_value={"value": encoded_val})
        mock_secret_cls.return_value = mock_sc

        vs = {
            "valueFrom": {
                "secretKeyRef": {"name": "s1", "key": "k1"}
            }
        }
        result = await _resolve_value_source(vs, "ns1")
        self.assertEqual(result, "dict-secret")

    @patch("ark_sdk.extensions.query.SecretClient")
    async def test_secret_resolution_failure_returns_empty(self, mock_secret_cls):
        mock_sc = AsyncMock()
        mock_sc.get_secret_value = AsyncMock(side_effect=Exception("not found"))
        mock_secret_cls.return_value = mock_sc

        vs = {"valueFrom": {"secretKeyRef": {"name": "missing", "key": "k"}}}
        result = await _resolve_value_source(vs, "ns")
        self.assertEqual(result, "")


class TestResolveModelWithSecrets(unittest.IsolatedAsyncioTestCase):
    @patch("ark_sdk.k8s.init_k8s", new_callable=AsyncMock)
    @patch("ark_sdk.client.with_ark_client")
    async def test_resolves_model_with_api_key(self, mock_with_client, mock_init_k8s):
        mock_ark = AsyncMock()

        mock_query = MagicMock()
        mock_query.metadata = {"name": "q1"}
        mock_query.spec.target.type = "agent"
        mock_query.spec.target.name = "a1"
        mock_query.spec.parameters = None

        mock_openai_config = MagicMock()
        mock_openai_config.api_key = SimpleNamespace(value="sk-test-key", value_from=None)
        mock_openai_config.base_url = SimpleNamespace(value="https://api.example.com/v1", value_from=None)
        mock_openai_config.properties = {"temperature": 0.7}

        mock_model_spec = MagicMock()
        mock_model_spec.model = SimpleNamespace(value="gpt-4.1", value_from=None)
        mock_model_spec.provider = "openai"
        mock_model_spec.config = MagicMock()
        mock_model_spec.config.openai = mock_openai_config

        mock_model_crd = MagicMock()
        mock_model_crd.spec = mock_model_spec

        mock_agent = MagicMock()
        mock_agent.metadata = {"name": "a1", "labels": {}}
        mock_agent.spec.prompt = "hello"
        mock_agent.spec.description = ""
        mock_agent.spec.model_ref = MagicMock()
        mock_agent.spec.model_ref.name = "default"
        mock_agent.spec.model_ref.namespace = None
        mock_agent.spec.parameters = None
        mock_agent.spec.tools = None
        mock_agent.spec.execution_engine = None
        mock_agent.spec.executionEngine = None

        mock_ark.queries.a_get = AsyncMock(return_value=mock_query)
        mock_ark.agents.a_get = AsyncMock(return_value=mock_agent)
        mock_ark.models.a_get = AsyncMock(return_value=mock_model_crd)

        mock_ctx = AsyncMock()
        mock_ctx.__aenter__.return_value = mock_ark
        mock_ctx.__aexit__.return_value = False
        mock_with_client.return_value = mock_ctx

        ref = QueryRef(name="q1", namespace="default")
        request = await resolve_query(ref, "hi")

        self.assertEqual(request.agent.model.name, "gpt-4.1")
        self.assertEqual(request.agent.model.type, "openai")
        self.assertEqual(request.agent.model.config["openai"]["apiKey"], "sk-test-key")
        self.assertEqual(request.agent.model.config["openai"]["baseUrl"], "https://api.example.com/v1")
        self.assertEqual(request.agent.model.config["openai"]["properties"]["temperature"], 0.7)


class TestConversationIdPassthrough(unittest.IsolatedAsyncioTestCase):
    @patch("ark_sdk.k8s.init_k8s", new_callable=AsyncMock)
    @patch("ark_sdk.client.with_ark_client")
    async def test_conversation_id_passed_to_request(self, mock_with_client, mock_init_k8s):
        mock_ark = AsyncMock()

        mock_query = MagicMock()
        mock_query.metadata = {"name": "q1"}
        mock_query.spec.target.type = "agent"
        mock_query.spec.target.name = "a1"
        mock_query.spec.parameters = None

        mock_agent = MagicMock()
        mock_agent.metadata = {"name": "a1", "labels": {}}
        mock_agent.spec.prompt = "hello"
        mock_agent.spec.description = ""
        mock_agent.spec.model_ref = None
        mock_agent.spec.parameters = None
        mock_agent.spec.tools = None
        mock_agent.spec.execution_engine = None
        mock_agent.spec.executionEngine = None

        mock_ark.queries.a_get = AsyncMock(return_value=mock_query)
        mock_ark.agents.a_get = AsyncMock(return_value=mock_agent)

        mock_ctx = AsyncMock()
        mock_ctx.__aenter__.return_value = mock_ark
        mock_ctx.__aexit__.return_value = False
        mock_with_client.return_value = mock_ctx

        ref = QueryRef(name="q1", namespace="default")
        request = await resolve_query(ref, "hi", conversation_id="conv-123")

        self.assertEqual(request.conversationId, "conv-123")

    @patch("ark_sdk.k8s.init_k8s", new_callable=AsyncMock)
    @patch("ark_sdk.client.with_ark_client")
    async def test_empty_conversation_id_default(self, mock_with_client, mock_init_k8s):
        mock_ark = AsyncMock()

        mock_query = MagicMock()
        mock_query.metadata = {"name": "q1"}
        mock_query.spec.target.type = "agent"
        mock_query.spec.target.name = "a1"
        mock_query.spec.parameters = None

        mock_agent = MagicMock()
        mock_agent.metadata = {"name": "a1", "labels": {}}
        mock_agent.spec.prompt = "hello"
        mock_agent.spec.description = ""
        mock_agent.spec.model_ref = None
        mock_agent.spec.parameters = None
        mock_agent.spec.tools = None
        mock_agent.spec.execution_engine = None
        mock_agent.spec.executionEngine = None

        mock_ark.queries.a_get = AsyncMock(return_value=mock_query)
        mock_ark.agents.a_get = AsyncMock(return_value=mock_agent)

        mock_ctx = AsyncMock()
        mock_ctx.__aenter__.return_value = mock_ark
        mock_ctx.__aexit__.return_value = False
        mock_with_client.return_value = mock_ctx

        ref = QueryRef(name="q1", namespace="default")
        request = await resolve_query(ref, "hi")

        self.assertEqual(request.conversationId, "")


class TestHistoryFieldRemoved(unittest.TestCase):
    def test_request_has_no_history_field(self):
        from ark_sdk.executor import ExecutionEngineRequest
        self.assertFalse(hasattr(ExecutionEngineRequest.model_fields, "history"))

    def test_request_has_conversation_id_field(self):
        from ark_sdk.executor import ExecutionEngineRequest
        self.assertIn("conversationId", ExecutionEngineRequest.model_fields)


class TestBuildMCPServers(unittest.IsolatedAsyncioTestCase):
    def _make_tool_crd(self, tool_type, server_name=None, mcp_tool_name=None):
        tool_crd = MagicMock()
        tool_crd.spec.type = tool_type
        if tool_type == "mcp" and server_name:
            mcp_ref = MagicMock()
            server_ref = MagicMock()
            server_ref.name = server_name
            server_ref.namespace = None
            mcp_ref.mcp_server_ref = server_ref
            mcp_ref.mcpServerRef = None
            mcp_ref.tool_name = mcp_tool_name
            mcp_ref.toolName = None
            tool_crd.spec.mcp = mcp_ref
        else:
            tool_crd.spec.mcp = None
        return tool_crd

    def _make_mcp_server_crd(self, address="http://server:8080/mcp", transport="http", timeout="30s", headers=None):
        server_crd = MagicMock()
        server_crd.spec.address = SimpleNamespace(value=address, value_from=None)
        server_crd.spec.transport = transport
        server_crd.spec.timeout = timeout
        if headers:
            server_crd.spec.headers = [
                SimpleNamespace(name=k, value=SimpleNamespace(value=v, value_from=None))
                for k, v in headers.items()
            ]
        else:
            server_crd.spec.headers = None
        return server_crd

    def _make_agent_tool(self, name):
        tool = MagicMock()
        tool.name = name
        return tool

    @patch("ark_sdk.k8s.init_k8s", new_callable=AsyncMock)
    @patch("ark_sdk.client.with_ark_client")
    async def test_single_server_multiple_tools(self, mock_with_client, mock_init_k8s):
        mock_ark = AsyncMock()

        mock_query = MagicMock()
        mock_query.metadata = {"name": "q1"}
        mock_query.spec.target.type = "agent"
        mock_query.spec.target.name = "a1"
        mock_query.spec.parameters = None

        mock_agent = MagicMock()
        mock_agent.metadata = {"name": "a1", "labels": {}}
        mock_agent.spec.prompt = "hello"
        mock_agent.spec.description = ""
        mock_agent.spec.model_ref = None
        mock_agent.spec.parameters = None
        mock_agent.spec.tools = [
            self._make_agent_tool("github-mcp-search-repos"),
            self._make_agent_tool("github-mcp-create-issue"),
        ]
        mock_agent.spec.execution_engine = None
        mock_agent.spec.executionEngine = None

        tool_crd_1 = self._make_tool_crd("mcp", "github-mcp", "search_repos")
        tool_crd_2 = self._make_tool_crd("mcp", "github-mcp", "create_issue")
        server_crd = self._make_mcp_server_crd(
            address="http://github-mcp:8080/mcp",
            headers={"Authorization": "Bearer token123"},
        )

        mock_ark.queries.a_get = AsyncMock(return_value=mock_query)
        mock_ark.agents.a_get = AsyncMock(return_value=mock_agent)
        mock_ark.tools.a_get = AsyncMock(side_effect=[tool_crd_1, tool_crd_2])
        mock_ark.mcpservers.a_get = AsyncMock(return_value=server_crd)

        mock_ctx = AsyncMock()
        mock_ctx.__aenter__.return_value = mock_ark
        mock_ctx.__aexit__.return_value = False
        mock_with_client.return_value = mock_ctx

        ref = QueryRef(name="q1", namespace="default")
        request = await resolve_query(ref, "hi")

        self.assertEqual(len(request.mcpServers), 1)
        server = request.mcpServers[0]
        self.assertEqual(server.name, "github-mcp")
        self.assertEqual(server.url, "http://github-mcp:8080/mcp")
        self.assertEqual(server.transport, "http")
        self.assertIn("search_repos", server.tools)
        self.assertIn("create_issue", server.tools)
        self.assertEqual(server.headers["Authorization"], "Bearer token123")

    @patch("ark_sdk.k8s.init_k8s", new_callable=AsyncMock)
    @patch("ark_sdk.client.with_ark_client")
    async def test_multiple_servers(self, mock_with_client, mock_init_k8s):
        mock_ark = AsyncMock()

        mock_query = MagicMock()
        mock_query.metadata = {"name": "q1"}
        mock_query.spec.target.type = "agent"
        mock_query.spec.target.name = "a1"
        mock_query.spec.parameters = None

        mock_agent = MagicMock()
        mock_agent.metadata = {"name": "a1", "labels": {}}
        mock_agent.spec.prompt = "hello"
        mock_agent.spec.description = ""
        mock_agent.spec.model_ref = None
        mock_agent.spec.parameters = None
        mock_agent.spec.tools = [
            self._make_agent_tool("github-mcp-search"),
            self._make_agent_tool("slack-mcp-send"),
        ]
        mock_agent.spec.execution_engine = None
        mock_agent.spec.executionEngine = None

        tool_crd_1 = self._make_tool_crd("mcp", "github-mcp", "search")
        tool_crd_2 = self._make_tool_crd("mcp", "slack-mcp", "send_message")
        github_server = self._make_mcp_server_crd("http://github:8080/mcp", "http")
        slack_server = self._make_mcp_server_crd("http://slack:9000/mcp", "sse", "60s")

        mock_ark.queries.a_get = AsyncMock(return_value=mock_query)
        mock_ark.agents.a_get = AsyncMock(return_value=mock_agent)
        mock_ark.tools.a_get = AsyncMock(side_effect=[tool_crd_1, tool_crd_2])
        mock_ark.mcpservers.a_get = AsyncMock(side_effect=[github_server, slack_server])

        mock_ctx = AsyncMock()
        mock_ctx.__aenter__.return_value = mock_ark
        mock_ctx.__aexit__.return_value = False
        mock_with_client.return_value = mock_ctx

        ref = QueryRef(name="q1", namespace="default")
        request = await resolve_query(ref, "hi")

        self.assertEqual(len(request.mcpServers), 2)
        names = {s.name for s in request.mcpServers}
        self.assertEqual(names, {"github-mcp", "slack-mcp"})

    @patch("ark_sdk.k8s.init_k8s", new_callable=AsyncMock)
    @patch("ark_sdk.client.with_ark_client")
    async def test_mixed_tool_types_only_mcp_included(self, mock_with_client, mock_init_k8s):
        mock_ark = AsyncMock()

        mock_query = MagicMock()
        mock_query.metadata = {"name": "q1"}
        mock_query.spec.target.type = "agent"
        mock_query.spec.target.name = "a1"
        mock_query.spec.parameters = None

        mock_agent = MagicMock()
        mock_agent.metadata = {"name": "a1", "labels": {}}
        mock_agent.spec.prompt = "hello"
        mock_agent.spec.description = ""
        mock_agent.spec.model_ref = None
        mock_agent.spec.parameters = None
        mock_agent.spec.tools = [
            self._make_agent_tool("github-mcp-search"),
            self._make_agent_tool("weather-api"),
        ]
        mock_agent.spec.execution_engine = None
        mock_agent.spec.executionEngine = None

        mcp_tool = self._make_tool_crd("mcp", "github-mcp", "search")
        http_tool = self._make_tool_crd("http")
        server_crd = self._make_mcp_server_crd("http://github:8080/mcp")

        mock_ark.queries.a_get = AsyncMock(return_value=mock_query)
        mock_ark.agents.a_get = AsyncMock(return_value=mock_agent)
        mock_ark.tools.a_get = AsyncMock(side_effect=[mcp_tool, http_tool])
        mock_ark.mcpservers.a_get = AsyncMock(return_value=server_crd)

        mock_ctx = AsyncMock()
        mock_ctx.__aenter__.return_value = mock_ark
        mock_ctx.__aexit__.return_value = False
        mock_with_client.return_value = mock_ctx

        ref = QueryRef(name="q1", namespace="default")
        request = await resolve_query(ref, "hi")

        self.assertEqual(len(request.mcpServers), 1)
        self.assertEqual(request.mcpServers[0].name, "github-mcp")
        self.assertEqual(request.mcpServers[0].tools, ["search"])

    @patch("ark_sdk.k8s.init_k8s", new_callable=AsyncMock)
    @patch("ark_sdk.client.with_ark_client")
    async def test_server_not_found_skipped_with_warning(self, mock_with_client, mock_init_k8s):
        mock_ark = AsyncMock()

        mock_query = MagicMock()
        mock_query.metadata = {"name": "q1"}
        mock_query.spec.target.type = "agent"
        mock_query.spec.target.name = "a1"
        mock_query.spec.parameters = None

        mock_agent = MagicMock()
        mock_agent.metadata = {"name": "a1", "labels": {}}
        mock_agent.spec.prompt = "hello"
        mock_agent.spec.description = ""
        mock_agent.spec.model_ref = None
        mock_agent.spec.parameters = None
        mock_agent.spec.tools = [
            self._make_agent_tool("missing-server-tool"),
            self._make_agent_tool("good-server-tool"),
        ]
        mock_agent.spec.execution_engine = None
        mock_agent.spec.executionEngine = None

        missing_tool = self._make_tool_crd("mcp", "missing-mcp", "some_tool")
        good_tool = self._make_tool_crd("mcp", "good-mcp", "good_tool")
        good_server = self._make_mcp_server_crd("http://good:8080/mcp")

        mock_ark.queries.a_get = AsyncMock(return_value=mock_query)
        mock_ark.agents.a_get = AsyncMock(return_value=mock_agent)
        mock_ark.tools.a_get = AsyncMock(side_effect=[missing_tool, good_tool])
        mock_ark.mcpservers.a_get = AsyncMock(side_effect=[
            Exception("not found"),
            good_server,
        ])

        mock_ctx = AsyncMock()
        mock_ctx.__aenter__.return_value = mock_ark
        mock_ctx.__aexit__.return_value = False
        mock_with_client.return_value = mock_ctx

        ref = QueryRef(name="q1", namespace="default")
        with self.assertLogs("ark_sdk.extensions.query", level="WARNING") as log:
            request = await resolve_query(ref, "hi")

        self.assertEqual(len(request.mcpServers), 1)
        self.assertEqual(request.mcpServers[0].name, "good-mcp")
        self.assertTrue(any("missing-mcp" in msg for msg in log.output))

    @patch("ark_sdk.k8s.init_k8s", new_callable=AsyncMock)
    @patch("ark_sdk.client.with_ark_client")
    async def test_server_with_unresolvable_address_skipped(self, mock_with_client, mock_init_k8s):
        mock_ark = AsyncMock()

        mock_query = MagicMock()
        mock_query.metadata = {"name": "q1"}
        mock_query.spec.target.type = "agent"
        mock_query.spec.target.name = "a1"
        mock_query.spec.parameters = None

        mock_agent = MagicMock()
        mock_agent.metadata = {"name": "a1", "labels": {}}
        mock_agent.spec.prompt = "hello"
        mock_agent.spec.description = ""
        mock_agent.spec.model_ref = None
        mock_agent.spec.parameters = None
        mock_agent.spec.tools = [self._make_agent_tool("bad-tool")]
        mock_agent.spec.execution_engine = None
        mock_agent.spec.executionEngine = None

        tool_crd = self._make_tool_crd("mcp", "bad-mcp", "tool")
        bad_server = MagicMock()
        bad_server.spec.address = SimpleNamespace(value=None, value_from=None)
        bad_server.spec.transport = "http"
        bad_server.spec.timeout = "30s"
        bad_server.spec.headers = None

        mock_ark.queries.a_get = AsyncMock(return_value=mock_query)
        mock_ark.agents.a_get = AsyncMock(return_value=mock_agent)
        mock_ark.tools.a_get = AsyncMock(return_value=tool_crd)
        mock_ark.mcpservers.a_get = AsyncMock(return_value=bad_server)

        mock_ctx = AsyncMock()
        mock_ctx.__aenter__.return_value = mock_ark
        mock_ctx.__aexit__.return_value = False
        mock_with_client.return_value = mock_ctx

        ref = QueryRef(name="q1", namespace="default")
        with self.assertLogs("ark_sdk.extensions.query", level="WARNING") as log:
            request = await resolve_query(ref, "hi")

        self.assertEqual(len(request.mcpServers), 0)
        self.assertTrue(any("no resolvable address" in msg for msg in log.output))


class TestExtensionConstants(unittest.TestCase):
    def test_uri_matches_github_path(self):
        self.assertIn("mckinsey/agents-at-scale-ark", QUERY_EXTENSION_URI)
        self.assertIn("extensions/query/v1", QUERY_EXTENSION_URI)

    def test_metadata_key_derived_from_uri(self):
        self.assertTrue(QUERY_EXTENSION_METADATA_KEY.startswith(QUERY_EXTENSION_URI))
        self.assertTrue(QUERY_EXTENSION_METADATA_KEY.endswith("/ref"))


if __name__ == "__main__":
    unittest.main()
