import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from pyhelm3.errors import Error as HelmError

os.environ["AUTH_MODE"] = "open"


class TestHelmReleasesEndpoint(unittest.TestCase):
    def setUp(self):
        from ark_api.main import app
        self.client = TestClient(app)

    @patch('ark_api.api.v1.ark_services.get_helm_releases')
    @patch('ark_api.api.v1.ark_services.get_context')
    def test_list_helm_releases_success(self, mock_get_context, mock_get_helm_releases):
        mock_get_context.return_value = {"namespace": "default"}

        mock_releases = [
            {
                "name": "phoenix",
                "namespace": "default",
                "chart": "phoenix-0.1.7",
                "chart_version": "0.1.7",
                "app_version": "4.0.5",
                "status": "deployed",
                "revision": 1,
                "updated": "2024-01-01T12:00:00Z",
                "chart_metadata": {
                    "annotations": {
                        "ark.mckinsey.com/marketplace-item-name": "service/phoenix"
                    },
                    "description": "Phoenix observability"
                }
            }
        ]
        mock_get_helm_releases.return_value = (mock_releases, [])

        response = self.client.get("/v1/ark-services/helm-releases")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("items", data)
        self.assertIn("count", data)
        self.assertEqual(data["count"], 1)
        self.assertEqual(len(data["items"]), 1)
        self.assertEqual(data["items"][0]["name"], "phoenix")
        self.assertEqual(data["items"][0]["status"], "deployed")

    @patch('ark_api.api.v1.ark_services.get_helm_releases')
    @patch('ark_api.api.v1.ark_services.get_context')
    def test_list_helm_releases_with_namespace(self, mock_get_context, mock_get_helm_releases):
        mock_get_context.return_value = {"namespace": "default"}

        mock_releases = [
            {
                "name": "langfuse",
                "namespace": "custom-ns",
                "chart": "langfuse-0.1.0",
                "chart_version": "0.1.0",
                "app_version": "2.0.0",
                "status": "deployed",
                "revision": 1,
                "updated": "2024-01-01T12:00:00Z",
                "chart_metadata": {
                    "annotations": {
                        "ark.mckinsey.com/marketplace-item-name": "service/langfuse"
                    },
                    "description": "Langfuse observability"
                }
            }
        ]
        mock_get_helm_releases.return_value = (mock_releases, [])

        response = self.client.get("/v1/ark-services/helm-releases?namespace=custom-ns")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["items"][0]["namespace"], "custom-ns")

    @patch('ark_api.api.v1.ark_services.get_helm_releases')
    @patch('ark_api.api.v1.ark_services.get_context')
    def test_list_helm_releases_empty(self, mock_get_context, mock_get_helm_releases):
        mock_get_context.return_value = {"namespace": "default"}
        mock_get_helm_releases.return_value = ([], [])

        response = self.client.get("/v1/ark-services/helm-releases")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 0)
        self.assertEqual(len(data["items"]), 0)

    @patch('ark_api.api.v1.ark_services.get_helm_releases')
    @patch('ark_api.api.v1.ark_services.get_context')
    def test_list_helm_releases_includes_chart_metadata(self, mock_get_context, mock_get_helm_releases):
        mock_get_context.return_value = {"namespace": "default"}

        mock_releases = [
            {
                "name": "a2a-inspector",
                "namespace": "default",
                "chart": "a2a-inspector-0.1.0",
                "chart_version": "0.1.0",
                "app_version": "1.0.0",
                "status": "deployed",
                "revision": 1,
                "updated": "2024-01-01T12:00:00Z",
                "chart_metadata": {
                    "annotations": {
                        "ark.mckinsey.com/marketplace-item-name": "service/a2a-inspector",
                        "ark.mckinsey.com/service": "a2a-inspector"
                    },
                    "description": "A2A protocol inspector"
                }
            }
        ]
        mock_get_helm_releases.return_value = (mock_releases, [])

        response = self.client.get("/v1/ark-services/helm-releases")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        item = data["items"][0]
        self.assertIn("chart_metadata", item)
        self.assertIn("annotations", item["chart_metadata"])
        self.assertEqual(
            item["chart_metadata"]["annotations"]["ark.mckinsey.com/marketplace-item-name"],
            "service/a2a-inspector"
        )

    @patch('ark_api.api.v1.ark_services.get_helm_releases')
    @patch('ark_api.api.v1.ark_services.get_context')
    def test_list_helm_releases_multiple_releases(self, mock_get_context, mock_get_helm_releases):
        mock_get_context.return_value = {"namespace": "default"}

        mock_releases = [
            {
                "name": "phoenix",
                "namespace": "default",
                "chart": "phoenix-0.1.7",
                "chart_version": "0.1.7",
                "app_version": "4.0.5",
                "status": "deployed",
                "revision": 1,
                "updated": "2024-01-01T12:00:00Z",
                "chart_metadata": {
                    "annotations": {"ark.mckinsey.com/marketplace-item-name": "service/phoenix"},
                    "description": "Phoenix observability"
                }
            },
            {
                "name": "langfuse",
                "namespace": "default",
                "chart": "langfuse-0.1.0",
                "chart_version": "0.1.0",
                "app_version": "2.0.0",
                "status": "deployed",
                "revision": 1,
                "updated": "2024-01-02T12:00:00Z",
                "chart_metadata": {
                    "annotations": {"ark.mckinsey.com/marketplace-item-name": "service/langfuse"},
                    "description": "Langfuse observability"
                }
            }
        ]
        mock_get_helm_releases.return_value = (
            mock_releases,
            [{"name": "broken", "message": "The release data has an unexpected format."}]
        )

        response = self.client.get("/v1/ark-services/helm-releases")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 2)
        self.assertEqual(len(data["items"]), 2)
        names = {item["name"] for item in data["items"]}
        self.assertEqual(names, {"phoenix", "langfuse"})
        self.assertEqual(data["errors"], [{"name": "broken", "message": "The release data has an unexpected format."}])


