"""Regression tests for the 422 validation exception handler."""
import os
import unittest

os.environ["AUTH_MODE"] = "open"
os.environ["READ_ONLY_MODE"] = "false"

from fastapi.testclient import TestClient

SECRET = "SUPERSECRET-LEAK-TEST-9999"


class TestValidationExceptionHandler(unittest.TestCase):
    def setUp(self):
        from ark_api.main import app

        self.client = TestClient(app, raise_server_exceptions=False)

    def test_field_validator_value_error_returns_422(self):
        """A ValueError-raising field validator must yield 422, not 500."""
        response = self.client.post(
            "/v1/namespaces/default/marketplace-sources",
            json={
                "name": "x",
                "url": "http://example.com/marketplace.json",
                "displayName": "x",
            },
        )

        self.assertEqual(response.status_code, 422)
        detail = response.json()["detail"]
        messages = " ".join(str(item.get("msg", "")) for item in detail)
        self.assertIn("url must be an absolute https URL", messages)

    def _post_invalid(self):
        return self.client.post(
            "/v1/namespaces/default/marketplace-sources",
            json={
                "name": "qa-leak",
                "url": "https://cdn.jsdelivr.net/x.json",
                "auth": {"scheme": "INVALID_SCHEME", "credential": SECRET},
            },
        )

    def test_credential_not_leaked_in_response(self):
        response = self._post_invalid()

        self.assertEqual(response.status_code, 422)
        self.assertNotIn(SECRET, response.text)

        payload = response.json()
        self.assertNotIn("body", payload)

    def test_credential_not_leaked_in_logs(self):
        with self.assertLogs("ark-api", level="ERROR") as captured:
            self._post_invalid()

        for message in captured.output:
            self.assertNotIn(SECRET, message)


if __name__ == "__main__":
    unittest.main()
