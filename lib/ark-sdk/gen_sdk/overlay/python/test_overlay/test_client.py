"""Tests for with_ark_client lifecycle - every ApiClient it creates must be closed.

Deliberately avoids bare MagicMock for the ARK client: MagicMock auto-creates any
attribute, so a client shaped differently from the real one would still pass.
"""
import unittest
from unittest.mock import MagicMock, patch

from ark_sdk.client import close_ark_client, with_ark_client


class FakeApiClient:
    def __init__(self):
        self.closed = 0

    def close(self):
        self.closed += 1


class FakeResourceClient:
    """Mirrors ARKResourceClient, which owns the ApiClient."""

    def __init__(self):
        self.api_client = FakeApiClient()


class FakeSecretClient:
    """Mirrors SecretClient, which owns no ApiClient."""


class FakeArkClient:
    """Mirrors _ARKClient: no top-level api_client, one per resource client."""

    def __init__(self, resource_count=3):
        self.namespace = "default"
        self.user_agent = None
        self.resources = [FakeResourceClient() for _ in range(resource_count)]
        for index, resource in enumerate(self.resources):
            setattr(self, f"resource_{index}", resource)
        self.secrets = FakeSecretClient()


class TestCloseArkClient(unittest.TestCase):

    def test_closes_every_resource_client(self):
        ark_client = FakeArkClient(resource_count=9)
        close_ark_client(ark_client)
        self.assertTrue(all(r.api_client.closed == 1 for r in ark_client.resources))

    def test_skips_attributes_without_an_api_client(self):
        ark_client = FakeArkClient(resource_count=1)
        close_ark_client(ark_client)
        self.assertEqual(ark_client.resources[0].api_client.closed, 1)

    def test_one_failing_close_does_not_stop_the_others(self):
        ark_client = FakeArkClient(resource_count=3)
        ark_client.resources[0].api_client.close = MagicMock(side_effect=RuntimeError("boom"))
        close_ark_client(ark_client)
        self.assertEqual(ark_client.resources[1].api_client.closed, 1)
        self.assertEqual(ark_client.resources[2].api_client.closed, 1)


class TestWithArkClientClosesClient(unittest.IsolatedAsyncioTestCase):

    @patch("ark_sdk.client.get_client")
    async def test_closes_on_exit(self, mock_get_client):
        ark_client = FakeArkClient()
        mock_get_client.return_value = ark_client

        async with with_ark_client("default", "v1alpha1") as yielded:
            self.assertIs(yielded, ark_client)
            self.assertTrue(all(r.api_client.closed == 0 for r in ark_client.resources))

        self.assertTrue(all(r.api_client.closed == 1 for r in ark_client.resources))

    @patch("ark_sdk.client.get_client")
    async def test_closes_when_body_raises(self, mock_get_client):
        ark_client = FakeArkClient()
        mock_get_client.return_value = ark_client

        with self.assertRaises(ValueError):
            async with with_ark_client("default", "v1alpha1"):
                raise ValueError("boom")

        self.assertTrue(all(r.api_client.closed == 1 for r in ark_client.resources))

    @patch("ark_sdk.client.get_client")
    async def test_each_context_closes_its_own_client(self, mock_get_client):
        first, second = FakeArkClient(), FakeArkClient()
        mock_get_client.side_effect = [first, second]

        async with with_ark_client("default", "v1alpha1"):
            pass
        async with with_ark_client("other", "v1alpha1"):
            pass

        self.assertTrue(all(r.api_client.closed == 1 for r in first.resources))
        self.assertTrue(all(r.api_client.closed == 1 for r in second.resources))


class TestRealClientShape(unittest.TestCase):
    """Guards the assumption close_ark_client relies on: the ApiClient lives on the
    resource clients, not on the ARK client itself."""

    def test_resource_client_owns_the_api_client(self):
        from ark_sdk.versions import ARKResourceClient, _ARKClient

        self.assertIn("api_client", ARKResourceClient.__init__.__code__.co_names)
        self.assertNotIn("api_client", _ARKClient.__init__.__code__.co_names)


if __name__ == "__main__":
    unittest.main()
