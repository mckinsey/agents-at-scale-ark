import json
import unittest

import pytest
from fastapi import HTTPException
from kubernetes.client.exceptions import ApiException as SyncApiException
from kubernetes_asyncio.client.exceptions import ApiException

from ark_api.api.v1.exceptions import handle_k8s_errors


def _status_body(reason):
    return json.dumps({
        "kind": "Status",
        "apiVersion": "v1",
        "status": "Failure",
        "reason": reason,
        "code": 409,
        "message": f"409 {reason}",
    })


def _make_409(body=None, exception_class=SyncApiException):
    exc = exception_class(status=409, reason="Conflict")
    exc.status = 409
    exc.reason = "Conflict"
    exc.body = body
    return exc


async def _raise_409(body=None, exception_class=SyncApiException):
    @handle_k8s_errors(operation="update", resource_type="secret")
    async def handler(namespace="default", secret_name="x"):
        raise _make_409(body, exception_class)

    with pytest.raises(HTTPException) as exc_info:
        await handler(namespace="team-a", secret_name="x")
    return exc_info.value


class TestHandleK8sErrorsConflict(unittest.IsolatedAsyncioTestCase):

    async def test_already_exists_keeps_current_detail(self):
        error = await _raise_409(_status_body("AlreadyExists"))

        self.assertEqual(error.status_code, 409)
        self.assertEqual(error.detail, "Secret 'x' already exists in namespace team-a")

    async def test_conflict_asks_to_reload_and_retry(self):
        error = await _raise_409(_status_body("Conflict"))

        self.assertEqual(error.status_code, 409)
        self.assertEqual(
            error.detail,
            "Secret 'x' in namespace team-a was modified by another request; reload it and try again",
        )

    async def test_conflict_from_async_client(self):
        error = await _raise_409(_status_body("Conflict"), ApiException)

        self.assertEqual(error.status_code, 409)
        self.assertIn("was modified by another request", error.detail)

    async def test_missing_body_falls_back_to_current_detail(self):
        error = await _raise_409(None)

        self.assertEqual(error.status_code, 409)
        self.assertEqual(error.detail, "Secret 'x' already exists in namespace team-a")

    async def test_non_json_body_falls_back_to_current_detail(self):
        error = await _raise_409("not json")

        self.assertEqual(error.status_code, 409)
        self.assertEqual(error.detail, "Secret 'x' already exists in namespace team-a")

    async def test_conflict_without_namespace(self):
        @handle_k8s_errors(operation="update", resource_type="secret")
        async def handler(secret_name="x"):
            raise _make_409(_status_body("Conflict"))

        with pytest.raises(HTTPException) as exc_info:
            await handler(secret_name="x")

        self.assertEqual(
            exc_info.value.detail,
            "Secret 'x' was modified by another request; reload it and try again",
        )
