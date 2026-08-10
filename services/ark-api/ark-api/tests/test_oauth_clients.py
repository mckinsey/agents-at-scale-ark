"""Tests for ark_api.services.oauth_dcr and oauth_token using httpx.MockTransport."""
from __future__ import annotations

import asyncio
import json
import unittest

import httpx

from ark_api.services.oauth_dcr import DcrError, register_client
from ark_api.services.oauth_token import TokenExchangeError, exchange_code


REDIRECT_URI = "http://127.0.0.1:8080/v1/mcp/auth/callback"
REGISTRATION_ENDPOINT = "https://idp.example.com/register"
TOKEN_ENDPOINT = "https://idp.example.com/token"


def _client_for(handler):
    transport = httpx.MockTransport(handler)
    return httpx.AsyncClient(transport=transport, timeout=5)


class TestRegisterClient(unittest.TestCase):
    def test_happy_path(self):
        def handler(request: httpx.Request) -> httpx.Response:
            body = json.loads(request.content)
            self.assertEqual(body["redirect_uris"], [REDIRECT_URI])
            self.assertEqual(body["token_endpoint_auth_method"], "client_secret_basic")
            self.assertEqual(body["grant_types"], ["authorization_code", "refresh_token"])
            return httpx.Response(
                200,
                json={
                    "client_id": "cid",
                    "client_secret": "csec",
                    "redirect_uris": [REDIRECT_URI],
                    "token_endpoint_auth_method": "client_secret_basic",
                },
            )

        async def run():
            async with _client_for(handler) as c:
                return await register_client(
                    registration_endpoint=REGISTRATION_ENDPOINT,
                    redirect_uri=REDIRECT_URI,
                    timeout_seconds=5,
                    client=c,
                )

        result = asyncio.run(run())
        self.assertEqual(result.client_id, "cid")
        self.assertEqual(result.client_secret, "csec")

    def test_redirect_uri_missing_in_response_is_rejected(self):
        def handler(request):
            return httpx.Response(
                200,
                json={
                    "client_id": "cid",
                    "client_secret": "csec",
                    "redirect_uris": ["https://other/redirect"],
                    "token_endpoint_auth_method": "client_secret_basic",
                },
            )

        async def run():
            async with _client_for(handler) as c:
                await register_client(
                    registration_endpoint=REGISTRATION_ENDPOINT,
                    redirect_uri=REDIRECT_URI,
                    timeout_seconds=5,
                    client=c,
                )

        with self.assertRaises(DcrError):
            asyncio.run(run())

    def test_redirect_uris_omitted_is_rejected(self):
        def handler(request):
            return httpx.Response(
                200,
                json={
                    "client_id": "cid",
                    "client_secret": "csec",
                    "token_endpoint_auth_method": "client_secret_basic",
                },
            )

        async def run():
            async with _client_for(handler) as c:
                await register_client(
                    registration_endpoint=REGISTRATION_ENDPOINT,
                    redirect_uri=REDIRECT_URI,
                    timeout_seconds=5,
                    client=c,
                )

        with self.assertRaises(DcrError):
            asyncio.run(run())

    def test_unsupported_auth_method_is_rejected(self):
        for method in ("client_secret_post", "none", "private_key_jwt"):
            def handler(request, method=method):
                return httpx.Response(
                    200,
                    json={
                        "client_id": "cid",
                        "client_secret": "csec",
                        "redirect_uris": [REDIRECT_URI],
                        "token_endpoint_auth_method": method,
                    },
                )

            async def run():
                async with _client_for(handler) as c:
                    await register_client(
                        registration_endpoint=REGISTRATION_ENDPOINT,
                        redirect_uri=REDIRECT_URI,
                        timeout_seconds=5,
                        client=c,
                    )

            with self.assertRaises(DcrError, msg=f"method {method} should fail"):
                asyncio.run(run())

    def test_idp_error_propagates(self):
        def handler(request):
            return httpx.Response(500, json={"error": "boom"})

        async def run():
            async with _client_for(handler) as c:
                await register_client(
                    registration_endpoint=REGISTRATION_ENDPOINT,
                    redirect_uri=REDIRECT_URI,
                    timeout_seconds=5,
                    client=c,
                )

        with self.assertRaises(DcrError):
            asyncio.run(run())


