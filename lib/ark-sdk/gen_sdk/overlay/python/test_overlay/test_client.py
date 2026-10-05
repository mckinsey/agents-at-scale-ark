"""Tests for ARK client lifecycle - every ApiClient it creates must be released.

The fake-based tests check that close_ark_client visits every resource client.
They cannot check that the sockets actually go away: ApiClient.close() is a no-op
on Ark's paths and urllib3's PoolManager.clear() drops pools without closing them,
so a fake that modelled either faithfully would still pass while the real client
leaked.
TestRealApiClientIsReleased uses real objects and a real keep-alive server for
that part.
"""
import http.server
import threading
import unittest
from unittest.mock import MagicMock, patch

from ark_sdk.client import close_ark_client, with_ark_client
from ark_sdk.k8s import release_api_client


class FakeApiClient:
    def __init__(self):
        self.closed = 0

    def close(self):
        self.closed += 1


class FakeResourceClient:
    """Mirrors ARKResourceClient, which owns the ApiClient."""

    def __init__(self):
        self.api_client = FakeApiClient()


class FakeSecretClient:
    """Mirrors SecretClient, which owns no ApiClient."""


class FakeArkClient:
    """Mirrors _ARKClient: no top-level api_client, one per resource client."""

    def __init__(self, resource_count=3):
        self.namespace = "default"
        self.user_agent = None
        self.resources = [FakeResourceClient() for _ in range(resource_count)]
        for index, resource in enumerate(self.resources):
            setattr(self, f"resource_{index}", resource)
        self.secrets = FakeSecretClient()


class TestCloseArkClient(unittest.TestCase):

    def test_closes_every_resource_client(self):
        ark_client = FakeArkClient(resource_count=9)
        close_ark_client(ark_client)
        self.assertTrue(all(r.api_client.closed == 1 for r in ark_client.resources))

    def test_skips_attributes_without_an_api_client(self):
        ark_client = FakeArkClient(resource_count=1)
        close_ark_client(ark_client)
        self.assertEqual(ark_client.resources[0].api_client.closed, 1)

    def test_one_failing_close_does_not_stop_the_others(self):
        ark_client = FakeArkClient(resource_count=3)
        ark_client.resources[0].api_client.close = MagicMock(side_effect=RuntimeError("boom"))
        close_ark_client(ark_client)
        self.assertEqual(ark_client.resources[1].api_client.closed, 1)
        self.assertEqual(ark_client.resources[2].api_client.closed, 1)


class TestReleaseApiClientIsDefensive(unittest.TestCase):

    def test_none_is_a_no_op(self):
        release_api_client(None)

    def test_an_api_client_without_a_rest_client_is_still_closed(self):
        class Bare:
            closed = False

            def close(self):
                self.closed = True

        bare = Bare()
        release_api_client(bare)
        self.assertTrue(bare.closed)

    def test_a_failing_close_does_not_stop_the_pool_release(self):
        released = []

        class Pool:
            def close(self):
                released.append(True)

        class Pools:
            def __init__(self):
                self._container = {"key": Pool()}
                self.lock = threading.Lock()

        class Api:
            def __init__(self):
                self.rest_client = MagicMock(pool_manager=MagicMock(pools=Pools()))

            def close(self):
                raise RuntimeError("boom")

        release_api_client(Api())
        self.assertEqual(released, [True])


class KeepAliveHandler(http.server.BaseHTTPRequestHandler):
    """HTTP/1.1 so the connection is kept alive and pooled, as the API server does."""

    protocol_version = "HTTP/1.1"

    def do_GET(self):
        body = b"{}"
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


