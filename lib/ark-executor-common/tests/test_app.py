import json
import pytest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from ark_executor_common.base import (
    BaseExecutor,
    ExecutionEngineRequest,
    Message,
    AgentConfig,
    Model,
)
from ark_executor_common.app import ExecutorApp


class MockExecutor(BaseExecutor):
    def __init__(self):
        super().__init__("mock")
        self.execute_result = [Message(role="assistant", content="test response", name="agent")]
        self.stream_chunks = []

    async def execute_agent(self, request, trace_context=None):
        return self.execute_result

    async def execute_agent_streaming(self, request):
        for chunk in self.stream_chunks:
            yield chunk


def _make_request_body(prompt="test prompt", user_input="hello"):
    return {
        "agent": {
            "name": "test-agent",
            "namespace": "default",
            "prompt": prompt,
            "model": {"name": "gpt-4o", "type": "openai", "config": {}},
        },
        "userInput": {"role": "user", "content": user_input, "name": "user"},
        "history": [],
    }


@pytest.fixture
def executor():
    return MockExecutor()


@pytest.fixture
def app(executor):
    executor_app = ExecutorApp(executor, "Test")
    return executor_app.create_app()


@pytest.fixture
def client(app):
    return TestClient(app)


class TestHealthEndpoint:

    def test_health_returns_healthy(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["engine"] == "test"


class TestExecuteEndpoint:

    def test_successful_execution(self, client):
        response = client.post("/execute", json=_make_request_body())
        assert response.status_code == 200
        data = response.json()
        assert len(data["messages"]) == 1
        assert data["messages"][0]["content"] == "test response"
        assert data["error"] == ""

    def test_execution_error_returns_error_message(self, client, executor):
        executor.execute_result = None

        async def failing_execute(request, trace_context=None):
            raise RuntimeError("LLM call failed")

        executor.execute_agent = failing_execute
        response = client.post("/execute", json=_make_request_body())
        assert response.status_code == 200
        data = response.json()
        assert data["messages"] == []
        assert "LLM call failed" in data["error"]

    def test_token_usage_extracted(self, client, executor):
        msg = Message(role="assistant", content="response", name="agent")
        msg.token_usage = {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30}
        executor.execute_result = [msg]
        response = client.post("/execute", json=_make_request_body())
        assert response.status_code == 200
        data = response.json()
        assert data["token_usage"]["prompt_tokens"] == 10
        assert data["token_usage"]["completion_tokens"] == 20
        assert data["token_usage"]["total_tokens"] == 30

    def test_empty_response_no_token_usage(self, client, executor):
        executor.execute_result = []
        response = client.post("/execute", json=_make_request_body())
        assert response.status_code == 200
        data = response.json()
        assert data["token_usage"] is None


class TestExecuteStreamEndpoint:

    def test_stream_returns_sse(self, client, executor):
        executor.stream_chunks = [
            {"type": "content", "content": "Hello"},
            {"type": "content", "content": " World"},
        ]
        response = client.post("/execute-stream", json=_make_request_body())
        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]

        events = [
            line.removeprefix("data: ")
            for line in response.text.strip().split("\n")
            if line.startswith("data: ")
        ]
        assert len(events) >= 3

        chunk_events = [json.loads(e) for e in events if not e.startswith("[DONE]") and json.loads(e).get("type") == "chunk"]
        assert len(chunk_events) == 2

        result_events = [json.loads(e) for e in events if not e.startswith("[DONE]") and json.loads(e).get("type") == "result"]
        assert len(result_events) == 1
        assert result_events[0]["result"]["messages"][0]["content"] == "Hello World"

    def test_stream_error_sends_error_event(self, client, executor):
        async def failing_stream(request):
            raise RuntimeError("stream failed")
            yield

        executor.execute_agent_streaming = failing_stream
        response = client.post("/execute-stream", json=_make_request_body())
        assert response.status_code == 200

        events = [
            line.removeprefix("data: ")
            for line in response.text.strip().split("\n")
            if line.startswith("data: ")
        ]
        error_events = [json.loads(e) for e in events if not e.startswith("[DONE]") and json.loads(e).get("type") == "error"]
        assert len(error_events) == 1
        assert "stream failed" in error_events[0]["error"]

    def test_stream_fallback_to_execute(self, executor):
        class NoStreamExecutor(BaseExecutor):
            def __init__(self):
                super().__init__("mock")

            async def execute_agent(self, request, trace_context=None):
                return [Message(role="assistant", content="test response", name="agent")]

        fallback_app = ExecutorApp(NoStreamExecutor(), "Test")
        fallback_client = TestClient(fallback_app.create_app())
        response = fallback_client.post("/execute-stream", json=_make_request_body())
        assert response.status_code == 200

        events = [
            line.removeprefix("data: ")
            for line in response.text.strip().split("\n")
            if line.startswith("data: ")
        ]
        result_events = [json.loads(e) for e in events if not e.startswith("[DONE]") and json.loads(e).get("type") == "result"]
        assert len(result_events) == 1
        assert result_events[0]["result"]["messages"][0]["content"] == "test response"


class TestExecutorApp:

    def test_app_title(self, app):
        assert app.title == "Test Executor"

    def test_create_app_returns_fastapi(self, executor):
        executor_app = ExecutorApp(executor, "Custom")
        app = executor_app.create_app()
        assert app.title == "Custom Executor"
