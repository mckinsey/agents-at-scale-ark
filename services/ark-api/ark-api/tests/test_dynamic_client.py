import json
import os
import tempfile
import unittest
from unittest.mock import AsyncMock, Mock, patch

from kubernetes_asyncio.client.rest import ApiException
from kubernetes_asyncio.dynamic import ResourceInstance
from kubernetes_asyncio.dynamic.exceptions import (
    ConflictError,
    ForbiddenError,
    InternalServerError,
    NotFoundError,
    UnprocessibleEntityError,
)

from ark_api.api.v1.client_utils import create_dynamic_client
from ark_api.api.v1.dynamic_client import RaisingDynamicClient

WORKFLOW_PATH = "/apis/argoproj.io/v1alpha1/namespaces/default/workflows/wf-1"


class FakeResponse:
    def __init__(self, status: int, payload: dict, reason: str = ""):
        self.status = status
        self.reason = reason
        self.headers = {"Content-Type": "application/json"}
        self._payload = payload
        self.release = Mock()

    async def read(self) -> bytes:
        return json.dumps(self._payload).encode("utf-8")

    async def json(self) -> dict:
        return self._payload


def failure_status(code: int, reason: str, message: str) -> dict:
    return {
        "kind": "Status",
        "apiVersion": "v1",
        "status": "Failure",
        "message": message,
        "reason": reason,
        "code": code,
    }


def make_client(response: FakeResponse) -> tuple[RaisingDynamicClient, Mock]:
    api = Mock()
    api.configuration = Mock()
    api.call_api = AsyncMock(return_value=response)
    api.select_header_accept.return_value = "application/json"
    api.select_header_content_type.return_value = "application/json"
    return RaisingDynamicClient(api), api


class TestRaisingDynamicClientErrors(unittest.IsolatedAsyncioTestCase):
    async def test_not_found_raises_not_found_error_with_the_status_body(self):
        message = 'workflows.argoproj.io "wf-1" not found'
        response = FakeResponse(404, failure_status(404, "NotFound", message), reason="Not Found")
        client, _ = make_client(response)

        with self.assertRaises(NotFoundError) as caught:
            await client.request("get", WORKFLOW_PATH)

        error = caught.exception
        self.assertIsInstance(error, ApiException)
        self.assertEqual(error.status, 404)
        self.assertEqual(error.reason, "Not Found")
        self.assertEqual(json.loads(error.body)["message"], message)
        self.assertEqual(error.headers["Content-Type"], "application/json")
        response.release.assert_called_once()

    async def test_each_error_status_maps_to_its_typed_exception(self):
        cases = [
            (403, "Forbidden", ForbiddenError),
            (409, "AlreadyExists", ConflictError),
            (422, "Invalid", UnprocessibleEntityError),
        ]
        for code, reason, expected in cases:
            with self.subTest(code=code):
                response = FakeResponse(code, failure_status(code, reason, f"refused with {code}"))
                client, _ = make_client(response)

                with self.assertRaises(expected) as caught:
                    await client.request("put", WORKFLOW_PATH, body={})

                self.assertEqual(caught.exception.status, code)
                self.assertEqual(json.loads(caught.exception.body)["message"], f"refused with {code}")
                response.release.assert_called_once()

    async def test_an_error_is_raised_even_when_serialization_is_off(self):
        response = FakeResponse(404, failure_status(404, "NotFound", "gone"))
        client, _ = make_client(response)

        with self.assertRaises(NotFoundError):
            await client.request("get", WORKFLOW_PATH, serialize=False)


