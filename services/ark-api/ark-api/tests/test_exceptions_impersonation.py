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

    async def test_fallback_can_be_refused_per_handler(self):
        calls = []

        @handle_k8s_errors(operation="create", resource_type="workflow", impersonation_fallback=False)
        async def handler(namespace="default", impersonation=None):
            calls.append(impersonation)
            raise _make_api_exception(403)

        config = ImpersonationConfig(username="bob@acme.com", groups=["viewers"])
        with patch.dict("os.environ", {"IMPERSONATION_FALLBACK": "true"}):
            response = await handler(namespace="default", impersonation=config)

        body = json.loads(response.body)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(body["error"], "impersonation_forbidden")
        self.assertEqual(calls, [config])
        self.assertNotIn("X-Ark-Impersonation-Fallback", response.headers)

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


ADMISSION_DENIAL_BODY = json.dumps({
    "kind": "Status",
    "status": "Failure",
    "reason": "Forbidden",
    "code": 403,
    "message": 'admission webhook "vteam-v1.kb.io" denied the request: '
               "maxTurns can only be set when loops is enabled",
})


class TestHandleK8sErrorsAdmissionDenial(unittest.IsolatedAsyncioTestCase):

    async def test_admission_denial_with_impersonation_keeps_webhook_message(self):
        @handle_k8s_errors(operation="update", resource_type="team")
        async def handler(namespace="default", team_name="t", impersonation=None):
            raise _make_api_exception(403, body=ADMISSION_DENIAL_BODY)

        config = ImpersonationConfig(username="bob@acme.com", groups=["editors"])
        with (
            patch.dict("os.environ", {"IMPERSONATION_FALLBACK": "false"}),
            pytest.raises(HTTPException) as exc_info,
        ):
            await handler(namespace="default", team_name="t", impersonation=config)

        self.assertEqual(exc_info.value.status_code, 403)
        self.assertEqual(
            exc_info.value.detail,
            'admission webhook "vteam-v1.kb.io" denied the request: '
            "maxTurns can only be set when loops is enabled",
        )

    async def test_admission_denial_does_not_trigger_fallback_retry(self):
        call_count = 0

        @handle_k8s_errors(operation="update", resource_type="team")
        async def handler(namespace="default", team_name="t", impersonation=None):
            nonlocal call_count
            call_count += 1
            raise _make_api_exception(403, body=ADMISSION_DENIAL_BODY)

        config = ImpersonationConfig(username="bob@acme.com", groups=["editors"])
        with (
            patch.dict("os.environ", {"IMPERSONATION_FALLBACK": "true"}),
            pytest.raises(HTTPException) as exc_info,
        ):
            await handler(namespace="default", team_name="t", impersonation=config)

        self.assertEqual(call_count, 1)
        self.assertIn("maxTurns can only be set", exc_info.value.detail)

    async def test_rbac_forbidden_with_impersonation_still_returns_structured_403(self):
        rbac_body = json.dumps({
            "kind": "Status",
            "status": "Failure",
            "reason": "Forbidden",
            "code": 403,
            "message": 'teams.ark.mckinsey.com "t" is forbidden: User "bob@acme.com" '
                       'cannot update resource "teams"',
        })

        @handle_k8s_errors(operation="update", resource_type="team")
        async def handler(namespace="default", team_name="t", impersonation=None):
            raise _make_api_exception(403, body=rbac_body)

        config = ImpersonationConfig(username="bob@acme.com", groups=["viewers"])
        with patch.dict("os.environ", {"IMPERSONATION_FALLBACK": "false"}):
            response = await handler(namespace="default", team_name="t", impersonation=config)

        self.assertEqual(response.status_code, 403)
        self.assertEqual(json.loads(response.body)["error"], "impersonation_forbidden")


if __name__ == "__main__":
    unittest.main()
