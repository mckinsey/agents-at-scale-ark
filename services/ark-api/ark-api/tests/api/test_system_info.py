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
            {"kubernetes_version": "v1.31.2", "system_version": "v0.1.68"},
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
        self.assertNotEqual(
            system_version,
            mock_package_version.return_value,
            "the endpoint adds the leading v so both versions render consistently",
        )

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