class TestRaisingDynamicClientSuccess(unittest.IsolatedAsyncioTestCase):
    async def test_success_returns_a_resource_instance(self):
        workflow = {
            "apiVersion": "argoproj.io/v1alpha1",
            "kind": "Workflow",
            "metadata": {"name": "wf-1", "namespace": "default"},
            "status": {"phase": "Running"},
        }
        response = FakeResponse(200, workflow)
        client, _ = make_client(response)

        result = await client.request("get", WORKFLOW_PATH)

        self.assertIsInstance(result, ResourceInstance)
        self.assertEqual(result.to_dict(), workflow)
        response.release.assert_not_called()

    async def test_serialize_false_returns_the_raw_response(self):
        response = FakeResponse(200, {"kind": "Workflow"})
        client, _ = make_client(response)

        result = await client.request("get", WORKFLOW_PATH, serialize=False)

        self.assertIs(result, response)

    async def test_a_custom_serializer_is_honoured(self):
        version = {"major": "1", "minor": "33"}
        response = FakeResponse(200, version)
        client, _ = make_client(response)

        result = await client.request("get", "/version", serializer=lambda _client, data: data)

        self.assertEqual(result, version)

    async def test_the_request_keeps_the_body_unloaded(self):
        response = FakeResponse(200, {"kind": "Workflow"})
        client, api = make_client(response)

        await client.request("get", WORKFLOW_PATH)

        self.assertIs(api.call_api.await_args.kwargs["_preload_content"], False)


class FakeCluster:
    """Answers discovery and API paths like a cluster with one broken API group."""

    def __init__(self, broken_group_status: int):
        self.routes = {
            "/version": FakeResponse(200, {"major": "1", "minor": "33", "gitVersion": "v1.33.0"}),
            "/apis": FakeResponse(200, {
                "kind": "APIGroupList",
                "groups": [{
                    "name": "broken.io",
                    "versions": [{"groupVersion": "broken.io/v1", "version": "v1"}],
                    "preferredVersion": {"groupVersion": "broken.io/v1", "version": "v1"},
                }],
            }),
            "/api/v1": FakeResponse(200, {
                "kind": "APIResourceList",
                "groupVersion": "v1",
                "resources": [{"name": "services", "singularName": "service", "namespaced": True,
                               "kind": "Service", "verbs": ["get", "list"]}],
            }),
            "/apis/broken.io/v1": FakeResponse(
                broken_group_status, failure_status(broken_group_status, "Broken", "discovery failed")
            ),
        }
        self.api = Mock()
        self.api.configuration = Mock(host="https://fake-cluster.invalid")
        self.api.select_header_accept.return_value = "application/json"
        self.api.select_header_content_type.return_value = "application/json"
        self.api.call_api = AsyncMock(side_effect=self._route)

    async def _route(self, path, *_args, **_kwargs):
        response = self.routes[path]
        return FakeResponse(response.status, response._payload)


class TestDiscoveryWithRaisingClient(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.cache_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.cache_dir.cleanup)

    async def _client(self, broken_group_status: int) -> RaisingDynamicClient:
        cluster = FakeCluster(broken_group_status)
        cache_file = os.path.join(self.cache_dir.name, f"discovery-{broken_group_status}.json")
        return await RaisingDynamicClient(cluster.api, cache_file=cache_file)

    async def test_a_core_kind_resolves_under_the_api_prefix_despite_a_broken_group(self):
        for status in (403, 404, 500):
            with self.subTest(status=status):
                client = await self._client(status)

                resource = await client.resources.get(prefix="api", api_version="v1", kind="Service")

                self.assertEqual(resource.kind, "Service")

    async def test_searching_every_prefix_hits_the_broken_group(self):
        client = await self._client(500)

        with self.assertRaises(InternalServerError):
            await client.resources.get(api_version="v1", kind="Service")

    async def test_an_unavailable_group_is_still_skipped(self):
        client = await self._client(503)

        resource = await client.resources.get(api_version="v1", kind="Service")

        self.assertEqual(resource.kind, "Service")


class TestCreateDynamicClient(unittest.IsolatedAsyncioTestCase):
    async def test_returns_a_raising_client_with_discovery_loaded(self):
        discoverer = Mock()

        async def discover(_client, _cache_file):
            return discoverer

        with patch("kubernetes_asyncio.dynamic.client.LazyDiscoverer", side_effect=discover):
            client = await create_dynamic_client(Mock())

        self.assertIsInstance(client, RaisingDynamicClient)
        self.assertIs(client.resources, discoverer)


if __name__ == "__main__":
    unittest.main()
