import unittest

from pydantic import ValidationError

from ark_sdk.models.kubernetes import (
    SecretCreateRequest,
    SecretDetailResponse,
    SecretResponse,
    SecretUpdateRequest,
)


class TestSecretRequestModels(unittest.TestCase):
    def test_create_request_rejects_reserved_user_prefix(self):
        with self.assertRaises(ValidationError):
            SecretCreateRequest(name="u-0123456789abcdef-x", string_data={"token": "t"})

    def test_create_request_accepts_regular_name(self):
        self.assertEqual(SecretCreateRequest(name="my-secret", string_data={"token": "t"}).name, "my-secret")

    def test_update_request_has_no_name(self):
        self.assertNotIn("name", SecretUpdateRequest.model_fields)

    def test_create_request_scope_defaults_to_shared(self):
        self.assertEqual(SecretCreateRequest(name="s", string_data={"token": "t"}).scope, "shared")

    def test_create_request_accepts_personal_scope(self):
        self.assertEqual(
            SecretCreateRequest(name="s", string_data={"token": "t"}, scope="personal").scope, "personal"
        )

    def test_create_request_rejects_unknown_scope(self):
        with self.assertRaises(ValidationError):
            SecretCreateRequest(name="s", string_data={"token": "t"}, scope="user-0123456789abcdef")

    def test_create_request_rejects_personal_name_too_long_for_the_prefix(self):
        longest = "a" * (253 - len("u-0123456789abcdef-"))
        SecretCreateRequest(name=longest, string_data={"token": "t"}, scope="personal")
        SecretCreateRequest(name=longest + "a", string_data={"token": "t"})
        with self.assertRaises(ValidationError):
            SecretCreateRequest(name=longest + "a", string_data={"token": "t"}, scope="personal")

    def test_update_request_scope_defaults_to_unchanged(self):
        self.assertIsNone(SecretUpdateRequest().scope)

    def test_update_request_rejects_unknown_scope(self):
        with self.assertRaises(ValidationError):
            SecretUpdateRequest(scope="all")


class TestSecretResponseModels(unittest.TestCase):
    def test_responses_carry_scope_and_display_name(self):
        name = "u-ff8d9819fc0e12bf-github"
        responses = [
            SecretResponse(name=name, id="x", display_name="github", scope="personal"),
            SecretDetailResponse(name=name, id="x", type="Opaque", secret_length=1, display_name="github", scope="personal"),
        ]
        for response in responses:
            with self.subTest(response=type(response).__name__):
                dumped = response.model_dump()
                self.assertEqual(dumped["display_name"], "github")
                self.assertEqual(dumped["scope"], "personal")

    def test_responses_require_scope_and_display_name(self):
        with self.assertRaises(ValidationError):
            SecretResponse(name="a", id="x")
        with self.assertRaises(ValidationError):
            SecretDetailResponse(name="a", id="x", type="Opaque", secret_length=1)

    def test_responses_reject_unknown_scope(self):
        with self.assertRaises(ValidationError):
            SecretResponse(name="a", id="x", display_name="a", scope="everyone")
