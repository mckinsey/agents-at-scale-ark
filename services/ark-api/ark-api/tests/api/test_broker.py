import asyncio
import os
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient
import httpx
from kubernetes_asyncio.client.rest import ApiException

os.environ["AUTH_MODE"] = "open"

with patch('importlib.metadata.version', return_value="0.1.0-test"):
    from ark_api.main import app

test_client = TestClient(app)


class TestBrokerAPI(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.client = test_client

    @patch('ark_api.api.v1.broker.get_broker_url')
    def test_format_error_response_json(self, _):
        from ark_api.api.v1.broker import format_error_response

        error_json = json.dumps({"message": "Test error", "code": 500})
        result = format_error_response(error_json, 500, "Internal Server Error")

        self.assertEqual(result, {"error": {"message": "Test error", "code": 500}})

    @patch('ark_api.api.v1.broker.get_broker_url')
    def test_format_error_response_plain_text(self, _):
        from ark_api.api.v1.broker import format_error_response

        result = format_error_response("Not found", 404, "Not Found")

        self.assertEqual(result, {"error": {"message": "404 Not Found", "type": "server_error"}})

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    @patch('ark_api.api.v1.broker.httpx.AsyncClient')
    def test_get_traces_success(self, mock_async_client, mock_get_broker_url):
        mock_get_broker_url.return_value = "http://broker:8080"

        mock_response = MagicMock()
        mock_response.json.return_value = {"traces": []}
        mock_response.status_code = 200

        mock_client_instance = AsyncMock()
        mock_client_instance.get = AsyncMock(return_value=mock_response)
        mock_async_client.return_value.__aenter__.return_value = mock_client_instance

        response = self.client.get("/v1/broker/traces")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"traces": []})

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    def test_get_traces_memory_not_available(self, mock_get_broker_url):
        mock_get_broker_url.return_value = None

        response = self.client.get("/v1/broker/traces?memory=unavailable")

        self.assertEqual(response.status_code, 503)
        data = response.json()
        self.assertIn("error", data)
        self.assertEqual(data["error"]["type"], "service_unavailable")
        self.assertEqual(data["code"], "broker_unavailable")
        self.assertEqual(data["fallback"], "poll")

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    @patch('ark_api.api.v1.broker.httpx.AsyncClient')
    def test_get_traces_connection_error(self, mock_async_client, mock_get_broker_url):
        mock_get_broker_url.return_value = "http://broker:8080"

        mock_client_instance = AsyncMock()
        mock_client_instance.get = AsyncMock(side_effect=httpx.ConnectError("Connection failed"))
        mock_async_client.return_value.__aenter__.return_value = mock_client_instance

        response = self.client.get("/v1/broker/traces")

        self.assertEqual(response.status_code, 503)
        data = response.json()
        self.assertIn("error", data)
        self.assertEqual(data["error"]["type"], "connection_error")
        self.assertEqual(data["code"], "broker_unavailable")
        self.assertEqual(data["fallback"], "poll")

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    @patch('ark_api.api.v1.broker.httpx.AsyncClient')
    def test_get_traces_generic_error(self, mock_async_client, mock_get_broker_url):
        mock_get_broker_url.return_value = "http://broker:8080"

        mock_client_instance = AsyncMock()
        mock_client_instance.get = AsyncMock(side_effect=Exception("Generic error"))
        mock_async_client.return_value.__aenter__.return_value = mock_client_instance

        response = self.client.get("/v1/broker/traces")

        self.assertEqual(response.status_code, 500)
        data = response.json()
        self.assertIn("error", data)
        self.assertEqual(data["error"]["type"], "server_error")

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    @patch('ark_api.api.v1.broker.proxy_sse_stream')
    def test_get_traces_watch(self, mock_proxy_sse, mock_get_broker_url):
        mock_get_broker_url.return_value = "http://broker:8080"

        async def mock_stream():
            yield "data: test\n\n"

        mock_proxy_sse.return_value = mock_stream()

        response = self.client.get("/v1/broker/traces?watch=true")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "text/event-stream; charset=utf-8")

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    @patch('ark_api.api.v1.broker.httpx.AsyncClient')
    def test_get_trace_success(self, mock_async_client, mock_get_broker_url):
        mock_get_broker_url.return_value = "http://broker:8080"

        mock_response = MagicMock()
        mock_response.json.return_value = {"trace_id": "123", "spans": []}
        mock_response.status_code = 200

        mock_client_instance = AsyncMock()
        mock_client_instance.get = AsyncMock(return_value=mock_response)
        mock_async_client.return_value.__aenter__.return_value = mock_client_instance

        response = self.client.get("/v1/broker/traces/123")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"trace_id": "123", "spans": []})

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    @patch('ark_api.api.v1.broker.httpx.AsyncClient')
    def test_get_traces_with_session_id(self, mock_async_client, mock_get_broker_url):
        mock_get_broker_url.return_value = "http://broker:8080"

        mock_response = MagicMock()
        mock_response.json.return_value = {"traces": []}
        mock_response.status_code = 200

        mock_client_instance = AsyncMock()
        mock_client_instance.get = AsyncMock(return_value=mock_response)
        mock_async_client.return_value.__aenter__.return_value = mock_client_instance

        response = self.client.get("/v1/broker/traces?session_id=sess-456")

        self.assertEqual(response.status_code, 200)
        mock_client_instance.get.assert_called_once()
        call_args = mock_client_instance.get.call_args[0][0]
        self.assertIn("session_id=sess-456", call_args)

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    @patch('ark_api.api.v1.broker.proxy_sse_stream')
    def test_get_trace_watch(self, mock_proxy_sse, mock_get_broker_url):
        mock_get_broker_url.return_value = "http://broker:8080"

        async def mock_stream():
            yield "data: span1\n\n"

        mock_proxy_sse.return_value = mock_stream()

        response = self.client.get("/v1/broker/traces/123?watch=true")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "text/event-stream; charset=utf-8")

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    @patch('ark_api.api.v1.broker.proxy_sse_stream')
    def test_get_trace_watch_with_from_beginning(self, mock_proxy_sse, mock_get_broker_url):
        mock_get_broker_url.return_value = "http://broker:8080"

        async def mock_stream():
            yield "data: span1\n\n"

        mock_proxy_sse.return_value = mock_stream()

        response = self.client.get("/v1/broker/traces/123?watch=true&from-beginning=true")

        self.assertEqual(response.status_code, 200)
        mock_proxy_sse.assert_called_once()
        call_args = mock_proxy_sse.call_args[0][0]
        self.assertIn("from-beginning=true", call_args)

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    @patch('ark_api.api.v1.broker.httpx.AsyncClient')
    def test_get_messages_success(self, mock_async_client, mock_get_broker_url):
        mock_get_broker_url.return_value = "http://broker:8080"

        mock_response = MagicMock()
        mock_response.json.return_value = {"messages": []}
        mock_response.status_code = 200

        mock_client_instance = AsyncMock()
        mock_client_instance.get = AsyncMock(return_value=mock_response)
        mock_async_client.return_value.__aenter__.return_value = mock_client_instance

        response = self.client.get("/v1/broker/messages")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"messages": []})

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    @patch('ark_api.api.v1.broker.httpx.AsyncClient')
    def test_get_messages_with_conversation_id(self, mock_async_client, mock_get_broker_url):
        mock_get_broker_url.return_value = "http://broker:8080"

        mock_response = MagicMock()
        mock_response.json.return_value = {"messages": [{"id": "1"}]}
        mock_response.status_code = 200

        mock_client_instance = AsyncMock()
        mock_client_instance.get = AsyncMock(return_value=mock_response)
        mock_async_client.return_value.__aenter__.return_value = mock_client_instance

        response = self.client.get("/v1/broker/messages?conversation_id=conv-123")

        self.assertEqual(response.status_code, 200)
        mock_client_instance.get.assert_called_once()
        call_args = mock_client_instance.get.call_args[0][0]
        self.assertIn("conversation_id=conv-123", call_args)

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    @patch('ark_api.api.v1.broker.proxy_sse_stream')
    def test_get_messages_watch(self, mock_proxy_sse, mock_get_broker_url):
        mock_get_broker_url.return_value = "http://broker:8080"

        async def mock_stream():
            yield "data: message\n\n"

        mock_proxy_sse.return_value = mock_stream()

        response = self.client.get("/v1/broker/messages?watch=true")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "text/event-stream; charset=utf-8")

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    @patch('ark_api.api.v1.broker.httpx.AsyncClient')
    def test_get_chunks_success(self, mock_async_client, mock_get_broker_url):
        mock_get_broker_url.return_value = "http://broker:8080"

        mock_response = MagicMock()
        mock_response.json.return_value = {"statistics": {}}
        mock_response.status_code = 200

        mock_client_instance = AsyncMock()
        mock_client_instance.get = AsyncMock(return_value=mock_response)
        mock_async_client.return_value.__aenter__.return_value = mock_client_instance

        response = self.client.get("/v1/broker/chunks")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"statistics": {}})

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    @patch('ark_api.api.v1.broker.proxy_sse_stream')
    def test_get_chunks_watch(self, mock_proxy_sse, mock_get_broker_url):
        mock_get_broker_url.return_value = "http://broker:8080"

        async def mock_stream():
            yield "data: chunk\n\n"

        mock_proxy_sse.return_value = mock_stream()

        response = self.client.get("/v1/broker/chunks?watch=true")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "text/event-stream; charset=utf-8")

    @patch('ark_api.api.v1.broker.QueryPhaseTracker')
    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    @patch('ark_api.api.v1.broker.proxy_sse_stream')
    def test_get_chunks_watch_with_query_id(self, mock_proxy_sse, mock_get_broker_url, mock_tracker_class):
        mock_get_broker_url.return_value = "http://broker:8080"
        tracker = mock_tracker_class.return_value
        tracker.run = AsyncMock()
        tracker.terminal = asyncio.Event()
        tracker.idle_limit_seconds.return_value = 330

        async def mock_stream():
            yield "data: chunk\n\n"
            yield "data: [DONE]\n\n"

        mock_proxy_sse.return_value = mock_stream()

        response = self.client.get("/v1/broker/chunks?watch=true&query-id=query-123&namespace=team-a")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.text, "data: chunk\n\ndata: [DONE]\n\n")
        mock_proxy_sse.assert_called_once()
        call_args = mock_proxy_sse.call_args[0][0]
        self.assertIn("stream/query-123", call_args)
        self.assertIn("from-beginning=true", call_args)
        mock_tracker_class.assert_called_once_with("query-123", "team-a", True, None)

    @patch('ark_api.api.v1.broker.get_context', return_value={"namespace": "default"})
    @patch('ark_api.api.v1.broker.QueryPhaseTracker')
    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    @patch('ark_api.api.v1.broker.proxy_sse_stream')
    def test_get_chunks_watch_without_namespace_uses_context(self, mock_proxy_sse, mock_get_broker_url, mock_tracker_class, _):
        mock_get_broker_url.return_value = "http://broker:8080"
        tracker = mock_tracker_class.return_value
        tracker.run = AsyncMock()
        tracker.terminal = asyncio.Event()
        tracker.idle_limit_seconds.return_value = 330

        async def mock_stream():
            yield "data: [DONE]\n\n"

        mock_proxy_sse.return_value = mock_stream()

        response = self.client.get("/v1/broker/chunks?watch=true&query-id=query-123")

        self.assertEqual(response.status_code, 200)
        mock_tracker_class.assert_called_once_with("query-123", "default", False, None)

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    @patch('ark_api.api.v1.broker.httpx.AsyncClient')
    def test_get_events_success(self, mock_async_client, mock_get_broker_url):
        mock_get_broker_url.return_value = "http://broker:8080"

        mock_response = MagicMock()
        mock_response.json.return_value = {"events": []}
        mock_response.status_code = 200

        mock_client_instance = AsyncMock()
        mock_client_instance.get = AsyncMock(return_value=mock_response)
        mock_async_client.return_value.__aenter__.return_value = mock_client_instance

        response = self.client.get("/v1/broker/events")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"events": []})

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    def test_get_events_memory_not_available(self, mock_get_broker_url):
        mock_get_broker_url.return_value = None

        response = self.client.get("/v1/broker/events?memory=unavailable")

        self.assertEqual(response.status_code, 503)
        data = response.json()
        self.assertIn("error", data)
        self.assertEqual(data["error"]["type"], "service_unavailable")
        self.assertEqual(data["code"], "broker_unavailable")
        self.assertEqual(data["fallback"], "poll")

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    @patch('ark_api.api.v1.broker.httpx.AsyncClient')
    def test_get_events_connection_error(self, mock_async_client, mock_get_broker_url):
        mock_get_broker_url.return_value = "http://broker:8080"

        mock_client_instance = AsyncMock()
        mock_client_instance.get = AsyncMock(side_effect=httpx.ConnectError("Connection failed"))
        mock_async_client.return_value.__aenter__.return_value = mock_client_instance

        response = self.client.get("/v1/broker/events")

        self.assertEqual(response.status_code, 503)
        data = response.json()
        self.assertIn("error", data)
        self.assertEqual(data["error"]["type"], "connection_error")
        self.assertEqual(data["code"], "broker_unavailable")
        self.assertEqual(data["fallback"], "poll")

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    @patch('ark_api.api.v1.broker.httpx.AsyncClient')
    def test_get_events_generic_error(self, mock_async_client, mock_get_broker_url):
        mock_get_broker_url.return_value = "http://broker:8080"

        mock_client_instance = AsyncMock()
        mock_client_instance.get = AsyncMock(side_effect=Exception("Generic error"))
        mock_async_client.return_value.__aenter__.return_value = mock_client_instance

        response = self.client.get("/v1/broker/events")

        self.assertEqual(response.status_code, 500)
        data = response.json()
        self.assertIn("error", data)
        self.assertEqual(data["error"]["type"], "server_error")

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    @patch('ark_api.api.v1.broker.httpx.AsyncClient')
    def test_get_events_with_session_id(self, mock_async_client, mock_get_broker_url):
        mock_get_broker_url.return_value = "http://broker:8080"

        mock_response = MagicMock()
        mock_response.json.return_value = {"events": [{"id": "1"}]}
        mock_response.status_code = 200

        mock_client_instance = AsyncMock()
        mock_client_instance.get = AsyncMock(return_value=mock_response)
        mock_async_client.return_value.__aenter__.return_value = mock_client_instance

        response = self.client.get("/v1/broker/events?session_id=sess-123")

        self.assertEqual(response.status_code, 200)
        mock_client_instance.get.assert_called_once()
        call_args = mock_client_instance.get.call_args[0][0]
        self.assertIn("session_id=sess-123", call_args)

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    @patch('ark_api.api.v1.broker.proxy_sse_stream')
    def test_get_events_watch(self, mock_proxy_sse, mock_get_broker_url):
        mock_get_broker_url.return_value = "http://broker:8080"

        async def mock_stream():
            yield "data: event\n\n"

        mock_proxy_sse.return_value = mock_stream()

        response = self.client.get("/v1/broker/events?watch=true")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "text/event-stream; charset=utf-8")

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    @patch('ark_api.api.v1.broker.httpx.AsyncClient')
    def test_get_events_with_query_id(self, mock_async_client, mock_get_broker_url):
        mock_get_broker_url.return_value = "http://broker:8080"

        mock_response = MagicMock()
        mock_response.json.return_value = {"events": [{"id": "1"}]}
        mock_response.status_code = 200

        mock_client_instance = AsyncMock()
        mock_client_instance.get = AsyncMock(return_value=mock_response)
        mock_async_client.return_value.__aenter__.return_value = mock_client_instance

        response = self.client.get("/v1/broker/events/query-123")

        self.assertEqual(response.status_code, 200)
        mock_client_instance.get.assert_called_once()
        call_args = mock_client_instance.get.call_args[0][0]
        self.assertIn("events/query-123", call_args)

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    @patch('ark_api.api.v1.broker.proxy_sse_stream')
    def test_get_events_watch_with_query_id(self, mock_proxy_sse, mock_get_broker_url):
        mock_get_broker_url.return_value = "http://broker:8080"

        async def mock_stream():
            yield "data: event\n\n"

        mock_proxy_sse.return_value = mock_stream()

        response = self.client.get("/v1/broker/events/query-123?watch=true")

        self.assertEqual(response.status_code, 200)
        mock_proxy_sse.assert_called_once()
        call_args = mock_proxy_sse.call_args[0][0]
        self.assertIn("events/query-123", call_args)
        self.assertIn("watch=true", call_args)

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    @patch('ark_api.api.v1.broker.httpx.AsyncClient')
    def test_get_sessions_success(self, mock_async_client, mock_get_broker_url):
        mock_get_broker_url.return_value = "http://broker:8080"

        mock_response = MagicMock()
        mock_response.json.return_value = {"sessions": []}
        mock_response.status_code = 200

        mock_client_instance = AsyncMock()
        mock_client_instance.get = AsyncMock(return_value=mock_response)
        mock_async_client.return_value.__aenter__.return_value = mock_client_instance

        response = self.client.get("/v1/broker/sessions")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"sessions": []})

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    @patch('ark_api.api.v1.broker.proxy_sse_stream')
    def test_get_sessions_watch(self, mock_proxy_sse, mock_get_broker_url):
        mock_get_broker_url.return_value = "http://broker:8080"

        async def mock_stream():
            yield "data: session\n\n"

        mock_proxy_sse.return_value = mock_stream()

        response = self.client.get("/v1/broker/sessions?watch=true")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "text/event-stream; charset=utf-8")

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    def test_get_sessions_memory_not_available(self, mock_get_broker_url):
        mock_get_broker_url.return_value = None

        response = self.client.get("/v1/broker/sessions?memory=unavailable")

        self.assertEqual(response.status_code, 503)
        data = response.json()
        self.assertIn("error", data)
        self.assertEqual(data["error"]["type"], "service_unavailable")
        self.assertEqual(data["code"], "broker_unavailable")
        self.assertEqual(data["fallback"], "poll")


