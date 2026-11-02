"""Regression tests: the secrets API must never echo raw Secret annotations."""
import base64
import json
import os
import unittest
from unittest.mock import AsyncMock, Mock, patch

os.environ["AUTH_MODE"] = "open"

from fastapi.testclient import TestClient
from kubernetes_asyncio.client.rest import ApiException
from ark_sdk.secret_scope import SecretScope
from ark_api.api.v1.secrets import router as secrets_router
from ark_api.auth.secret_scope import get_secret_scope

_LEAKED_PASSWORD = "sup3rs3cret"
_LEAKED_TOKEN_B64 = base64.b64encode(b"sk-FAKE-token").decode()

# Simulates what an unfiltered ark-sdk client would hand back for a secret that
# has passed through `kubectl apply` - the whole manifest, values included, is
# copied into an annotation. Used to prove the response model itself refuses
# to let this through even if the client it wraps regresses.
LEAKING_ANNOTATIONS = {
    "kubectl.kubernetes.io/last-applied-configuration": json.dumps({
        "apiVersion": "v1",
        "kind": "Secret",
        "metadata": {"name": "test-secret"},
        "stringData": {"password": _LEAKED_PASSWORD},
        "data": {"token": _LEAKED_TOKEN_B64},
        "type": "Opaque",
    }),
    "meta.helm.sh/release-name": "my-release",
    "ark.mckinsey.com/dashboard-icon": "icons/gemini.png",
}


def _assert_response_has_no_leak(test_case, response):
    test_case.assertEqual(response.status_code, 200)
    body = response.text
    test_case.assertNotIn(_LEAKED_PASSWORD, body)
    test_case.assertNotIn(_LEAKED_TOKEN_B64, body)
    test_case.assertNotIn("kubectl.kubernetes.io/last-applied-configuration", body)
    test_case.assertNotIn("meta.helm.sh/release-name", body)
    data = response.json()
    test_case.assertEqual(data.get("annotations"), {"ark.mckinsey.com/dashboard-icon": "icons/gemini.png"})


class TestSecretsAnnotationLeak(unittest.TestCase):
    """Even a SecretClient that returns unfiltered annotations must not leak them."""

    def setUp(self):
        from ark_api.main import app
        self.client = TestClient(app)

    @patch('ark_api.api.v1.secrets.SecretClient')
    def test_list_secrets_drops_non_ark_annotations(self, mock_client_cls):
        mock_client = mock_client_cls.return_value
        mock_client.list_secrets = AsyncMock(return_value={
            "items": [{
                "name": "test-secret",
                "display_name": "test-secret",
                "scope": "shared",
                "id": "uuid-12345",
                "annotations": LEAKING_ANNOTATIONS,
            }],
            "count": 1,
        })

        response = self.client.get("/v1/secrets")

        self.assertEqual(response.status_code, 200)
        body = response.text
        self.assertNotIn(_LEAKED_PASSWORD, body)
        self.assertNotIn(_LEAKED_TOKEN_B64, body)
        self.assertNotIn("kubectl.kubernetes.io/last-applied-configuration", body)
        self.assertNotIn("meta.helm.sh/release-name", body)
        item = response.json()["items"][0]
        self.assertEqual(item["annotations"], {"ark.mckinsey.com/dashboard-icon": "icons/gemini.png"})

    @patch('ark_api.api.v1.secrets.SecretClient')
    def test_get_secret_drops_non_ark_annotations(self, mock_client_cls):
        mock_client = mock_client_cls.return_value
        mock_client.get_secret = AsyncMock(return_value={
            "name": "test-secret",
            "display_name": "test-secret",
            "scope": "shared",
            "id": "uuid-12345",
            "type": "Opaque",
            "secret_length": 20,
            "keys": ["password"],
            "annotations": LEAKING_ANNOTATIONS,
        })

        response = self.client.get("/v1/secrets/test-secret")

        _assert_response_has_no_leak(self, response)
        self.assertEqual(response.json()["keys"], ["password"])

    @patch('ark_api.api.v1.secrets.SecretClient')
    def test_create_secret_drops_non_ark_annotations(self, mock_client_cls):
        mock_client = mock_client_cls.return_value
        mock_client.create_secret = AsyncMock(return_value={
            "name": "test-secret",
            "display_name": "test-secret",
            "scope": "shared",
            "id": "uuid-12345",
            "type": "Opaque",
            "secret_length": 10,
            "annotations": LEAKING_ANNOTATIONS,
        })

        response = self.client.post(
            "/v1/secrets",
            json={"name": "test-secret", "string_data": {"token": "test-token"}},
        )

        _assert_response_has_no_leak(self, response)

    @patch('ark_api.api.v1.secrets.SecretClient')
    def test_update_secret_drops_non_ark_annotations(self, mock_client_cls):
        mock_client = mock_client_cls.return_value
        mock_client.update_secret = AsyncMock(return_value={
            "name": "test-secret",
            "display_name": "test-secret",
            "scope": "shared",
            "id": "uuid-12345",
            "type": "Opaque",
            "secret_length": 9,
            "annotations": LEAKING_ANNOTATIONS,
        })

        response = self.client.put(
            "/v1/secrets/test-secret",
            json={"string_data": {"token": "new-token"}},
        )

        _assert_response_has_no_leak(self, response)



