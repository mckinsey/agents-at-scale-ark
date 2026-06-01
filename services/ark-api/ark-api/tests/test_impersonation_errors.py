import unittest
from unittest.mock import MagicMock

from ark_sdk.impersonation import ImpersonationConfig
from ark_api.auth.impersonation_errors import build_impersonation_forbidden_response


class TestBuildImpersonationForbiddenResponse(unittest.TestCase):

    def _make_exception(self, status=403, body=None):
        exc = MagicMock()
        exc.status = status
        exc.body = body
        exc.reason = "Forbidden"
        return exc

    def test_returns_none_when_no_impersonation(self):
        exc = self._make_exception()
        result = build_impersonation_forbidden_response(exc, None)
        self.assertIsNone(result)

    def test_returns_none_when_not_403(self):
        exc = self._make_exception(status=500)
        config = ImpersonationConfig(username="jane@acme.com", groups=["team-a"])
        result = build_impersonation_forbidden_response(exc, config)
        self.assertIsNone(result)

    def test_structured_403_response(self):
        exc = self._make_exception()
        config = ImpersonationConfig(username="bob@acme.com", groups=["ark-viewers"])
        result = build_impersonation_forbidden_response(
            exc, config, resource_type="agents", operation="list", namespace="default"
        )
        self.assertIsNotNone(result)
        self.assertEqual(result.status_code, 403)

        import json
        body = json.loads(result.body)
        self.assertEqual(body["error"], "impersonation_forbidden")
        self.assertEqual(body["user"], "bob@acme.com")
        self.assertEqual(body["resource"], "agents")
        self.assertEqual(body["namespace"], "default")
        self.assertEqual(body["action"], "list")
        self.assertIn("bob@acme.com", body["detail"])

    def test_delete_action(self):
        exc = self._make_exception()
        config = ImpersonationConfig(username="jane@acme.com", groups=[])
        result = build_impersonation_forbidden_response(
            exc, config, resource_type="models", operation="delete", namespace="prod"
        )
        import json
        body = json.loads(result.body)
        self.assertEqual(body["action"], "delete")
        self.assertEqual(body["resource"], "models")


if __name__ == "__main__":
    unittest.main()