class TestRealApiClientIsReleased(unittest.TestCase):
    """Real ApiClient, real urllib3 pool, real pooled socket."""

    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), KeepAliveHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = "http://127.0.0.1:%d/" % cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def _api_client_with_a_pooled_socket(self):
        from kubernetes import client as k8s_client

        configuration = k8s_client.Configuration()
        configuration.host = self.url.rstrip("/")
        api_client = k8s_client.ApiClient(configuration=configuration)
        api_client.rest_client.pool_manager.request("GET", self.url)
        return api_client

    @staticmethod
    def _pooled_socket(api_client):
        """The live socket urllib3 kept for reuse, or None if there isn't one."""
        pool_manager = api_client.rest_client.pool_manager
        for pool in list(pool_manager.pools._container.values()):
            while True:
                try:
                    connection = pool.pool.get(block=False)
                except Exception:
                    break
                if connection is not None:
                    pool.pool.put(connection, block=False)
                    return getattr(connection, "sock", None)
        return None

    def test_the_server_keeps_the_connection_pooled(self):
        """Guards the premise of the tests below: there is a socket to release."""
        api_client = self._api_client_with_a_pooled_socket()
        self.addCleanup(release_api_client, api_client)

        sock = self._pooled_socket(api_client)

        self.assertIsNotNone(sock, "expected a pooled keep-alive connection")
        self.assertNotEqual(sock.fileno(), -1)

    def test_api_client_close_alone_leaves_the_socket_open(self):
        """The reason release_api_client exists. If this ever fails, the upstream
        client started closing its connections and this can be simplified."""
        api_client = self._api_client_with_a_pooled_socket()
        self.addCleanup(release_api_client, api_client)
        sock = self._pooled_socket(api_client)

        self.assertIsNone(api_client._pool, "sync client should have no ThreadPool")
        api_client.close()

        self.assertNotEqual(sock.fileno(), -1, "close() unexpectedly closed the socket")

    def test_pool_manager_clear_does_not_close_the_pool_itself(self):
        """Why clearing is not enough on its own: urllib3 2.x builds its pool
        container with no dispose_func, so clear() drops the pools without
        closing them and the sockets wait on the garbage collector. Whether that
        is immediate depends on whether anything else still references the pool,
        which is why release_api_client closes each pool explicitly."""
        api_client = self._api_client_with_a_pooled_socket()
        self.addCleanup(release_api_client, api_client)
        pool_manager = api_client.rest_client.pool_manager
        pool = list(pool_manager.pools._container.values())[0]

        pool_manager.clear()

        self.assertEqual(len(pool_manager.pools._container), 0)
        self.assertIsNotNone(pool.pool, "clear() should not have closed the pool")

    def test_release_api_client_closes_the_socket(self):
        api_client = self._api_client_with_a_pooled_socket()
        sock = self._pooled_socket(api_client)

        release_api_client(api_client)

        self.assertEqual(sock.fileno(), -1, "socket should be closed")

    def test_close_ark_client_closes_the_socket(self):
        api_client = self._api_client_with_a_pooled_socket()
        sock = self._pooled_socket(api_client)

        class RealResourceClient:
            def __init__(self, api_client):
                self.api_client = api_client

        class RealArkClient:
            def __init__(self, api_client):
                self.namespace = "default"
                self.resource = RealResourceClient(api_client)

        close_ark_client(RealArkClient(api_client))

        self.assertEqual(sock.fileno(), -1, "socket should be closed")


class TestWithArkClientClosesClient(unittest.IsolatedAsyncioTestCase):

    @patch("ark_sdk.client.get_client")
    async def test_closes_on_exit(self, mock_get_client):
        ark_client = FakeArkClient()
        mock_get_client.return_value = ark_client

        async with with_ark_client("default", "v1alpha1") as yielded:
            self.assertIs(yielded, ark_client)
            self.assertTrue(all(r.api_client.closed == 0 for r in ark_client.resources))

        self.assertTrue(all(r.api_client.closed == 1 for r in ark_client.resources))

    @patch("ark_sdk.client.get_client")
    async def test_closes_when_body_raises(self, mock_get_client):
        ark_client = FakeArkClient()
        mock_get_client.return_value = ark_client

        with self.assertRaises(ValueError):
            async with with_ark_client("default", "v1alpha1"):
                raise ValueError("boom")

        self.assertTrue(all(r.api_client.closed == 1 for r in ark_client.resources))

    @patch("ark_sdk.client.get_client")
    async def test_each_context_closes_its_own_client(self, mock_get_client):
        first, second = FakeArkClient(), FakeArkClient()
        mock_get_client.side_effect = [first, second]

        async with with_ark_client("default", "v1alpha1"):
            pass
        async with with_ark_client("other", "v1alpha1"):
            pass

        self.assertTrue(all(r.api_client.closed == 1 for r in first.resources))
        self.assertTrue(all(r.api_client.closed == 1 for r in second.resources))


class TestPerCallClientsAreReleased(unittest.TestCase):
    """get/list/list_page build a fresh ApiClient per call to avoid stale reads.
    Those are the highest-volume clients in ark-api, and close_ark_client never
    sees them, so each method has to release its own."""

    def test_read_methods_release_their_fresh_client(self):
        import inspect

        from ark_sdk.versions import ARKResourceClient

        for name in ("get", "list", "list_page"):
            with self.subTest(method=name):
                source = inspect.getsource(getattr(ARKResourceClient, name))
                self.assertIn("fresh_api_client = self._configured_api_client()", source)
                self.assertIn("release_api_client(fresh_api_client)", source)
                self.assertNotIn(
                    "fresh_api_client.close()",
                    source,
                    "close() alone leaves the pooled socket open",
                )


class TestRealClientShape(unittest.TestCase):
    """Guards the assumption close_ark_client relies on: the ApiClient lives on the
    resource clients, not on the ARK client itself."""

    def test_resource_client_owns_the_api_client(self):
        from ark_sdk.versions import ARKResourceClient, _ARKClient

        self.assertIn("api_client", ARKResourceClient.__init__.__code__.co_names)
        self.assertNotIn("api_client", _ARKClient.__init__.__code__.co_names)


if __name__ == "__main__":
    unittest.main()
