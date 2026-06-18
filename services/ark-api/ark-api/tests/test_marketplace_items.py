"""Tests for the marketplace-items aggregator endpoint."""
import asyncio
import json
import socket
import unittest
from contextlib import ExitStack, asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient
from kubernetes_asyncio.client.rest import ApiException

import src.ark_api.api.v1.marketplace_items as items_module
from src.ark_api.api.v1.marketplace_items import router

app = FastAPI()
app.include_router(router, prefix="/v1")
client = TestClient(app)

MODULE = "src.ark_api.api.v1.marketplace_items"


@asynccontextmanager
async def _fake_api_client(impersonation=None):
    yield MagicMock()


def _sources_configmap(sources):
    data = {
        name: json.dumps({"url": url, **({"displayName": dn} if dn else {})})
        for name, url, dn in sources
    }
    return SimpleNamespace(data=data)


class _FakeResponse:
    def __init__(self, payload, is_redirect=False):
        self._payload = payload
        self.is_redirect = is_redirect

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class _FakeAsyncClient:
    def __init__(self, get_impl):
        self._get_impl = get_impl

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, url, headers=None, extensions=None):
        return await self._get_impl(str(url))


def _patch(mock_core, get_impl, host_safe=True):
    # Echo the host as the "pinned IP" so the fetched URL is unchanged and the
    # functional assertions below still key off the original hostname.
    async def _fake_resolve(host, port):
        return host if host_safe else None

    stack = ExitStack()
    stack.enter_context(patch(f"{MODULE}.get_impersonating_api_client", _fake_api_client))
    stack.enter_context(patch(f"{MODULE}.client.CoreV1Api", return_value=mock_core))
    stack.enter_context(
        patch(f"{MODULE}.httpx.AsyncClient", lambda *a, **k: _FakeAsyncClient(get_impl))
    )
    stack.enter_context(patch(f"{MODULE}._resolve_safe_ip", _fake_resolve))
    return stack


class TestMarketplaceItemsAggregator(unittest.TestCase):
    def setUp(self):
        items_module._items_cache.clear()

    def _core(self, sources):
        mock_core = MagicMock()
        mock_core.read_namespaced_config_map = AsyncMock(
            return_value=_sources_configmap(sources)
        )
        return mock_core

    def test_all_sources_reachable(self):
        mock_core = self._core(
            [("a", "https://a.test/m.json", "A"), ("b", "https://b.test/m.json", None)]
        )

        async def get_impl(url):
            return _FakeResponse({"items": [{"name": url}]})

        with _patch(mock_core, get_impl):
            response = client.get("/v1/namespaces/team-a/marketplace-items")
        self.assertEqual(response.status_code, 200)
        body = {entry["source"]: entry for entry in response.json()}
        self.assertEqual(body["a"]["displayName"], "A")
        self.assertEqual(body["b"]["displayName"], "b")
        self.assertEqual(len(body["a"]["items"]), 1)
        self.assertIsNone(body["a"].get("error"))

    def test_one_source_unreachable(self):
        mock_core = self._core(
            [("ok", "https://ok.test/m.json", None), ("bad", "https://bad.test/m.json", None)]
        )

        async def get_impl(url):
            if "bad" in url:
                raise httpx.HTTPStatusError(
                    "404",
                    request=httpx.Request("GET", url),
                    response=httpx.Response(404, request=httpx.Request("GET", url)),
                )
            return _FakeResponse({"items": [{"name": "x"}]})

        with _patch(mock_core, get_impl):
            response = client.get("/v1/namespaces/team-a/marketplace-items")
        self.assertEqual(response.status_code, 200)
        body = {entry["source"]: entry for entry in response.json()}
        self.assertEqual(body["bad"]["error"]["code"], "http_error")
        self.assertEqual(len(body["ok"]["items"]), 1)

    def test_per_source_timeout(self):
        mock_core = self._core([("slow", "https://slow.test/m.json", None)])

        async def get_impl(url):
            raise httpx.TimeoutException("timed out")

        with _patch(mock_core, get_impl):
            response = client.get("/v1/namespaces/team-a/marketplace-items")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["error"]["code"], "fetch_timeout")

    def test_aggregator_total_timeout(self):
        mock_core = self._core([("slow", "https://slow.test/m.json", None)])

        async def get_impl(url):
            await asyncio.sleep(0.5)
            return _FakeResponse({"items": []})

        with _patch(mock_core, get_impl), patch.object(
            items_module, "AGGREGATOR_TIMEOUT_SECONDS", 0.05
        ):
            response = client.get("/v1/namespaces/team-a/marketplace-items")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["error"]["code"], "aggregator_timeout")

    def test_parse_error(self):
        mock_core = self._core([("bad", "https://bad.test/m.json", None)])

        async def get_impl(url):
            raise json.JSONDecodeError("bad", "doc", 0)

        with _patch(mock_core, get_impl):
            response = client.get("/v1/namespaces/team-a/marketplace-items")
        self.assertEqual(response.json()[0]["error"]["code"], "parse_error")

    def test_no_permission_returns_403(self):
        mock_core = MagicMock()
        mock_core.read_namespaced_config_map = AsyncMock(
            side_effect=ApiException(status=403, reason="Forbidden")
        )

        async def get_impl(url):
            return _FakeResponse({"items": []})

        with _patch(mock_core, get_impl):
            response = client.get("/v1/namespaces/team-a/marketplace-items")
        self.assertEqual(response.status_code, 403)

    def test_blocked_host_is_not_fetched(self):
        mock_core = self._core([("internal", "https://metadata.internal/m.json", None)])
        fetched = {"called": False}

        async def get_impl(url):
            fetched["called"] = True
            return _FakeResponse({"items": []})

        with _patch(mock_core, get_impl, host_safe=False):
            response = client.get("/v1/namespaces/team-a/marketplace-items")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["error"]["code"], "network_error")
        self.assertFalse(fetched["called"], "blocked host must not be fetched")

    def test_configmap_absent_returns_empty(self):
        mock_core = MagicMock()
        mock_core.read_namespaced_config_map = AsyncMock(side_effect=ApiException(status=404))

        async def get_impl(url):
            return _FakeResponse({"items": []})

        with _patch(mock_core, get_impl):
            response = client.get("/v1/namespaces/team-a/marketplace-items")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])


