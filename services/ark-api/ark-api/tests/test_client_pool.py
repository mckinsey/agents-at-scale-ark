import time
import unittest
from unittest.mock import patch, MagicMock

from ark_sdk.impersonation import ImpersonationConfig
from ark_api.auth.client_pool import ImpersonatingClientPool


class TestImpersonatingClientPool(unittest.TestCase):

    def test_make_key_none(self):
        pool = ImpersonatingClientPool()
        self.assertIsNone(pool._make_key(None))

    def test_make_key_with_config(self):
        pool = ImpersonatingClientPool()
        config = ImpersonationConfig(username="jane@acme.com", groups=["a", "b"])
        key = pool._make_key(config)
        self.assertEqual(key, ("jane@acme.com", frozenset(["a", "b"])))

    def test_is_expired(self):
        pool = ImpersonatingClientPool(ttl_seconds=1)
        self.assertFalse(pool._is_expired(time.monotonic()))
        self.assertTrue(pool._is_expired(time.monotonic() - 2))


class TestImpersonatingClientPoolAsync(unittest.IsolatedAsyncioTestCase):

    @patch("ark_api.auth.client_pool.get_client")
    async def test_cache_hit(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        pool = ImpersonatingClientPool()
        config = ImpersonationConfig(username="jane@acme.com", groups=["a"])

        client1 = await pool.get_or_create("default", "v1alpha1", config)
        client2 = await pool.get_or_create("default", "v1alpha1", config)

        self.assertIs(client1, client2)
        mock_get_client.assert_called_once()

    @patch("ark_api.auth.client_pool.get_client")
    async def test_cache_miss_different_users(self, mock_get_client):
        mock_get_client.side_effect = [MagicMock(), MagicMock()]

        pool = ImpersonatingClientPool()
        config_a = ImpersonationConfig(username="alice@acme.com", groups=[])
        config_b = ImpersonationConfig(username="bob@acme.com", groups=[])

        client_a = await pool.get_or_create("default", "v1alpha1", config_a)
        client_b = await pool.get_or_create("default", "v1alpha1", config_b)

        self.assertIsNot(client_a, client_b)
        self.assertEqual(mock_get_client.call_count, 2)

    @patch("ark_api.auth.client_pool.get_client")
    async def test_eviction(self, mock_get_client):
        mock_get_client.return_value = MagicMock()

        pool = ImpersonatingClientPool(max_size=2)

        for i in range(3):
            config = ImpersonationConfig(username=f"user{i}@acme.com", groups=[])
            await pool.get_or_create("default", "v1alpha1", config)

        self.assertEqual(len(pool._cache), 2)

    @patch("ark_api.auth.client_pool.get_client")
    async def test_none_key_for_no_impersonation(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        pool = ImpersonatingClientPool()
        client = await pool.get_or_create("default", "v1alpha1", None)

        self.assertIs(client, mock_client)
        self.assertIn(None, pool._cache)

    @patch("ark_api.auth.client_pool.get_client")
    async def test_ttl_expiry(self, mock_get_client):
        mock_get_client.side_effect = [MagicMock(), MagicMock()]

        pool = ImpersonatingClientPool(ttl_seconds=0)
        config = ImpersonationConfig(username="jane@acme.com", groups=[])

        client1 = await pool.get_or_create("default", "v1alpha1", config)
        client2 = await pool.get_or_create("default", "v1alpha1", config)

        self.assertIsNot(client1, client2)
        self.assertEqual(mock_get_client.call_count, 2)


class TestGetImpersonationConfig(unittest.TestCase):

    def test_disabled_returns_none(self):
        import os
        from ark_api.auth.dependencies import get_impersonation_config

        request = MagicMock()
        request.state.user_identity = MagicMock(username="jane@acme.com", groups=["a"])

        with patch.dict(os.environ, {"IMPERSONATION_ENABLED": "false"}, clear=False):
            result = get_impersonation_config(request)
        self.assertIsNone(result)

    def test_enabled_with_identity(self):
        import os
        from ark_api.auth.dependencies import get_impersonation_config
        from ark_api.models.auth import UserIdentity

        request = MagicMock()
        request.state.user_identity = UserIdentity(username="jane@acme.com", groups=["team-a"])

        with patch.dict(os.environ, {"IMPERSONATION_ENABLED": "true"}, clear=False):
            result = get_impersonation_config(request)
        self.assertIsNotNone(result)
        self.assertEqual(result.username, "jane@acme.com")
        self.assertEqual(result.groups, ["team-a"])

    def test_enabled_without_identity(self):
        import os
        from ark_api.auth.dependencies import get_impersonation_config

        request = MagicMock(spec=[])
        request.state = MagicMock(spec=[])

        with patch.dict(os.environ, {"IMPERSONATION_ENABLED": "true"}, clear=False):
            result = get_impersonation_config(request)
        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