def _helm_client(releases=None, error=None):
    client = AsyncMock()
    client.list_releases = AsyncMock(return_value=releases, side_effect=error)
    return client


class TestHelmReleaseErrors(unittest.TestCase):
    def setUp(self):
        from ark_api.main import app
        self.client = TestClient(app)

    def test_unreadable_releases_are_reported_without_hiding_the_rest(self):
        helm_client = _helm_client(releases=[
            SimpleNamespace(name="ok"), SimpleNamespace(name="broken"), SimpleNamespace(name="helm-error")
        ])
        readable = {
            "name": "ok", "namespace": "ns", "chart": "ok-1.0.0", "chart_version": "1.0.0",
            "app_version": "1.0.0", "status": "failed", "revision": 1, "updated": "", "chart_metadata": {}
        }
        extract = AsyncMock(side_effect=[readable, KeyError("manifest"), HelmError(1, b"", b"Error: boom\n")])

        with patch("ark_api.utils.ark_services.Client", lambda: helm_client), \
                patch("ark_api.utils.ark_services.extract_helm_release_data", extract):
            response = self.client.get("/v1/ark-services/helm-releases?namespace=ns")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual([item["name"] for item in data["items"]], ["ok"])
        self.assertEqual(data["errors"], [
            {"name": "broken", "message": "The release data has an unexpected format."},
            {"name": "helm-error", "message": "Helm couldn't return this release's details."},
        ])
        helm_client.list_releases.assert_awaited_once_with(
            namespace="ns", include_deployed=True, include_failed=True, include_pending=True
        )

    def test_forbidden_list_returns_403_without_helm_output(self):
        error = HelmError(1, b"", b'Error: secrets is forbidden: User "system:serviceaccount:ns:ark-api"\n')

        with patch("ark_api.utils.ark_services.Client", lambda: _helm_client(error=error)):
            response = self.client.get("/v1/ark-services/helm-releases?namespace=ns")

        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json()["detail"], "Ark doesn't have permission to read Helm releases in namespace 'ns'."
        )

    def test_failed_list_returns_500_without_helm_output(self):
        error = HelmError(1, b"", b"Error: Kubernetes cluster unreachable\n")

        with patch("ark_api.utils.ark_services.Client", lambda: _helm_client(error=error)):
            response = self.client.get("/v1/ark-services/helm-releases?namespace=ns")

        self.assertEqual(response.status_code, 500)
        self.assertEqual(
            response.json()["detail"],
            "Couldn't list Helm releases in namespace 'ns'. Check the ark-api logs for details."
        )

    def test_ark_services_fails_when_a_release_is_unreadable(self):
        helm_client = _helm_client(releases=[SimpleNamespace(name="broken")])
        extract = AsyncMock(side_effect=KeyError("manifest"))

        with patch("ark_api.utils.ark_services.Client", lambda: helm_client), \
                patch("ark_api.utils.ark_services.extract_helm_release_data", extract):
            response = self.client.get("/v1/ark-services?namespace=ns")

        self.assertEqual(response.status_code, 500)
        self.assertEqual(
            response.json()["detail"],
            "Couldn't read Helm releases in namespace 'ns': broken: The release data has an unexpected format."
        )


if __name__ == "__main__":
    unittest.main()