class TestHelperFunctions(unittest.IsolatedAsyncioTestCase):

    @patch('ark_api.api.v1.broker.get_all_memory_resources')
    @patch('ark_api.api.v1.broker.with_ark_client')
    @patch('ark_api.api.v1.broker.get_memory_service_address')
    async def test_get_broker_url_success(self, mock_get_address, mock_client, mock_get_resources):
        from ark_api.api.v1.broker import get_broker_url

        mock_client_instance = AsyncMock()
        mock_client.return_value.__aenter__.return_value = mock_client_instance
        mock_get_resources.return_value = [{"metadata": {"name": "default"}}]
        mock_get_address.return_value = "http://broker-service:8080"

        result = await get_broker_url("default")

        self.assertEqual(result, "http://broker-service:8080")
        mock_get_resources.assert_called_once()
        mock_get_address.assert_called_once()

    @patch('ark_api.api.v1.broker.get_all_memory_resources')
    @patch('ark_api.api.v1.broker.with_ark_client')
    async def test_get_broker_url_no_memory(self, mock_client, mock_get_resources):
        from ark_api.api.v1.broker import get_broker_url

        mock_client_instance = AsyncMock()
        mock_client.return_value.__aenter__.return_value = mock_client_instance
        mock_get_resources.return_value = []

        result = await get_broker_url("nonexistent")

        self.assertIsNone(result)

    @patch('ark_api.api.v1.broker.get_all_memory_resources')
    @patch('ark_api.api.v1.broker.with_ark_client')
    async def test_get_broker_url_exception(self, mock_client, mock_get_resources):
        from ark_api.api.v1.broker import get_broker_url

        mock_client_instance = AsyncMock()
        mock_client.return_value.__aenter__.return_value = mock_client_instance
        mock_get_resources.side_effect = Exception("Connection error")

        result = await get_broker_url("default")

        self.assertIsNone(result)

    async def test_proxy_sse_stream_success(self):
        from ark_api.api.v1.broker import proxy_sse_stream
        from unittest.mock import MagicMock

        mock_response = MagicMock()
        mock_response.status_code = 200

        async def mock_aiter_lines():
            yield "data: test1"
            yield "data: test2"

        mock_response.aiter_lines = mock_aiter_lines
        mock_response.__aenter__ = AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = AsyncMock(return_value=None)

        mock_client = MagicMock()
        mock_client.stream = MagicMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch('ark_api.api.v1.broker.httpx.AsyncClient') as mock_async_client:
            mock_async_client.return_value = mock_client

            result = []
            async for chunk in proxy_sse_stream("http://broker:8080/traces"):
                result.append(chunk)

            self.assertEqual(len(result), 2)
            self.assertIn("test1", result[0])
            self.assertIn("test2", result[1])

    async def test_proxy_sse_stream_error_response(self):
        from ark_api.api.v1.broker import proxy_sse_stream

        mock_response = AsyncMock()
        mock_response.status_code = 500
        mock_response.reason_phrase = "Internal Server Error"
        mock_response.aread = AsyncMock(return_value=b'{"error": "server error"}')

        mock_stream_context = AsyncMock()
        mock_stream_context.__aenter__.return_value = mock_response
        mock_stream_context.__aexit__.return_value = None

        mock_client = AsyncMock()
        mock_client.stream.return_value = mock_stream_context

        mock_client_context = AsyncMock()
        mock_client_context.__aenter__.return_value = mock_client
        mock_client_context.__aexit__.return_value = None

        with patch('ark_api.api.v1.broker.httpx.AsyncClient') as mock_async_client:
            mock_async_client.return_value = mock_client_context

            result = []
            async for chunk in proxy_sse_stream("http://broker:8080/traces"):
                result.append(chunk)

            self.assertEqual(len(result), 1)
            self.assertIn("error", result[0])

    async def test_proxy_sse_stream_connection_error(self):
        from ark_api.api.v1.broker import proxy_sse_stream
        from unittest.mock import MagicMock

        mock_client = MagicMock()
        mock_client.stream.side_effect = httpx.ConnectError("Connection failed")
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch('ark_api.api.v1.broker.httpx.AsyncClient') as mock_async_client:
            mock_async_client.return_value = mock_client

            result = []
            async for chunk in proxy_sse_stream("http://broker:8080/traces"):
                result.append(chunk)

            self.assertEqual(len(result), 1)
            self.assertIn("connection_error", result[0])

            payload = json.loads(result[0].removeprefix("data: ").strip())
            self.assertEqual(payload["error"]["type"], "connection_error")
            self.assertEqual(payload["code"], "broker_unavailable")
            self.assertEqual(payload["fallback"], "poll")

    async def test_proxy_sse_stream_generic_exception(self):
        from ark_api.api.v1.broker import proxy_sse_stream

        mock_client = AsyncMock()
        mock_client.stream.side_effect = Exception("Unexpected error")

        mock_client_context = AsyncMock()
        mock_client_context.__aenter__.return_value = mock_client
        mock_client_context.__aexit__.return_value = None

        with patch('ark_api.api.v1.broker.httpx.AsyncClient') as mock_async_client:
            mock_async_client.return_value = mock_client_context

            result = []
            async for chunk in proxy_sse_stream("http://broker:8080/traces"):
                result.append(chunk)

            self.assertEqual(len(result), 1)
            self.assertIn("server_error", result[0])



