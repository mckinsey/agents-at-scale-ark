import unittest

from ark_sdk.secret_scope import SecretScope, validate_secret_name

RESOURCE_TYPE = "ark.mckinsey.com/resource-type"
SCOPE = "ark.mckinsey.com/scope"


class TestSecretScope(unittest.TestCase):
    def test_default_label_selector_is_shared_only(self):
        self.assertEqual(
            SecretScope().label_selector(),
            "ark.mckinsey.com/resource-type=secret,ark.mckinsey.com/scope in (shared)",
        )

    def test_label_selector_lists_every_scope(self):
        scope = SecretScope(("shared", "user-0123456789abcdef"))
        self.assertEqual(
            scope.label_selector(),
            "ark.mckinsey.com/resource-type=secret,ark.mckinsey.com/scope in (shared,user-0123456789abcdef)",
        )

    def test_contains(self):
        cases = [
            ({RESOURCE_TYPE: "secret", SCOPE: "shared"}, True),
            ({RESOURCE_TYPE: "secret"}, False),
            ({SCOPE: "shared"}, False),
            ({RESOURCE_TYPE: "secret", SCOPE: "user-x"}, False),
            ({RESOURCE_TYPE: "configuration", SCOPE: "shared"}, False),
            (None, False),
        ]
        for labels, expected in cases:
            with self.subTest(labels=labels):
                self.assertEqual(SecretScope().contains(labels), expected)

    def test_create_labels(self):
        self.assertEqual(SecretScope().create_labels(), {RESOURCE_TYPE: "secret", SCOPE: "shared"})


class TestValidateSecretName(unittest.TestCase):
    def test_accepts_names_outside_the_reserved_prefix(self):
        for name in ("u-short-x", "my-u-0123456789abcdef-x", "u-0123456789ABCDEF-x", "u-0123456789abcdef"):
            with self.subTest(name=name):
                self.assertEqual(validate_secret_name(name), name)

    def test_rejects_reserved_user_prefix(self):
        with self.assertRaises(ValueError):
            validate_secret_name("u-0123456789abcdef-x")
