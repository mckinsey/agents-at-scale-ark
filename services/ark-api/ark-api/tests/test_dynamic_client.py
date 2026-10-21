import json
import unittest
from unittest.mock import AsyncMock, Mock, patch

from kubernetes_asyncio.client.rest import ApiException
from kubernetes_asyncio.dynamic import ResourceInstance
from kubernetes_asyncio.dynamic.exceptions import (
    ConflictError,
    ForbiddenError,
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


class TestCreateDynamicClient(unittest.IsolatedAsyncioTestCase):
    async def test_returns_a_discovered_raising_client(self):
        api = Mock()
        discovered = Mock()

        async def construct(_api):
            return discovered

        with patch("ark_api.api.v1.client_utils.RaisingDynamicClient", side_effect=construct) as client_cls:
            result = await create_dynamic_client(api)

        self.assertIs(result, discovered)
        client_cls.assert_called_once_with(api)


if __name__ == "__main__":
    unittest.main()
