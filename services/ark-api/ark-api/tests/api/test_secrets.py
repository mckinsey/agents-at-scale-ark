"""Regression tests: the secrets API must never echo raw Secret annotations."""
import base64
import json
import os
import unittest
from unittest.mock import AsyncMock, patch

os.environ["AUTH_MODE"] = "open"

from fastapi.testclient import TestClient

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


if __name__ == '__main__':
    unittest.main()
