"""Regression test for #2829: ValueError-raising field validators must
return 422, not 500. Uses the real app so the custom handler is exercised.
"""
import os
import unittest

os.environ["AUTH_MODE"] = "open"
os.environ["READ_ONLY_MODE"] = "false"

from fastapi.testclient import TestClient


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


if __name__ == "__main__":
    unittest.main()
