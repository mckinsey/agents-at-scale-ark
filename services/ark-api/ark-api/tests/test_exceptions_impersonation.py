import json
import unittest
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from kubernetes.client.exceptions import ApiException as SyncApiException

from ark_sdk.impersonation import ImpersonationConfig
from ark_api.api.v1.exceptions import handle_k8s_errors


def _make_api_exception(status=403, reason="Forbidden", body=None):
    exc = SyncApiException(status=status, reason=reason)
    exc.status = status
    exc.reason = reason
    exc.body = body
    return exc


class TestHandleK8sErrorsFallback(unittest.IsolatedAsyncioTestCase):

    async def test_fallback_retries_without_impersonation(self):
        call_count = 0
        impersonation_values = []

        @handle_k8s_errors(operation="list", resource_type="agent")
        async def handler(namespace="default", impersonation=None):
            nonlocal call_count
            call_count += 1
            impersonation_values.append(impersonation)
            if impersonation is not None:
                raise _make_api_exception(403)
            return MagicMock(headers={})

        config = ImpersonationConfig(username="bob@acme.com", groups=["viewers"])
        with patch.dict("os.environ", {"IMPERSONATION_FALLBACK": "true"}):
            response = await handler(namespace="default", impersonation=config)

        self.assertEqual(call_count, 2)
        self.assertIsNotNone(impersonation_values[0])
        self.assertIsNone(impersonation_values[1])
        self.assertEqual(response.headers["X-Ark-Impersonation-Fallback"], "true")

    async def test_fallback_disabled_returns_structured_403(self):
        @handle_k8s_errors(operation="list", resource_type="agent")
        async def handler(namespace="default", impersonation=None):
            raise _make_api_exception(403)

        config = ImpersonationConfig(username="bob@acme.com", groups=["viewers"])
        with patch.dict("os.environ", {"IMPERSONATION_FALLBACK": "false"}):
            response = await handler(namespace="default", impersonation=config)

        body = json.loads(response.body)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(body["error"], "impersonation_forbidden")
        self.assertEqual(body["user"], "bob@acme.com")
        self.assertEqual(body["action"], "list")
        self.assertEqual(body["resource"], "agent")

    async def test_403_without_impersonation_raises_http_exception(self):
        @handle_k8s_errors(operation="list", resource_type="agent")
        async def handler(namespace="default", impersonation=None):
            raise _make_api_exception(403)

        with pytest.raises(HTTPException) as exc_info:
            await handler(namespace="default")

        self.assertEqual(exc_info.value.status_code, 403)

    async def test_fallback_header_set_on_response(self):
        @handle_k8s_errors(operation="delete", resource_type="model")
        async def handler(namespace="prod", impersonation=None):
            if impersonation is not None:
                raise _make_api_exception(403)
            return MagicMock(headers={})

        config = ImpersonationConfig(username="jane@acme.com", groups=[])
        with patch.dict("os.environ", {"IMPERSONATION_FALLBACK": "true"}):
            response = await handler(namespace="prod", impersonation=config)

        self.assertEqual(response.headers["X-Ark-Impersonation-Fallback"], "true")


if __name__ == "__main__":
    unittest.main()
