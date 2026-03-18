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


class TestExtensionConstants(unittest.TestCase):
    def test_uri_matches_github_path(self):
        self.assertIn("mckinsey/agents-at-scale-ark", QUERY_EXTENSION_URI)
        self.assertIn("extensions/query/v1", QUERY_EXTENSION_URI)

    def test_metadata_key_derived_from_uri(self):
        self.assertTrue(QUERY_EXTENSION_METADATA_KEY.startswith(QUERY_EXTENSION_URI))
        self.assertTrue(QUERY_EXTENSION_METADATA_KEY.endswith("/ref"))


if __name__ == "__main__":
    unittest.main()
