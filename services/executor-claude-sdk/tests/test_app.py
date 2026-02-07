"""Tests for the Claude Agent SDK FastAPI application."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from claude_executor.app import create_app


@pytest.fixture
def client():
    app = create_app()
    return TestClient(app)


class TestAppEndpoints:
    def test_health_endpoint(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["engine"] == "claude agent sdk"

    def test_execute_endpoint_invalid_request(self, client):
        response = client.post("/execute", json={})
        assert response.status_code == 422

    def test_execute_endpoint_valid_request(self, client):
        request_data = {
            "agent": {
                "name": "test-agent",
                "namespace": "default",
                "prompt": "You are a helpful assistant.",
                "model": {
                    "name": "claude-sonnet-4-20250514",
                    "type": "anthropic",
                    "config": {},
                },
            },
            "userInput": {
                "role": "user",
                "content": "Hello",
                "name": "user",
            },
            "history": [],
        }

        with patch("claude_executor.executor.query") as mock_query:
            async def mock_query_gen(prompt, options):
                return
                yield  # type: ignore[misc]

            mock_query.return_value = mock_query_gen(None, None)

            response = client.post("/execute", json=request_data)

        assert response.status_code == 200
        data = response.json()
        assert "messages" in data

    def test_execute_stream_endpoint_invalid_request(self, client):
        response = client.post("/execute-stream", json={})
        assert response.status_code == 422


class TestAppConfiguration:
    def test_app_has_routes(self, client):
        app = create_app()
        routes = [r.path for r in app.routes]
        assert "/health" in routes
        assert "/execute" in routes
        assert "/execute-stream" in routes
