"""Tests for broker.py — BrokerClient and discover_broker_url."""

import json
import pytest
import httpx
from unittest.mock import AsyncMock, MagicMock, patch

from ark_sdk.broker import BrokerClient, discover_broker_url


@pytest.fixture(autouse=True)
def reset_cache():
    import ark_sdk.broker as broker_module
    broker_module._broker_url_cached = False
    broker_module._cached_broker_url = None
    yield
    broker_module._broker_url_cached = False
    broker_module._cached_broker_url = None


class TestBrokerClientBuildChunk:
    def test_chunk_format(self):
        client = BrokerClient("http://broker", "my-query", "sess-1", "my-agent")
        raw = client._build_chunk("hello", finish_reason="stop")
        chunk = json.loads(raw.decode().strip())

        assert chunk["object"] == "chat.completion.chunk"
        assert chunk["choices"][0]["delta"]["content"] == "hello"
        assert chunk["choices"][0]["delta"]["role"] == "assistant"
        assert chunk["choices"][0]["finish_reason"] == "stop"
        assert chunk["ark"]["query"] == "my-query"
        assert chunk["ark"]["session"] == "sess-1"
        assert chunk["ark"]["agent"] == "my-agent"
        assert chunk["model"] == "agent/my-agent"

    def test_chunk_no_finish_reason(self):
        client = BrokerClient("http://broker", "q", "", "a")
        raw = client._build_chunk("token")
        chunk = json.loads(raw.decode().strip())
        assert chunk["choices"][0]["finish_reason"] is None

    def test_chunk_ends_with_newline(self):
        client = BrokerClient("http://broker", "q", "", "a")
        raw = client._build_chunk("x")
        assert raw.endswith(b"\n")


class TestBrokerClientSendChunk:
    @pytest.mark.anyio
    async def test_sends_chunk_to_correct_url(self):
        client = BrokerClient("http://broker:3000", "my query", "", "agent")
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_http = AsyncMock()
            mock_http.post = AsyncMock(return_value=mock_resp)
            mock_http.__aenter__ = AsyncMock(return_value=mock_http)
            mock_http.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_http

            await client.send_chunk("hello", finish_reason="stop")

            mock_http.post.assert_called_once()
            url = mock_http.post.call_args[0][0]
            assert "my%20query" in url
            assert url.endswith("/stream/my%20query")

    @pytest.mark.anyio
    async def test_swallows_http_error(self):
        client = BrokerClient("http://broker", "q", "", "a")
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_http = AsyncMock()
            mock_http.post = AsyncMock(side_effect=httpx.ConnectError("unreachable"))
            mock_http.__aenter__ = AsyncMock(return_value=mock_http)
            mock_http.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_http

            await client.send_chunk("hello")

    @pytest.mark.anyio
    async def test_logs_non_2xx_status(self, caplog):
        import logging
        client = BrokerClient("http://broker", "q", "", "a")
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_resp = MagicMock()
            mock_resp.status_code = 500
            mock_http = AsyncMock()
            mock_http.post = AsyncMock(return_value=mock_resp)
            mock_http.__aenter__ = AsyncMock(return_value=mock_http)
            mock_http.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_http

            with caplog.at_level(logging.WARNING):
                await client.send_chunk("hello")

            assert any("500" in r.message for r in caplog.records)


