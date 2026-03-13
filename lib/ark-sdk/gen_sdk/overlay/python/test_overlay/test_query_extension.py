"""Tests for the Ark query extension (ark/api/extensions/query/v1/)."""

import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from types import SimpleNamespace

from ark_sdk.extensions.query import (
    QUERY_EXTENSION_URI,
    QUERY_EXTENSION_METADATA_KEY,
    QueryRef,
    extract_query_ref,
    resolve_query,
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
    @patch("ark_sdk.client.with_ark_client")
    async def test_resolves_agent_target(self, mock_with_client):
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

    @patch("ark_sdk.client.with_ark_client")
    async def test_raises_on_non_agent_target(self, mock_with_client):
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


class TestExtensionConstants(unittest.TestCase):
    def test_uri_matches_github_path(self):
        self.assertIn("mckinsey/agents-at-scale-ark", QUERY_EXTENSION_URI)
        self.assertIn("extensions/query/v1", QUERY_EXTENSION_URI)

    def test_metadata_key_derived_from_uri(self):
        self.assertTrue(QUERY_EXTENSION_METADATA_KEY.startswith(QUERY_EXTENSION_URI))
        self.assertTrue(QUERY_EXTENSION_METADATA_KEY.endswith("/ref"))


if __name__ == "__main__":
    unittest.main()
