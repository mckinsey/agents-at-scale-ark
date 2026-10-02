import unittest

from ark_api.middleware import CACHE_CONTROL_VALUE, CacheControlMiddleware


class TestCacheControlMiddleware(unittest.IsolatedAsyncioTestCase):
    async def _run(self, scope, start_headers=None):
        sent = []

        async def app(scope, receive, send):
            await send({
                "type": "http.response.start",
                "status": 200,
                "headers": list(start_headers or []),
            })
            await send({"type": "http.response.body", "body": b""})

        async def receive():
            return {"type": "http.request"}

        async def send(message):
            sent.append(message)

        await CacheControlMiddleware(app)(scope, receive, send)
        return sent

    def _headers(self, sent):
        start = next(m for m in sent if m["type"] == "http.response.start")
        return {k.decode().lower(): v.decode() for k, v in start["headers"]}

    async def test_stamps_cache_headers_on_http_response(self):
        sent = await self._run({"type": "http"})
        headers = self._headers(sent)

        self.assertEqual(headers["cache-control"], CACHE_CONTROL_VALUE)
        self.assertEqual(headers["pragma"], "no-cache")
        self.assertEqual(headers["expires"], "0")

    async def test_overrides_existing_cache_control(self):
        sent = await self._run(
            {"type": "http"},
            start_headers=[(b"cache-control", b"public, max-age=3600")],
        )
        headers = self._headers(sent)

        self.assertEqual(headers["cache-control"], CACHE_CONTROL_VALUE)

    async def test_body_is_passed_through_untouched(self):
        sent = await self._run({"type": "http"})

        self.assertEqual(sent[-1]["type"], "http.response.body")

    async def test_non_http_scope_is_untouched(self):
        sent = []

        async def app(scope, receive, send):
            await send({"type": "websocket.accept"})

        async def receive():
            return {"type": "websocket.connect"}

        async def send(message):
            sent.append(message)

        await CacheControlMiddleware(app)({"type": "websocket"}, receive, send)

        self.assertEqual(sent, [{"type": "websocket.accept"}])


if __name__ == "__main__":
    unittest.main()