class TestBrokerClientSendMessages:
    @pytest.mark.anyio
    async def test_posts_to_messages_url_with_payload(self):
        client = BrokerClient("http://broker:3000", "my-query", "conv-1", "agent")
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_http = AsyncMock()
            mock_http.post = AsyncMock(return_value=mock_resp)
            mock_http.__aenter__ = AsyncMock(return_value=mock_http)
            mock_http.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_http

            messages = [
                {"role": "user", "content": "hi"},
                {"role": "assistant", "content": "hello"},
            ]
            await client.send_messages("conv-1", messages)

            mock_http.post.assert_called_once()
            url = mock_http.post.call_args[0][0]
            assert url == "http://broker:3000/messages"
            payload = mock_http.post.call_args[1]["json"]
            assert payload["conversation_id"] == "conv-1"
            assert payload["query_id"] == "my-query"
            assert payload["messages"] == messages

    @pytest.mark.anyio
    async def test_with_ttl_sends_ttl_seconds(self):
        client = BrokerClient("http://broker:3000", "my-query", "conv-1", "agent", message_ttl_seconds=3600)
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_http = AsyncMock()
            mock_http.post = AsyncMock(return_value=mock_resp)
            mock_http.__aenter__ = AsyncMock(return_value=mock_http)
            mock_http.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_http

            await client.send_messages("conv-1", [{"role": "user", "content": "hi"}])

            payload = mock_http.post.call_args[1]["json"]
            assert payload["ttl_seconds"] == 3600

    @pytest.mark.anyio
    async def test_without_ttl_omits_ttl_seconds(self):
        client = BrokerClient("http://broker:3000", "my-query", "conv-1", "agent", message_ttl_seconds=None)
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_http = AsyncMock()
            mock_http.post = AsyncMock(return_value=mock_resp)
            mock_http.__aenter__ = AsyncMock(return_value=mock_http)
            mock_http.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_http

            await client.send_messages("conv-1", [{"role": "user", "content": "hi"}])

            payload = mock_http.post.call_args[1]["json"]
            assert "ttl_seconds" not in payload

    @pytest.mark.anyio
    async def test_swallows_http_error(self):
        client = BrokerClient("http://broker", "q", "", "a")
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_http = AsyncMock()
            mock_http.post = AsyncMock(side_effect=httpx.ConnectError("unreachable"))
            mock_http.__aenter__ = AsyncMock(return_value=mock_http)
            mock_http.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_http

            await client.send_messages("conv", [{"role": "user", "content": "x"}])

    @pytest.mark.anyio
    async def test_logs_non_2xx_status(self, caplog):
        import logging
        client = BrokerClient("http://broker", "q", "", "a")
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_resp = MagicMock()
            mock_resp.status_code = 500
            mock_http = AsyncMock()
            mock_http.post = AsyncMock(return_value=mock_resp)
            mock_http.__aenter__ = AsyncMock(return_value=mock_http)
            mock_http.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_http

            with caplog.at_level(logging.WARNING):
                await client.send_messages("conv", [{"role": "user", "content": "x"}])

            assert any("500" in r.message for r in caplog.records)


class TestBrokerClientFinalChunk:
    def test_chunk_format(self):
        client = BrokerClient("http://broker", "my-query", "sess-1", "my-agent")
        raw = client._build_final_chunk(
            response_text="final answer",
            response_messages=[{"role": "assistant", "content": "final answer"}],
        )
        chunk = json.loads(raw.decode().strip())

        assert chunk["id"] == "chatcmpl-final"
        assert chunk["object"] == "chat.completion.chunk"
        assert chunk["choices"][0]["delta"]["content"] == ""
        assert chunk["choices"][0]["finish_reason"] == "stop"
        assert chunk["ark"]["query"] == "my-query"
        assert chunk["ark"]["session"] == "sess-1"
        assert chunk["ark"]["agent"] == "my-agent"

        cq = chunk["ark"]["completedQuery"]
        assert cq["metadata"]["name"] == "my-query"
        assert cq["status"]["phase"] == "done"
        assert cq["status"]["conversationId"] == "sess-1"
        assert cq["status"]["response"]["content"] == "final answer"
        assert cq["status"]["response"]["phase"] == "done"
        assert json.loads(cq["status"]["response"]["raw"]) == [
            {"role": "assistant", "content": "final answer"}
        ]
        assert "tokenUsage" not in cq["status"]

    def test_chunk_includes_token_usage_when_provided(self):
        client = BrokerClient("http://broker", "q", "s", "a")
        raw = client._build_final_chunk(
            response_text="x",
            token_usage={"promptTokens": 10, "completionTokens": 5, "totalTokens": 15},
        )
        chunk = json.loads(raw.decode().strip())
        assert chunk["ark"]["completedQuery"]["status"]["tokenUsage"] == {
            "promptTokens": 10,
            "completionTokens": 5,
            "totalTokens": 15,
        }

    def test_chunk_omits_raw_when_no_messages(self):
        client = BrokerClient("http://broker", "q", "s", "a")
        raw = client._build_final_chunk(response_text="x")
        chunk = json.loads(raw.decode().strip())
        assert "raw" not in chunk["ark"]["completedQuery"]["status"]["response"]

    @pytest.mark.anyio
    async def test_posts_to_stream_url(self):
        client = BrokerClient("http://broker:3000", "my query", "sess", "agent")
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_http = AsyncMock()
            mock_http.post = AsyncMock(return_value=mock_resp)
            mock_http.__aenter__ = AsyncMock(return_value=mock_http)
            mock_http.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_http

            await client.send_final_chunk(response_text="done")

            mock_http.post.assert_called_once()
            url = mock_http.post.call_args[0][0]
            assert url.endswith("/stream/my%20query")

    @pytest.mark.anyio
    async def test_swallows_http_error(self):
        client = BrokerClient("http://broker", "q", "", "a")
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_http = AsyncMock()
            mock_http.post = AsyncMock(side_effect=httpx.ConnectError("unreachable"))
            mock_http.__aenter__ = AsyncMock(return_value=mock_http)
            mock_http.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_http

            await client.send_final_chunk(response_text="x")

    @pytest.mark.anyio
    async def test_logs_non_2xx_status(self, caplog):
        import logging
        client = BrokerClient("http://broker", "q", "", "a")
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_resp = MagicMock()
            mock_resp.status_code = 500
            mock_http = AsyncMock()
            mock_http.post = AsyncMock(return_value=mock_resp)
            mock_http.__aenter__ = AsyncMock(return_value=mock_http)
            mock_http.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_http

            with caplog.at_level(logging.WARNING):
                await client.send_final_chunk(response_text="x")

            assert any("500" in r.message for r in caplog.records)


