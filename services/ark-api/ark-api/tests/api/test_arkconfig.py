"""Tests for the ArkConfig singleton endpoint."""
import os
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from kubernetes_asyncio.client.rest import ApiException

from ark_api.auth.constants import AuthMode

os.environ["AUTH_MODE"] = AuthMode.OPEN


def _not_found() -> ApiException:
    exc = ApiException(status=404, reason="Not Found")
    exc.body = '{"kind":"Status","apiVersion":"v1","status":"Failure","message":"not found"}'
    return exc


class TestArkConfigAPI(unittest.TestCase):
    def setUp(self) -> None:
        from ark_api.main import app

        self.client = TestClient(app)

    @patch("ark_api.api.v1.arkconfig.CustomObjectsApi")
    @patch("ark_api.api.v1.client_utils.create_api_client")
    def test_get_returns_defaults_when_missing(self, mock_api_client, mock_custom_api_cls):
        mock_api_client.return_value.__aenter__.return_value = mock_api_client
        mock_custom = mock_custom_api_cls.return_value
        mock_custom.get_cluster_custom_object = AsyncMock(side_effect=_not_found())

        resp = self.client.get("/v1/arkconfig")

        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertFalse(body["exists"])
        self.assertIsNone(body["queryTTL"])

    @patch("ark_api.api.v1.arkconfig.CustomObjectsApi")
    @patch("ark_api.api.v1.client_utils.create_api_client")
    def test_get_returns_existing(self, mock_api_client, mock_custom_api_cls):
        mock_api_client.return_value.__aenter__.return_value = mock_api_client
        mock_custom = mock_custom_api_cls.return_value
        mock_custom.get_cluster_custom_object = AsyncMock(
            return_value={"spec": {"queryTTL": "720h"}, "metadata": {"name": "default"}}
        )

        resp = self.client.get("/v1/arkconfig")

        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertTrue(body["exists"])
        self.assertEqual(body["queryTTL"], "720h")

    @patch("ark_api.api.v1.arkconfig.CustomObjectsApi")
    @patch("ark_api.api.v1.client_utils.create_api_client")
    def test_put_creates_when_missing(self, mock_api_client, mock_custom_api_cls):
        mock_api_client.return_value.__aenter__.return_value = mock_api_client
        mock_custom = mock_custom_api_cls.return_value
        mock_custom.get_cluster_custom_object = AsyncMock(side_effect=_not_found())
        mock_custom.create_cluster_custom_object = AsyncMock(
            return_value={"spec": {"queryTTL": "240h"}, "metadata": {"name": "default"}}
        )

        resp = self.client.put("/v1/arkconfig", json={"queryTTL": "240h"})

        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertTrue(body["exists"])
        self.assertEqual(body["queryTTL"], "240h")
        mock_custom.create_cluster_custom_object.assert_awaited_once()
        call_kwargs = mock_custom.create_cluster_custom_object.await_args.kwargs
        self.assertEqual(call_kwargs["body"]["spec"], {"queryTTL": "240h"})

    @patch("ark_api.api.v1.arkconfig.CustomObjectsApi")
    @patch("ark_api.api.v1.client_utils.create_api_client")
    def test_put_updates_existing(self, mock_api_client, mock_custom_api_cls):
        mock_api_client.return_value.__aenter__.return_value = mock_api_client
        mock_custom = mock_custom_api_cls.return_value
        mock_custom.get_cluster_custom_object = AsyncMock(
            return_value={
                "apiVersion": "ark.mckinsey.com/v1alpha1",
                "kind": "ArkConfig",
                "metadata": {"name": "default", "resourceVersion": "123"},
                "spec": {"queryTTL": "720h"},
            }
        )
        mock_custom.replace_cluster_custom_object = AsyncMock(
            return_value={"spec": {"queryTTL": "48h"}, "metadata": {"name": "default"}}
        )

        resp = self.client.put("/v1/arkconfig", json={"queryTTL": "48h"})

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["queryTTL"], "48h")
        mock_custom.replace_cluster_custom_object.assert_awaited_once()
        call_kwargs = mock_custom.replace_cluster_custom_object.await_args.kwargs
        self.assertEqual(call_kwargs["body"]["spec"]["queryTTL"], "48h")

    @patch("ark_api.api.v1.arkconfig.CustomObjectsApi")
    @patch("ark_api.api.v1.client_utils.create_api_client")
    def test_put_null_clears_value_on_existing(self, mock_api_client, mock_custom_api_cls):
        mock_api_client.return_value.__aenter__.return_value = mock_api_client
        mock_custom = mock_custom_api_cls.return_value
        mock_custom.get_cluster_custom_object = AsyncMock(
            return_value={
                "apiVersion": "ark.mckinsey.com/v1alpha1",
                "kind": "ArkConfig",
                "metadata": {"name": "default"},
                "spec": {"queryTTL": "720h"},
            }
        )
        mock_custom.replace_cluster_custom_object = AsyncMock(
            return_value={"spec": {}, "metadata": {"name": "default"}}
        )

        resp = self.client.put("/v1/arkconfig", json={"queryTTL": None})

        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.json()["queryTTL"])
        call_kwargs = mock_custom.replace_cluster_custom_object.await_args.kwargs
        self.assertNotIn("queryTTL", call_kwargs["body"]["spec"])

    @patch("ark_api.api.v1.arkconfig.CustomObjectsApi")
    @patch("ark_api.api.v1.client_utils.create_api_client")
    def test_get_returns_default_memory(self, mock_api_client, mock_custom_api_cls):
        mock_api_client.return_value.__aenter__.return_value = mock_api_client
        mock_custom = mock_custom_api_cls.return_value
        mock_custom.get_cluster_custom_object = AsyncMock(
            return_value={
                "spec": {"defaultMemory": {"name": "broker-memory"}},
                "metadata": {"name": "default"},
            }
        )

        resp = self.client.get("/v1/arkconfig")

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["defaultMemory"], {"name": "broker-memory"})

    @patch("ark_api.api.v1.arkconfig.CustomObjectsApi")
    @patch("ark_api.api.v1.client_utils.create_api_client")
    def test_put_sets_default_memory(self, mock_api_client, mock_custom_api_cls):
        mock_api_client.return_value.__aenter__.return_value = mock_api_client
        mock_custom = mock_custom_api_cls.return_value
        mock_custom.get_cluster_custom_object = AsyncMock(side_effect=_not_found())
        mock_custom.create_cluster_custom_object = AsyncMock(
            return_value={
                "spec": {"defaultMemory": {"name": "default"}},
                "metadata": {"name": "default"},
            }
        )

        resp = self.client.put("/v1/arkconfig", json={"defaultMemory": {"name": "default"}})

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["defaultMemory"], {"name": "default"})
        call_kwargs = mock_custom.create_cluster_custom_object.await_args.kwargs
        self.assertEqual(call_kwargs["body"]["spec"], {"defaultMemory": {"name": "default"}})

    @patch("ark_api.api.v1.arkconfig.CustomObjectsApi")
    @patch("ark_api.api.v1.client_utils.create_api_client")
    def test_put_ttl_only_leaves_default_memory_untouched(self, mock_api_client, mock_custom_api_cls):
        mock_api_client.return_value.__aenter__.return_value = mock_api_client
        mock_custom = mock_custom_api_cls.return_value
        mock_custom.get_cluster_custom_object = AsyncMock(
            return_value={
                "apiVersion": "ark.mckinsey.com/v1alpha1",
                "kind": "ArkConfig",
                "metadata": {"name": "default"},
                "spec": {"queryTTL": "720h", "defaultMemory": {"name": "broker-memory"}},
            }
        )
        mock_custom.replace_cluster_custom_object = AsyncMock(
            return_value={
                "spec": {"queryTTL": "48h", "defaultMemory": {"name": "broker-memory"}},
                "metadata": {"name": "default"},
            }
        )

        resp = self.client.put("/v1/arkconfig", json={"queryTTL": "48h"})

        self.assertEqual(resp.status_code, 200)
        call_kwargs = mock_custom.replace_cluster_custom_object.await_args.kwargs
        self.assertEqual(call_kwargs["body"]["spec"]["queryTTL"], "48h")
        self.assertEqual(
            call_kwargs["body"]["spec"]["defaultMemory"], {"name": "broker-memory"}
        )

    @patch("ark_api.api.v1.arkconfig.CustomObjectsApi")
    @patch("ark_api.api.v1.client_utils.create_api_client")
    def test_put_default_memory_only_leaves_query_ttl_untouched(self, mock_api_client, mock_custom_api_cls):
        mock_api_client.return_value.__aenter__.return_value = mock_api_client
        mock_custom = mock_custom_api_cls.return_value
        mock_custom.get_cluster_custom_object = AsyncMock(
            return_value={
                "apiVersion": "ark.mckinsey.com/v1alpha1",
                "kind": "ArkConfig",
                "metadata": {"name": "default"},
                "spec": {"queryTTL": "720h"},
            }
        )
        mock_custom.replace_cluster_custom_object = AsyncMock(
            return_value={
                "spec": {"queryTTL": "720h", "defaultMemory": {"name": "broker-memory"}},
                "metadata": {"name": "default"},
            }
        )

        resp = self.client.put(
            "/v1/arkconfig", json={"defaultMemory": {"name": "broker-memory"}}
        )

        self.assertEqual(resp.status_code, 200)
        call_kwargs = mock_custom.replace_cluster_custom_object.await_args.kwargs
        self.assertEqual(call_kwargs["body"]["spec"]["queryTTL"], "720h")
        self.assertEqual(
            call_kwargs["body"]["spec"]["defaultMemory"], {"name": "broker-memory"}
        )

    @patch("ark_api.api.v1.arkconfig.CustomObjectsApi")
    @patch("ark_api.api.v1.client_utils.create_api_client")
    def test_put_empty_body_touches_nothing(self, mock_api_client, mock_custom_api_cls):
        mock_api_client.return_value.__aenter__.return_value = mock_api_client
        mock_custom = mock_custom_api_cls.return_value
        stored = {
            "apiVersion": "ark.mckinsey.com/v1alpha1",
            "kind": "ArkConfig",
            "metadata": {"name": "default"},
            "spec": {"queryTTL": "720h", "defaultMemory": {"name": "broker-memory"}},
        }
        mock_custom.get_cluster_custom_object = AsyncMock(return_value=stored)
        mock_custom.replace_cluster_custom_object = AsyncMock(
            return_value={"spec": stored["spec"], "metadata": {"name": "default"}}
        )

        resp = self.client.put("/v1/arkconfig", json={})

        self.assertEqual(resp.status_code, 200)
        call_kwargs = mock_custom.replace_cluster_custom_object.await_args.kwargs
        self.assertEqual(
            call_kwargs["body"]["spec"],
            {"queryTTL": "720h", "defaultMemory": {"name": "broker-memory"}},
        )

    @patch("ark_api.api.v1.arkconfig.CustomObjectsApi")
    @patch("ark_api.api.v1.client_utils.create_api_client")
    def test_put_empty_string_clears_query_ttl(self, mock_api_client, mock_custom_api_cls):
        mock_api_client.return_value.__aenter__.return_value = mock_api_client
        mock_custom = mock_custom_api_cls.return_value
        mock_custom.get_cluster_custom_object = AsyncMock(
            return_value={
                "apiVersion": "ark.mckinsey.com/v1alpha1",
                "kind": "ArkConfig",
                "metadata": {"name": "default"},
                "spec": {"queryTTL": "720h"},
            }
        )
        mock_custom.replace_cluster_custom_object = AsyncMock(
            return_value={"spec": {}, "metadata": {"name": "default"}}
        )

        resp = self.client.put("/v1/arkconfig", json={"queryTTL": ""})

        self.assertEqual(resp.status_code, 200)
        call_kwargs = mock_custom.replace_cluster_custom_object.await_args.kwargs
        self.assertNotIn("queryTTL", call_kwargs["body"]["spec"])

    @patch("ark_api.api.v1.arkconfig.CustomObjectsApi")
    @patch("ark_api.api.v1.client_utils.create_api_client")
    def test_put_rejects_default_memory_namespace(self, mock_api_client, mock_custom_api_cls):
        mock_api_client.return_value.__aenter__.return_value = mock_api_client
        mock_custom = mock_custom_api_cls.return_value
        mock_custom.get_cluster_custom_object = AsyncMock(side_effect=_not_found())
        mock_custom.create_cluster_custom_object = AsyncMock()

        resp = self.client.put(
            "/v1/arkconfig",
            json={"defaultMemory": {"name": "default", "namespace": "team-a"}},
        )

        self.assertEqual(resp.status_code, 422)
        mock_custom.create_cluster_custom_object.assert_not_awaited()

    @patch("ark_api.api.v1.arkconfig.CustomObjectsApi")
    @patch("ark_api.api.v1.client_utils.create_api_client")
    def test_get_ignores_malformed_default_memory(self, mock_api_client, mock_custom_api_cls):
        mock_api_client.return_value.__aenter__.return_value = mock_api_client
        mock_custom = mock_custom_api_cls.return_value
        mock_custom.get_cluster_custom_object = AsyncMock(
            return_value={
                "spec": {"defaultMemory": "broker-memory"},
                "metadata": {"name": "default"},
            }
        )

        resp = self.client.get("/v1/arkconfig")

        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.json()["defaultMemory"])

    @patch("ark_api.api.v1.arkconfig.CustomObjectsApi")
    @patch("ark_api.api.v1.client_utils.create_api_client")
    def test_put_null_clears_default_memory_only(self, mock_api_client, mock_custom_api_cls):
        mock_api_client.return_value.__aenter__.return_value = mock_api_client
        mock_custom = mock_custom_api_cls.return_value
        mock_custom.get_cluster_custom_object = AsyncMock(
            return_value={
                "apiVersion": "ark.mckinsey.com/v1alpha1",
                "kind": "ArkConfig",
                "metadata": {"name": "default"},
                "spec": {"queryTTL": "720h", "defaultMemory": {"name": "broker-memory"}},
            }
        )
        mock_custom.replace_cluster_custom_object = AsyncMock(
            return_value={"spec": {"queryTTL": "720h"}, "metadata": {"name": "default"}}
        )

        resp = self.client.put("/v1/arkconfig", json={"defaultMemory": None})

        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.json()["defaultMemory"])
        call_kwargs = mock_custom.replace_cluster_custom_object.await_args.kwargs
        self.assertNotIn("defaultMemory", call_kwargs["body"]["spec"])
        self.assertEqual(call_kwargs["body"]["spec"]["queryTTL"], "720h")

    @patch("ark_api.api.v1.arkconfig.CustomObjectsApi")
    @patch("ark_api.api.v1.client_utils.create_api_client")
    def test_delete_noop_when_missing(self, mock_api_client, mock_custom_api_cls):
        mock_api_client.return_value.__aenter__.return_value = mock_api_client
        mock_custom = mock_custom_api_cls.return_value
        mock_custom.delete_cluster_custom_object = AsyncMock(side_effect=_not_found())

        resp = self.client.delete("/v1/arkconfig")

        self.assertEqual(resp.status_code, 204)

    @patch("ark_api.api.v1.arkconfig.CustomObjectsApi")
    @patch("ark_api.api.v1.client_utils.create_api_client")
    def test_delete_existing(self, mock_api_client, mock_custom_api_cls):
        mock_api_client.return_value.__aenter__.return_value = mock_api_client
        mock_custom = mock_custom_api_cls.return_value
        mock_custom.delete_cluster_custom_object = AsyncMock(return_value=None)

        resp = self.client.delete("/v1/arkconfig")

        self.assertEqual(resp.status_code, 204)


if __name__ == "__main__":
    unittest.main()
