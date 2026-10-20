"""Tests for the system-info endpoint."""
import importlib.metadata
import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from kubernetes_asyncio.client.rest import ApiException
from ark_api.main import app

os.environ["AUTH_MODE"] = "open"



class TestSystemInfoEndpoint(unittest.TestCase):
    """GET /v1/system-info pairs the cluster version with this service's own."""

    def setUp(self):
        self.client = TestClient(app)

    @patch("ark_api.api.v1.system_info.importlib.metadata.version")
    @patch("ark_api.api.v1.system_info.client.VersionApi")
    @patch("ark_api.api.v1.system_info.create_api_client")
    def test_returns_cluster_and_service_versions(
        self, mock_api_client, mock_version_api, mock_package_version
    ):
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        mock_version_api.return_value.get_code = AsyncMock(
            return_value=SimpleNamespace(git_version="v1.31.2")
        )
        mock_package_version.return_value = "0.1.68"

        response = self.client.get("/v1/system-info")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "kubernetes_version": "v1.31.2",
                "system_version": "v0.1.68",
                "argo_server_version_supported": None,
            },
        )

    @patch("ark_api.api.v1.system_info.importlib.metadata.version")
    @patch("ark_api.api.v1.system_info.client.VersionApi")
    @patch("ark_api.api.v1.system_info.create_api_client")
    def test_prefixes_service_version_with_v(
        self, mock_api_client, mock_version_api, mock_package_version
    ):
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        mock_version_api.return_value.get_code = AsyncMock(
            return_value=SimpleNamespace(git_version="v1.30.0")
        )
        mock_package_version.return_value = "2.0.0"

        system_version = self.client.get("/v1/system-info").json()["system_version"]

        self.assertEqual(system_version, "v2.0.0")

    @patch("ark_api.api.v1.system_info.importlib.metadata.version")
    @patch("ark_api.api.v1.system_info.client.VersionApi")
    @patch("ark_api.api.v1.system_info.create_api_client")
    def test_unknown_when_package_metadata_missing(
        self, mock_api_client, mock_version_api, mock_package_version
    ):
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        mock_version_api.return_value.get_code = AsyncMock(
            return_value=SimpleNamespace(git_version="v1.31.2")
        )
        mock_package_version.side_effect = importlib.metadata.PackageNotFoundError(
            "ark-api"
        )

        response = self.client.get("/v1/system-info")

        self.assertEqual(
            response.status_code,
            200,
            "running from source without installed metadata must not fail the endpoint",
        )
        self.assertEqual(response.json()["system_version"], "vunknown")
        self.assertEqual(response.json()["kubernetes_version"], "v1.31.2")

    @patch("ark_api.api.v1.system_info.argo_server.get_argo_server_version")
    @patch("ark_api.api.v1.system_info.client.VersionApi")
    @patch("ark_api.api.v1.system_info.create_api_client")
    def test_argo_version_unsupported_when_below_minimum(
        self, mock_api_client, mock_version_api, mock_get_version
    ):
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        mock_version_api.return_value.get_code = AsyncMock(
            return_value=SimpleNamespace(git_version="v1.31.2")
        )
        mock_get_version.return_value = "v4.0.6"

        with patch.dict(os.environ, {"ARGO_SERVER_URL": "http://argo-workflows-server:2746"}):
            response = self.client.get("/v1/system-info")

        self.assertFalse(response.json()["argo_server_version_supported"])

    @patch("ark_api.api.v1.system_info.argo_server.get_argo_server_version")
    @patch("ark_api.api.v1.system_info.client.VersionApi")
    @patch("ark_api.api.v1.system_info.create_api_client")
    def test_argo_version_supported_at_minimum(
        self, mock_api_client, mock_version_api, mock_get_version
    ):
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        mock_version_api.return_value.get_code = AsyncMock(
            return_value=SimpleNamespace(git_version="v1.31.2")
        )
        mock_get_version.return_value = "v4.1.0"

        with patch.dict(os.environ, {"ARGO_SERVER_URL": "http://argo-workflows-server:2746"}):
            response = self.client.get("/v1/system-info")

        self.assertTrue(response.json()["argo_server_version_supported"])

    @patch("ark_api.api.v1.system_info.argo_server.get_argo_server_version")
    @patch("ark_api.api.v1.system_info.client.VersionApi")
    @patch("ark_api.api.v1.system_info.create_api_client")
    def test_argo_version_unknown_when_url_not_configured(
        self, mock_api_client, mock_version_api, mock_get_version
    ):
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        mock_version_api.return_value.get_code = AsyncMock(
            return_value=SimpleNamespace(git_version="v1.31.2")
        )

        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("ARGO_SERVER_URL", None)
            response = self.client.get("/v1/system-info")

        self.assertIsNone(response.json()["argo_server_version_supported"])
        mock_get_version.assert_not_called()

    @patch("ark_api.api.v1.system_info.argo_server.get_argo_server_version")
    @patch("ark_api.api.v1.system_info.client.VersionApi")
    @patch("ark_api.api.v1.system_info.create_api_client")
    def test_argo_version_unknown_when_argo_server_unreachable(
        self, mock_api_client, mock_version_api, mock_get_version
    ):
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        mock_version_api.return_value.get_code = AsyncMock(
            return_value=SimpleNamespace(git_version="v1.31.2")
        )
        mock_get_version.return_value = None

        with patch.dict(os.environ, {"ARGO_SERVER_URL": "http://argo-workflows-server:2746"}):
            response = self.client.get("/v1/system-info")

        self.assertIsNone(response.json()["argo_server_version_supported"])

    @patch("ark_api.api.v1.system_info.client.VersionApi")
    @patch("ark_api.api.v1.system_info.create_api_client")
    def test_propagates_kubernetes_api_status(self, mock_api_client, mock_version_api):
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        mock_version_api.return_value.get_code = AsyncMock(
            side_effect=ApiException(status=503, reason="Service Unavailable")
        )

        response = self.client.get("/v1/system-info")

        self.assertEqual(response.status_code, 503)

    @patch("ark_api.api.v1.system_info.client.VersionApi")
    @patch("ark_api.api.v1.system_info.create_api_client")
    def test_unexpected_error_is_not_leaked(self, mock_api_client, mock_version_api):
        mock_api_client.return_value.__aenter__.return_value = AsyncMock()
        mock_version_api.return_value.get_code = AsyncMock(
            side_effect=RuntimeError("kubeconfig parse failure at /etc/secret")
        )

        response = self.client.get("/v1/system-info")

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json()["detail"], "Internal server error")


if __name__ == "__main__":
    unittest.main()
