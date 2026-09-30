"""Tests for with_ark_client lifecycle - the client it creates must be closed."""
import unittest
from unittest.mock import MagicMock, patch

from ark_sdk.client import with_ark_client


class TestWithArkClientClosesClient(unittest.IsolatedAsyncioTestCase):

    @patch("ark_sdk.client.get_client")
    async def test_closes_api_client_on_exit(self, mock_get_client):
        ark_client = MagicMock()
        mock_get_client.return_value = ark_client

        async with with_ark_client("default", "v1alpha1") as yielded:
            self.assertIs(yielded, ark_client)
            ark_client.api_client.close.assert_not_called()

        ark_client.api_client.close.assert_called_once()

    @patch("ark_sdk.client.get_client")
    async def test_closes_api_client_when_body_raises(self, mock_get_client):
        ark_client = MagicMock()
        mock_get_client.return_value = ark_client

        with self.assertRaises(ValueError):
            async with with_ark_client("default", "v1alpha1"):
                raise ValueError("boom")

        ark_client.api_client.close.assert_called_once()

    @patch("ark_sdk.client.get_client")
    async def test_each_context_closes_its_own_client(self, mock_get_client):
        first, second = MagicMock(), MagicMock()
        mock_get_client.side_effect = [first, second]

        async with with_ark_client("default", "v1alpha1"):
            pass
        async with with_ark_client("other", "v1alpha1"):
            pass

        first.api_client.close.assert_called_once()
        second.api_client.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
