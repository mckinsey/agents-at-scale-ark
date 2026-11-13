import unittest

import pytest
from fastapi import HTTPException
from kubernetes.client.exceptions import ApiException as SyncApiException

from ark_api.api.v1.exceptions import handle_k8s_errors


def _make_404():
    exc = SyncApiException(status=404, reason="Not Found")
    exc.status = 404
    exc.reason = "Not Found"
    exc.body = None
    return exc


class TestHandleK8sErrorsNotFound(unittest.IsolatedAsyncioTestCase):

    async def test_list_in_namespace_reports_api_error(self):
        @handle_k8s_errors(operation="list", resource_type="secret")
        async def handler(namespace="default"):
            raise _make_404()

        with pytest.raises(HTTPException) as exc_info:
            await handler(namespace="missing")

        self.assertEqual(exc_info.value.status_code, 404)
        self.assertEqual(exc_info.value.detail, "Kubernetes API error: Not Found")

    async def test_get_reports_resource_not_found(self):
        @handle_k8s_errors(operation="get", resource_type="secret")
        async def handler(namespace="default", secret_name="x"):
            raise _make_404()

        with pytest.raises(HTTPException) as exc_info:
            await handler(namespace="team-a", secret_name="x")

        self.assertEqual(exc_info.value.status_code, 404)
        self.assertEqual(exc_info.value.detail, "Secret 'x' not found in namespace team-a")


if __name__ == "__main__":
    unittest.main()