class TestBrokerClientComplete:
    @pytest.mark.anyio
    async def test_posts_to_complete_url(self):
        client = BrokerClient("http://broker:3000", "my-query", "", "a")
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_http = AsyncMock()
            mock_http.post = AsyncMock(return_value=mock_resp)
            mock_http.__aenter__ = AsyncMock(return_value=mock_http)
            mock_http.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_http

            await client.complete()

            url = mock_http.post.call_args[0][0]
            assert url.endswith("/stream/my-query/complete")

    @pytest.mark.anyio
    async def test_swallows_error(self):
        client = BrokerClient("http://broker", "q", "", "a")
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_http = AsyncMock()
            mock_http.post = AsyncMock(side_effect=Exception("boom"))
            mock_http.__aenter__ = AsyncMock(return_value=mock_http)
            mock_http.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_http

            await client.complete()


class TestDiscoverBrokerUrl:
    @pytest.mark.anyio
    async def test_returns_none_when_config_disabled(self):
        mock_config = MagicMock()
        mock_config.enabled = False

        mock_api_client = AsyncMock()
        mock_api_client.__aenter__ = AsyncMock(return_value=mock_api_client)
        mock_api_client.__aexit__ = AsyncMock(return_value=False)

        with patch("ark_sdk.broker.init_k8s", new_callable=AsyncMock), \
             patch("ark_sdk.broker.ApiClient", return_value=mock_api_client), \
             patch("ark_sdk.broker.get_streaming_config", new_callable=AsyncMock, return_value=mock_config):
            result = await discover_broker_url("default")

        assert result is None

    @pytest.mark.anyio
    async def test_returns_none_on_k8s_error(self):
        with patch("ark_sdk.broker.init_k8s", new_callable=AsyncMock, side_effect=Exception("no k8s")):
            result = await discover_broker_url("default")

        assert result is None

    @pytest.mark.anyio
    async def test_caches_result(self):
        mock_config = MagicMock()
        mock_config.enabled = False

        mock_api_client = AsyncMock()
        mock_api_client.__aenter__ = AsyncMock(return_value=mock_api_client)
        mock_api_client.__aexit__ = AsyncMock(return_value=False)

        with patch("ark_sdk.broker.init_k8s", new_callable=AsyncMock), \
             patch("ark_sdk.broker.ApiClient", return_value=mock_api_client), \
             patch("ark_sdk.broker.get_streaming_config", new_callable=AsyncMock, return_value=mock_config) as mock_get:
            await discover_broker_url("default")
            await discover_broker_url("default")

        mock_get.assert_called_once()
