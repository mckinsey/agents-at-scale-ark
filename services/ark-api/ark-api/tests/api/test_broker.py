import os
import json
import unittest
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient
import httpx

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

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    @patch('ark_api.api.v1.broker.proxy_sse_stream')
    def test_get_chunks_watch_with_query_id(self, mock_proxy_sse, mock_get_broker_url):
        mock_get_broker_url.return_value = "http://broker:8080"

        async def mock_stream():
            yield "data: chunk\n\n"

        mock_proxy_sse.return_value = mock_stream()

        response = self.client.get("/v1/broker/chunks?watch=true&query-id=query-123")

        self.assertEqual(response.status_code, 200)
        mock_proxy_sse.assert_called_once()
        call_args = mock_proxy_sse.call_args[0][0]
        self.assertIn("stream/query-123", call_args)
        self.assertIn("from-beginning=true", call_args)

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    @patch('ark_api.api.v1.broker.httpx.AsyncClient')
    def test_purge_traces_success(self, mock_async_client, mock_get_broker_url):
        mock_get_broker_url.return_value = "http://broker:8080"

        mock_response = MagicMock()
        mock_response.json.return_value = {"success": True}
        mock_response.status_code = 200

        mock_client_instance = AsyncMock()
        mock_client_instance.delete = AsyncMock(return_value=mock_response)
        mock_async_client.return_value.__aenter__.return_value = mock_client_instance

        response = self.client.delete("/v1/broker/traces")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"success": True})

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    def test_purge_traces_memory_not_available(self, mock_get_broker_url):
        mock_get_broker_url.return_value = None

        response = self.client.delete("/v1/broker/traces?memory=unavailable")

        self.assertEqual(response.status_code, 503)
        data = response.json()
        self.assertIn("error", data)
        self.assertEqual(data["error"]["type"], "service_unavailable")

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    @patch('ark_api.api.v1.broker.httpx.AsyncClient')
    def test_purge_traces_connection_error(self, mock_async_client, mock_get_broker_url):
        mock_get_broker_url.return_value = "http://broker:8080"

        mock_client_instance = AsyncMock()
        mock_client_instance.delete = AsyncMock(side_effect=httpx.ConnectError("Connection failed"))
        mock_async_client.return_value.__aenter__.return_value = mock_client_instance

        response = self.client.delete("/v1/broker/traces")

        self.assertEqual(response.status_code, 503)
        data = response.json()
        self.assertIn("error", data)
        self.assertEqual(data["error"]["type"], "connection_error")

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
    def test_purge_events_success(self, mock_async_client, mock_get_broker_url):
        mock_get_broker_url.return_value = "http://broker:8080"

        mock_response = MagicMock()
        mock_response.json.return_value = {"success": True}
        mock_response.status_code = 200

        mock_client_instance = AsyncMock()
        mock_client_instance.delete = AsyncMock(return_value=mock_response)
        mock_async_client.return_value.__aenter__.return_value = mock_client_instance

        response = self.client.delete("/v1/broker/events")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"success": True})

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    def test_purge_events_memory_not_available(self, mock_get_broker_url):
        mock_get_broker_url.return_value = None

        response = self.client.delete("/v1/broker/events?memory=unavailable")

        self.assertEqual(response.status_code, 503)
        data = response.json()
        self.assertIn("error", data)
        self.assertEqual(data["error"]["type"], "service_unavailable")

    @patch('ark_api.api.v1.broker.get_broker_url', new_callable=AsyncMock)
    @patch('ark_api.api.v1.broker.httpx.AsyncClient')
    def test_purge_events_connection_error(self, mock_async_client, mock_get_broker_url):
        mock_get_broker_url.return_value = "http://broker:8080"

        mock_client_instance = AsyncMock()
        mock_client_instance.delete = AsyncMock(side_effect=httpx.ConnectError("Connection failed"))
        mock_async_client.return_value.__aenter__.return_value = mock_client_instance

        response = self.client.delete("/v1/broker/events")

        self.assertEqual(response.status_code, 503)
        data = response.json()
        self.assertIn("error", data)
        self.assertEqual(data["error"]["type"], "connection_error")


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
