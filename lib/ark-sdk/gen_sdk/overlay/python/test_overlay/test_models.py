import unittest

from pydantic import ValidationError

from ark_sdk.models.kubernetes import SecretCreateRequest, SecretUpdateRequest


class TestSecretRequestModels(unittest.TestCase):
    def test_create_request_rejects_reserved_user_prefix(self):
        with self.assertRaises(ValidationError):
            SecretCreateRequest(name="u-0123456789abcdef-x", string_data={"token": "t"})

    def test_create_request_accepts_regular_name(self):
        self.assertEqual(SecretCreateRequest(name="my-secret", string_data={"token": "t"}).name, "my-secret")

    def test_update_request_has_no_name(self):
        self.assertNotIn("name", SecretUpdateRequest.model_fields)
