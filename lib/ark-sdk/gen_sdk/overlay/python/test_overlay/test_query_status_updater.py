import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from ark_sdk.extensions.query import QueryRef
from ark_sdk.query_status_updater import QueryStatusUpdater


class TestQueryStatusUpdater(unittest.IsolatedAsyncioTestCase):
    @patch("ark_sdk.query_status_updater.init_k8s", new_callable=AsyncMock)
    @patch("ark_sdk.query_status_updater.create_api_client")
    async def test_successful_patch(self, mock_api_client_cls, mock_init_k8s):
        mock_custom = AsyncMock()
        mock_api_ctx = AsyncMock()
        mock_api_ctx.__aenter__ = AsyncMock(return_value=MagicMock())
        mock_api_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_api_client_cls.return_value = mock_api_ctx

        with patch("ark_sdk.query_status_updater.client.CustomObjectsApi", return_value=mock_custom):
            updater = QueryStatusUpdater(QueryRef(name="q1", namespace="ns1"))
            await updater.update_query_phase("provisioning", "ExecutorProvisioning", "Starting sandbox")

        mock_custom.patch_namespaced_custom_object_status.assert_awaited_once()
        call_kwargs = mock_custom.patch_namespaced_custom_object_status.call_args
        assert call_kwargs.kwargs["name"] == "q1"
        assert call_kwargs.kwargs["namespace"] == "ns1"
        body = call_kwargs.kwargs["body"]
        assert body["status"]["phase"] == "provisioning"
        assert body["status"]["conditions"][0]["reason"] == "ExecutorProvisioning"

    async def test_missing_query_ref_noop(self):
        updater = QueryStatusUpdater(None)
        await updater.update_query_phase("provisioning", "ExecutorProvisioning")

    @patch("ark_sdk.query_status_updater.init_k8s", new_callable=AsyncMock)
    @patch("ark_sdk.query_status_updater.create_api_client")
    async def test_api_failure_noop(self, mock_api_client_cls, mock_init_k8s):
        mock_custom = AsyncMock()
        mock_custom.patch_namespaced_custom_object_status.side_effect = Exception("API error")
        mock_api_ctx = AsyncMock()
        mock_api_ctx.__aenter__ = AsyncMock(return_value=MagicMock())
        mock_api_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_api_client_cls.return_value = mock_api_ctx

        with patch("ark_sdk.query_status_updater.client.CustomObjectsApi", return_value=mock_custom):
            updater = QueryStatusUpdater(QueryRef(name="q1", namespace="ns1"))
            await updater.update_query_phase("provisioning", "ExecutorProvisioning")


if __name__ == "__main__":
    unittest.main()
