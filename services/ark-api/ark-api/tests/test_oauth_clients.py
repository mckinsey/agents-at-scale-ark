"""Tests for ark_api.services.oauth_dcr and oauth_token using httpx.MockTransport."""
from __future__ import annotations

import asyncio
import json
import unittest

import httpx

from ark_api.services.oauth_dcr import DcrError, register_client
from ark_api.services.oauth_token import TokenExchangeError, exchange_code


REDIRECT_URI = "http://127.0.0.1:8080/api/v1/mcp/auth/callback"
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


if __name__ == "__main__":
    unittest.main()