class TestExchangeCode(unittest.TestCase):
    def test_happy_path(self):
        def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.url, httpx.URL(TOKEN_ENDPOINT))
            self.assertEqual(request.headers["authorization"][:6], "Basic ")
            body = dict(item.split("=", 1) for item in request.content.decode().split("&"))
            self.assertEqual(body["grant_type"], "authorization_code")
            self.assertEqual(body["code"], "the-code")
            self.assertEqual(body["code_verifier"], "the-verifier")
            self.assertEqual(body["resource"], "https%3A%2F%2Fmcp.example%2Fmcp")
            return httpx.Response(
                200,
                json={
                    "access_token": "at",
                    "refresh_token": "rt",
                    "expires_in": 3600,
                },
            )

        async def run():
            async with _client_for(handler) as c:
                return await exchange_code(
                    token_endpoint=TOKEN_ENDPOINT,
                    code="the-code",
                    redirect_uri=REDIRECT_URI,
                    code_verifier="the-verifier",
                    resource="https://mcp.example/mcp",
                    client_id="cid",
                    client_secret="csec",
                    timeout_seconds=5,
                    client=c,
                )

        result = asyncio.run(run())
        self.assertEqual(result.access_token, "at")
        self.assertEqual(result.refresh_token, "rt")
        self.assertEqual(result.expires_in, 3600)

    def test_token_4xx_propagates_with_error_code(self):
        def handler(request):
            return httpx.Response(400, json={"error": "invalid_grant"})

        async def run():
            async with _client_for(handler) as c:
                await exchange_code(
                    token_endpoint=TOKEN_ENDPOINT,
                    code="x",
                    redirect_uri=REDIRECT_URI,
                    code_verifier="v",
                    resource="https://mcp.example/mcp",
                    client_id="cid",
                    client_secret="csec",
                    timeout_seconds=5,
                    client=c,
                )

        with self.assertRaises(TokenExchangeError) as ctx:
            asyncio.run(run())
        self.assertEqual(ctx.exception.error_code, "invalid_grant")

    def test_missing_access_token_is_error(self):
        def handler(request):
            return httpx.Response(200, json={"refresh_token": "rt"})

        async def run():
            async with _client_for(handler) as c:
                await exchange_code(
                    token_endpoint=TOKEN_ENDPOINT,
                    code="x",
                    redirect_uri=REDIRECT_URI,
                    code_verifier="v",
                    resource="https://mcp.example/mcp",
                    client_id="cid",
                    client_secret="csec",
                    timeout_seconds=5,
                    client=c,
                )

        with self.assertRaises(TokenExchangeError):
            asyncio.run(run())

    def test_4xx_non_json_response_uses_http_status_code(self):
        def handler(request):
            return httpx.Response(503, content=b"<html>maintenance</html>")

        async def run():
            async with _client_for(handler) as c:
                await exchange_code(
                    token_endpoint=TOKEN_ENDPOINT,
                    code="x",
                    redirect_uri=REDIRECT_URI,
                    code_verifier="v",
                    resource="https://mcp.example/mcp",
                    client_id="cid",
                    client_secret="csec",
                    timeout_seconds=5,
                    client=c,
                )

        with self.assertRaises(TokenExchangeError) as ctx:
            asyncio.run(run())
        self.assertEqual(ctx.exception.error_code, "http_503")

    def test_2xx_non_json_raises(self):
        def handler(request):
            return httpx.Response(200, content=b"not-json")

        async def run():
            async with _client_for(handler) as c:
                await exchange_code(
                    token_endpoint=TOKEN_ENDPOINT,
                    code="x",
                    redirect_uri=REDIRECT_URI,
                    code_verifier="v",
                    resource="https://mcp.example/mcp",
                    client_id="cid",
                    client_secret="csec",
                    timeout_seconds=5,
                    client=c,
                )

        with self.assertRaises(TokenExchangeError):
            asyncio.run(run())

    def test_missing_expires_in_returns_none(self):
        def handler(request):
            return httpx.Response(200, json={"access_token": "at"})

        async def run():
            async with _client_for(handler) as c:
                return await exchange_code(
                    token_endpoint=TOKEN_ENDPOINT,
                    code="x",
                    redirect_uri=REDIRECT_URI,
                    code_verifier="v",
                    resource="https://mcp.example/mcp",
                    client_id="cid",
                    client_secret="csec",
                    timeout_seconds=5,
                    client=c,
                )

        result = asyncio.run(run())
        self.assertIsNone(result.expires_in)
        self.assertIsNone(result.refresh_token)

    def test_non_integer_expires_in_coerces_to_none(self):
        def handler(request):
            return httpx.Response(200, json={"access_token": "at", "expires_in": "soon"})

        async def run():
            async with _client_for(handler) as c:
                return await exchange_code(
                    token_endpoint=TOKEN_ENDPOINT,
                    code="x",
                    redirect_uri=REDIRECT_URI,
                    code_verifier="v",
                    resource="https://mcp.example/mcp",
                    client_id="cid",
                    client_secret="csec",
                    timeout_seconds=5,
                    client=c,
                )

        result = asyncio.run(run())
        self.assertIsNone(result.expires_in)

    def test_owns_client_path_closes_default_client(self):
        from unittest.mock import patch, AsyncMock, MagicMock

        fake_response = MagicMock()
        fake_response.status_code = 200
        fake_response.json = MagicMock(
            return_value={"access_token": "at", "expires_in": 3600}
        )
        fake_client = MagicMock()
        fake_client.post = AsyncMock(return_value=fake_response)
        fake_client.aclose = AsyncMock()

        with patch(
            "ark_api.services.oauth_token.httpx.AsyncClient", return_value=fake_client
        ):
            result = asyncio.run(
                exchange_code(
                    token_endpoint=TOKEN_ENDPOINT,
                    code="x",
                    redirect_uri=REDIRECT_URI,
                    code_verifier="v",
                    resource="https://mcp.example/mcp",
                    client_id="cid",
                    client_secret="csec",
                    timeout_seconds=5,
                )
            )

        fake_client.aclose.assert_awaited_once()
        self.assertEqual(result.access_token, "at")