class TestSecretsScope(unittest.TestCase):
    def setUp(self):
        from ark_api.main import app
        self.client = TestClient(app)

    @patch('ark_api.api.v1.secrets.SecretClient')
    def test_create_rejects_reserved_user_prefix(self, mock_client_cls):
        mock_client = mock_client_cls.return_value
        mock_client.create_secret = AsyncMock()

        response = self.client.post(
            "/v1/secrets",
            json={"name": "u-0123456789abcdef-x", "string_data": {"token": "test-token"}},
        )

        self.assertEqual(response.status_code, 422)
        mock_client.create_secret.assert_not_awaited()

    @patch('ark_api.api.v1.secrets.SecretClient')
    def test_every_route_passes_the_shared_scope(self, mock_client_cls):
        detail = {"name": "s", "id": "uuid", "type": "Opaque", "secret_length": 1, "display_name": "s", "scope": "shared"}
        mock_client = mock_client_cls.return_value
        mock_client.list_secrets = AsyncMock(return_value={"items": [], "count": 0})
        mock_client.create_secret = AsyncMock(return_value=detail)
        mock_client.get_secret = AsyncMock(return_value=detail)
        mock_client.update_secret = AsyncMock(return_value=detail)
        mock_client.delete_secret = AsyncMock(return_value=True)

        requests = [
            lambda: self.client.get("/v1/secrets"),
            lambda: self.client.post("/v1/secrets", json={"name": "s", "string_data": {"token": "t"}}),
            lambda: self.client.get("/v1/secrets/s"),
            lambda: self.client.put("/v1/secrets/s", json={"string_data": {"token": "t"}}),
            lambda: self.client.delete("/v1/secrets/s"),
        ]
        for send in requests:
            mock_client_cls.reset_mock()
            self.assertEqual(send().status_code, 200)
            self.assertEqual(mock_client_cls.call_args.kwargs["scope"], SecretScope())

    def test_every_route_declares_the_scope_dependency(self):
        for route in secrets_router.routes:
            with self.subTest(route=route.path, methods=route.methods):
                self.assertIn(get_secret_scope, [dep.call for dep in route.dependant.dependencies])


@patch('ark_sdk.k8s.ApiClient')
@patch('ark_sdk.k8s.init_k8s', new=AsyncMock())
class TestSecretsOutOfScope(unittest.TestCase):
    def setUp(self):
        from ark_api.main import app
        self.client = TestClient(app)
        v1_patcher = patch('ark_sdk.k8s.client.CoreV1Api')
        self.v1 = v1_patcher.start().return_value
        self.addCleanup(v1_patcher.stop)
        self.v1.replace_namespaced_secret = AsyncMock()
        self.v1.delete_namespaced_secret = AsyncMock()

    def _send_all(self):
        return [
            self.client.get("/v1/secrets/legacy-token?namespace=default"),
            self.client.put("/v1/secrets/legacy-token?namespace=default", json={"string_data": {"token": "t"}}),
            self.client.delete("/v1/secrets/legacy-token?namespace=default"),
        ]

    def test_out_of_scope_secret_looks_like_a_missing_one(self, _):
        self.v1.read_namespaced_secret = AsyncMock(side_effect=ApiException(status=404, reason="Not Found"))
        missing = self._send_all()

        unlabelled = Mock()
        unlabelled.metadata.labels = {"app": "legacy"}
        self.v1.read_namespaced_secret = AsyncMock(return_value=unlabelled)
        out_of_scope = self._send_all()

        for missing_response, out_of_scope_response in zip(missing, out_of_scope):
            self.assertEqual(out_of_scope_response.status_code, 404)
            self.assertEqual(out_of_scope_response.json(), missing_response.json())
        self.assertEqual(
            out_of_scope[0].json(), {"detail": "Secret 'legacy-token' not found in namespace default"}
        )
        self.v1.replace_namespaced_secret.assert_not_called()
        self.v1.delete_namespaced_secret.assert_not_called()


if __name__ == '__main__':
    unittest.main()
