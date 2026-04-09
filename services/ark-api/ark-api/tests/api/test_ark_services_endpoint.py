import os
import unittest
from unittest.mock import AsyncMock, Mock, patch
from fastapi.testclient import TestClient

os.environ["AUTH_MODE"] = "open"


class TestMarketplaceItemsEndpoint(unittest.TestCase):
    def setUp(self):
        from ark_api.main import app
        self.client = TestClient(app)

    @patch('ark_api.api.v1.ark_services.get_helm_releases')
    @patch('ark_api.api.v1.ark_services.get_context')
    async def test_list_marketplace_items_success(self, mock_get_context, mock_get_helm_releases):
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
        mock_get_helm_releases.return_value = mock_releases

        response = self.client.get("/v1/marketplace-items")

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
    async def test_list_marketplace_items_with_namespace(self, mock_get_context, mock_get_helm_releases):
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
        mock_get_helm_releases.return_value = mock_releases

        response = self.client.get("/v1/marketplace-items?namespace=custom-ns")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["items"][0]["namespace"], "custom-ns")

    @patch('ark_api.api.v1.ark_services.get_helm_releases')
    @patch('ark_api.api.v1.ark_services.get_context')
    async def test_list_marketplace_items_empty(self, mock_get_context, mock_get_helm_releases):
        mock_get_context.return_value = {"namespace": "default"}
        mock_get_helm_releases.return_value = []

        response = self.client.get("/v1/marketplace-items")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 0)
        self.assertEqual(len(data["items"]), 0)

    @patch('ark_api.api.v1.ark_services.get_helm_releases')
    @patch('ark_api.api.v1.ark_services.get_context')
    async def test_list_marketplace_items_includes_chart_metadata(self, mock_get_context, mock_get_helm_releases):
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
        mock_get_helm_releases.return_value = mock_releases

        response = self.client.get("/v1/marketplace-items")

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
    async def test_list_marketplace_items_multiple_releases(self, mock_get_context, mock_get_helm_releases):
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
        mock_get_helm_releases.return_value = mock_releases

        response = self.client.get("/v1/marketplace-items")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 2)
        self.assertEqual(len(data["items"]), 2)
        names = {item["name"] for item in data["items"]}
        self.assertEqual(names, {"phoenix", "langfuse"})


if __name__ == "__main__":
    unittest.main()