def _addrinfo(*ips, port=443):
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, port)) for ip in ips]


class TestResolveSafeIp(unittest.IsolatedAsyncioTestCase):
    """Exercises the REAL resolver (not a mock) by faking socket.getaddrinfo."""

    async def _resolve(self, *ips):
        with patch(f"{MODULE}.socket.getaddrinfo", return_value=_addrinfo(*ips)):
            return await items_module._resolve_safe_ip("host.test", 443)

    async def test_metadata_ip_blocked(self):
        self.assertIsNone(await self._resolve("169.254.169.254"))

    async def test_loopback_blocked(self):
        self.assertIsNone(await self._resolve("127.0.0.1"))

    async def test_public_ip_returned(self):
        self.assertEqual(await self._resolve("93.184.216.34"), "93.184.216.34")

    async def test_private_ip_allowed_for_internal_mirrors(self):
        self.assertEqual(await self._resolve("10.0.0.5"), "10.0.0.5")

    async def test_any_unsafe_answer_rejects_whole_host(self):
        # Multi-record rebinding: one safe, one metadata -> reject everything.
        self.assertIsNone(await self._resolve("93.184.216.34", "169.254.169.254"))

    async def test_unresolvable_host(self):
        with patch(f"{MODULE}.socket.getaddrinfo", side_effect=socket.gaierror):
            self.assertIsNone(await items_module._resolve_safe_ip("nope.test", 443))


class TestFetchPinsResolvedIp(unittest.TestCase):
    """Aggregator-level: the request must go to the validated IP, not a re-resolved host."""

    def setUp(self):
        items_module._items_cache.clear()

    def _core(self, sources):
        mock_core = MagicMock()
        mock_core.read_namespaced_config_map = AsyncMock(
            return_value=_sources_configmap(sources)
        )
        return mock_core

    def test_request_targets_validated_ip_with_preserved_host(self):
        mock_core = self._core([("cat", "https://catalog.test/m.json", None)])
        recorded = {}

        class _RecordingClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *exc):
                return False

            async def get(self, url, headers=None, extensions=None):
                recorded["url"] = str(url)
                recorded["headers"] = headers
                recorded["extensions"] = extensions
                return _FakeResponse({"items": []})

        with ExitStack() as stack:
            stack.enter_context(patch(f"{MODULE}.get_impersonating_api_client", _fake_api_client))
            stack.enter_context(patch(f"{MODULE}.client.CoreV1Api", return_value=mock_core))
            stack.enter_context(
                patch(f"{MODULE}.httpx.AsyncClient", lambda *a, **k: _RecordingClient())
            )
            stack.enter_context(
                patch(f"{MODULE}.socket.getaddrinfo", return_value=_addrinfo("93.184.216.34"))
            )
            response = client.get("/v1/namespaces/team-a/marketplace-items")

        self.assertEqual(response.status_code, 200)
        # Connected to the validated IP, not the hostname (no second lookup to rebind).
        self.assertEqual(recorded["url"], "https://93.184.216.34/m.json")
        # Original hostname preserved for Host header + TLS SNI / cert verification.
        self.assertEqual(recorded["headers"]["Host"], "catalog.test")
        self.assertEqual(recorded["extensions"]["sni_hostname"], "catalog.test")

    def test_rebinding_to_metadata_is_blocked_and_not_fetched(self):
        mock_core = self._core([("evil", "https://rebind.test/m.json", None)])
        fetched = {"called": False}

        class _Client:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *exc):
                return False

            async def get(self, url, headers=None, extensions=None):
                fetched["called"] = True
                return _FakeResponse({"items": []})

        with ExitStack() as stack:
            stack.enter_context(patch(f"{MODULE}.get_impersonating_api_client", _fake_api_client))
            stack.enter_context(patch(f"{MODULE}.client.CoreV1Api", return_value=mock_core))
            stack.enter_context(
                patch(f"{MODULE}.httpx.AsyncClient", lambda *a, **k: _Client())
            )
            stack.enter_context(
                patch(f"{MODULE}.socket.getaddrinfo", return_value=_addrinfo("169.254.169.254"))
            )
            response = client.get("/v1/namespaces/team-a/marketplace-items")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["error"]["code"], "network_error")
        self.assertFalse(fetched["called"], "metadata host must not be fetched")


if __name__ == "__main__":
    unittest.main()