class TestRegisterClientExtras(unittest.TestCase):
    def test_redirect_uris_non_list_is_rejected(self):
        def handler(request):
            return httpx.Response(
                200,
                json={
                    "client_id": "cid",
                    "client_secret": "csec",
                    "redirect_uris": "not-a-list",
                    "token_endpoint_auth_method": "client_secret_basic",
                },
            )

        async def run():
            async with _client_for(handler) as c:
                await register_client(
                    registration_endpoint=REGISTRATION_ENDPOINT,
                    redirect_uri=REDIRECT_URI,
                    timeout_seconds=5,
                    client=c,
                )

        with self.assertRaises(DcrError):
            asyncio.run(run())

    def test_2xx_non_json_is_rejected(self):
        def handler(request):
            return httpx.Response(200, content=b"<html>oops</html>")

        async def run():
            async with _client_for(handler) as c:
                await register_client(
                    registration_endpoint=REGISTRATION_ENDPOINT,
                    redirect_uri=REDIRECT_URI,
                    timeout_seconds=5,
                    client=c,
                )

        with self.assertRaises(DcrError) as ctx:
            asyncio.run(run())
        self.assertIn("not JSON", str(ctx.exception))

    def test_missing_client_id_is_rejected(self):
        def handler(request):
            return httpx.Response(
                200,
                json={
                    "client_secret": "csec",
                    "redirect_uris": [REDIRECT_URI],
                    "token_endpoint_auth_method": "client_secret_basic",
                },
            )

        async def run():
            async with _client_for(handler) as c:
                await register_client(
                    registration_endpoint=REGISTRATION_ENDPOINT,
                    redirect_uri=REDIRECT_URI,
                    timeout_seconds=5,
                    client=c,
                )

        with self.assertRaises(DcrError):
            asyncio.run(run())

    def test_owns_client_path_closes_default_client(self):
        from unittest.mock import patch, AsyncMock, MagicMock

        fake_response = MagicMock()
        fake_response.status_code = 200
        fake_response.json = MagicMock(
            return_value={
                "client_id": "cid",
                "client_secret": "csec",
                "redirect_uris": [REDIRECT_URI],
                "token_endpoint_auth_method": "client_secret_basic",
            }
        )
        fake_client = MagicMock()
        fake_client.post = AsyncMock(return_value=fake_response)
        fake_client.aclose = AsyncMock()

        with patch(
            "ark_api.services.oauth_dcr.httpx.AsyncClient", return_value=fake_client
        ):
            result = asyncio.run(
                register_client(
                    registration_endpoint=REGISTRATION_ENDPOINT,
                    redirect_uri=REDIRECT_URI,
                    timeout_seconds=5,
                )
            )

        fake_client.aclose.assert_awaited_once()
        self.assertEqual(result.client_id, "cid")


if __name__ == "__main__":
    unittest.main()