def query_object(phase, content=None, conditions=None, timeout=None, resource_version="100"):
    status = {"phase": phase}
    if content is not None:
        status["response"] = {"content": content}
    if conditions is not None:
        status["conditions"] = conditions
    spec = {"timeout": timeout} if timeout else {}
    return {"metadata": {"name": "q", "resourceVersion": resource_version}, "spec": spec, "status": status}


class FakeWatch:
    """Plays one scripted list of events per watch; an Exception item is raised."""

    scripts: list = []
    calls: list = []

    def __init__(self):
        self.script = FakeWatch.scripts.pop(0) if FakeWatch.scripts else "hang"

    def stream(self, func, **kwargs):
        FakeWatch.calls.append(kwargs)
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def __aiter__(self):
        if self.script == "hang":
            await asyncio.Event().wait()
        for item in self.script:
            if isinstance(item, Exception):
                raise item
            yield item


class TestWatchChunksUntilTerminal(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        FakeWatch.scripts = []
        FakeWatch.calls = []
        self.broker_closed = asyncio.Event()
        self.custom_api = MagicMock()
        self.custom_api.get_namespaced_custom_object = AsyncMock()

        patches = [
            patch.multiple(
                'ark_api.api.v1.broker',
                CHUNK_TERMINAL_GRACE_SECONDS=0.05,
                BROKER_CHUNK_IDLE_TIMEOUT_SECONDS=0.3,
                CHUNK_ACTIVE_TIMEOUT_MARGIN_SECONDS=0,
            ),
            patch('ark_api.api.v1.broker.k8s_watch.Watch', FakeWatch),
            patch('ark_api.api.v1.broker.k8s_client.CustomObjectsApi', return_value=self.custom_api),
            patch('ark_api.api.v1.broker.get_context', return_value={"namespace": "default"}),
        ]
        api_client = patch('ark_api.api.v1.broker.get_impersonating_api_client')
        mock_api_client = api_client.start()
        self.addCleanup(api_client.stop)
        mock_api_client.return_value.__aenter__.return_value = MagicMock()
        mock_api_client.return_value.__aexit__.return_value = None
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def broker(self, *lines, hang=True, delay=0):
        closed = self.broker_closed

        async def stream(url):
            try:
                for line in lines:
                    if delay:
                        await asyncio.sleep(delay)
                    yield line
                if hang:
                    await asyncio.Event().wait()
            finally:
                closed.set()

        proxy_patch = patch('ark_api.api.v1.broker.proxy_sse_stream', side_effect=stream)
        proxy_patch.start()
        self.addCleanup(proxy_patch.stop)

    async def collect(self, namespace=None, timeout=5):
        from ark_api.api.v1.broker import watch_chunks_until_terminal

        async def run():
            return [e async for e in watch_chunks_until_terminal("http://broker/stream/q", "q", namespace, None)]

        return await asyncio.wait_for(run(), timeout=timeout)

    def error_payload(self, event):
        return json.loads(event.removeprefix("data: ").strip())["error"]

    async def test_already_terminal_on_read_closes_without_watching(self):
        self.broker("data: chunk-1\n\n")
        self.custom_api.get_namespaced_custom_object.return_value = query_object("done")

        events = await self.collect()

        self.assertEqual(events, ["data: chunk-1\n\n", "data: [DONE]\n\n"])
        self.assertEqual(FakeWatch.calls, [])
        self.assertTrue(self.broker_closed.is_set())

    async def test_watches_from_read_resource_version_and_closes_on_error(self):
        self.broker("data: chunk-1\n\n")
        self.custom_api.get_namespaced_custom_object.return_value = query_object("running", resource_version="42")
        FakeWatch.scripts = [[{"type": "MODIFIED", "raw_object": query_object("error", content="executor crashed")}]]

        events = await self.collect(namespace="team-a")

        self.assertEqual(len(events), 3)
        self.assertEqual(self.error_payload(events[1]), {"message": "executor crashed", "type": "server_error", "code": "query_error"})
        self.assertEqual(events[2], "data: [DONE]\n\n")
        self.assertEqual(FakeWatch.calls[0]["resource_version"], "42")
        self.assertEqual(FakeWatch.calls[0]["namespace"], "team-a")
        self.assertEqual(FakeWatch.calls[0]["field_selector"], "metadata.name=q")
        self.custom_api.get_namespaced_custom_object.assert_awaited_with("ark.mckinsey.com", "v1alpha1", "team-a", "queries", "q")

    async def test_error_message_falls_back_to_condition_message(self):
        self.broker()
        conditions = [{"type": "Completed", "message": "query execution failed: EOF"}]
        self.custom_api.get_namespaced_custom_object.return_value = query_object("error", conditions=conditions)

        events = await self.collect()

        self.assertEqual(self.error_payload(events[0])["message"], "query execution failed: EOF")

    async def test_error_message_default(self):
        self.broker()
        self.custom_api.get_namespaced_custom_object.return_value = query_object("error")

        events = await self.collect()

        self.assertEqual(self.error_payload(events[0])["message"], "Query failed")

    async def test_canceled_closes_with_done(self):
        self.broker()
        self.custom_api.get_namespaced_custom_object.return_value = query_object("canceled")

        events = await self.collect()

        self.assertEqual(events, ["data: [DONE]\n\n"])

    async def test_broker_done_during_grace_wins(self):
        self.broker("data: chunk-1\n\n", "data: [DONE]\n\n", delay=0.1)
        self.custom_api.get_namespaced_custom_object.return_value = query_object("done")

        with patch('ark_api.api.v1.broker.CHUNK_TERMINAL_GRACE_SECONDS', 10):
            events = await self.collect(timeout=2)

        self.assertEqual(events, ["data: chunk-1\n\n", "data: [DONE]\n\n"])

    async def test_not_found_with_namespace_means_deleted(self):
        self.broker()
        self.custom_api.get_namespaced_custom_object.side_effect = ApiException(status=404)

        events = await self.collect(namespace="team-a")

        self.assertEqual(self.error_payload(events[0])["code"], "query_not_found")
        self.assertEqual(events[1], "data: [DONE]\n\n")

    async def test_not_found_without_namespace_keeps_relaying_until_idle(self):
        self.broker("data: chunk-1\n\n")
        self.custom_api.get_namespaced_custom_object.side_effect = ApiException(status=404)

        with self.assertLogs('ark_api.api.v1.broker', level='WARNING') as logs:
            events = await self.collect()

        self.assertEqual(events[0], "data: chunk-1\n\n")
        self.assertEqual(self.error_payload(events[1])["code"], "broker_idle_timeout")
        self.assertEqual(events[2], "data: [DONE]\n\n")
        self.assertTrue(any("Stopped tracking Query q phase" in line for line in logs.output))
        self.custom_api.get_namespaced_custom_object.assert_awaited_once()

    async def test_forbidden_is_logged_and_stream_continues(self):
        self.broker("data: chunk-1\n\n", "data: chunk-2\n\n", hang=False, delay=0.05)
        self.custom_api.get_namespaced_custom_object.side_effect = ApiException(status=403)

        with self.assertLogs('ark_api.api.v1.broker', level='WARNING') as logs:
            events = await self.collect(namespace="team-a")

        self.assertEqual(events, ["data: chunk-1\n\n", "data: chunk-2\n\n"])
        self.assertTrue(any("403" in line for line in logs.output))
        self.custom_api.get_namespaced_custom_object.assert_awaited_once()

    async def test_watch_gone_rereads_and_restarts(self):
        self.broker()
        self.custom_api.get_namespaced_custom_object.side_effect = [
            query_object("running", resource_version="1"),
            query_object("running", resource_version="7"),
        ]
        FakeWatch.scripts = [
            [ApiException(status=410)],
            [{"type": "MODIFIED", "raw_object": query_object("done")}],
        ]

        events = await self.collect()

        self.assertEqual(events, ["data: [DONE]\n\n"])
        self.assertEqual([c["resource_version"] for c in FakeWatch.calls], ["1", "7"])

    async def test_watch_closing_normally_rereads(self):
        self.broker()
        self.custom_api.get_namespaced_custom_object.side_effect = [
            query_object("running"),
            query_object("done"),
        ]
        FakeWatch.scripts = [[]]

        events = await self.collect()

        self.assertEqual(events, ["data: [DONE]\n\n"])
        self.assertEqual(self.custom_api.get_namespaced_custom_object.await_count, 2)

    async def test_deleted_event_closes_with_error(self):
        self.broker()
        self.custom_api.get_namespaced_custom_object.return_value = query_object("running")
        FakeWatch.scripts = [[{"type": "DELETED", "raw_object": query_object("running")}]]

        events = await self.collect()

        self.assertEqual(self.error_payload(events[0])["code"], "query_deleted")

    async def test_active_query_is_not_cut_at_default_idle_limit(self):
        self.broker("data: chunk-1\n\n")
        self.custom_api.get_namespaced_custom_object.return_value = query_object("running", timeout="2s")

        with self.assertRaises(asyncio.TimeoutError):
            await self.collect(timeout=1)

        self.assertTrue(self.broker_closed.is_set())

    async def test_active_query_closes_after_its_own_timeout(self):
        self.broker("data: chunk-1\n\n")
        self.custom_api.get_namespaced_custom_object.return_value = query_object("running", timeout="1s")

        events = await self.collect(timeout=3)

        self.assertEqual(self.error_payload(events[1])["code"], "broker_idle_timeout")
        self.assertIn("1s", self.error_payload(events[1])["message"])
