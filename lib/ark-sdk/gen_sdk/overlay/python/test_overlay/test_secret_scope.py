import unittest

from ark_sdk.secret_scope import (
    SecretScope,
    SecretScopeError,
    SecretScopeChangeError,
    display_name,
    is_reserved_name,
    scope_kind,
    user_scope,
    validate_secret_name,
)

RESOURCE_TYPE = "ark.mckinsey.com/resource-type"
SCOPE = "ark.mckinsey.com/scope"
ALICE = "alice@example.com"
ALICE_SCOPE = "user-ff8d9819fc0e12bf"
OTHER_SCOPE = "user-0123456789abcdef"


class TestSecretScope(unittest.TestCase):
    def test_default_label_selector_is_shared_only(self):
        self.assertEqual(
            SecretScope().label_selector(),
            "ark.mckinsey.com/resource-type=secret,ark.mckinsey.com/scope in (shared)",
        )

    def test_label_selector_lists_every_scope(self):
        scope = SecretScope(("shared", OTHER_SCOPE))
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
            ({RESOURCE_TYPE: "secret", SCOPE: OTHER_SCOPE}, False),
            ({RESOURCE_TYPE: "configuration", SCOPE: "shared"}, False),
            (None, False),
        ]
        for labels, expected in cases:
            with self.subTest(labels=labels):
                self.assertEqual(SecretScope().contains(labels), expected)

    def test_user_scope_contains_only_its_own_personal_secrets(self):
        scope = SecretScope.for_user(ALICE)
        self.assertTrue(scope.contains({RESOURCE_TYPE: "secret", SCOPE: "shared"}))
        self.assertTrue(scope.contains({RESOURCE_TYPE: "secret", SCOPE: ALICE_SCOPE}))
        self.assertFalse(scope.contains({RESOURCE_TYPE: "secret", SCOPE: OTHER_SCOPE}))

    def test_create_labels(self):
        self.assertEqual(SecretScope().create_labels(), {RESOURCE_TYPE: "secret", SCOPE: "shared"})

    def test_create_personal_labels(self):
        self.assertEqual(
            SecretScope.for_user(ALICE).create_labels(personal=True),
            {RESOURCE_TYPE: "secret", SCOPE: ALICE_SCOPE},
        )

    def test_personal_labels_need_a_user(self):
        with self.assertRaises(SecretScopeError):
            SecretScope().create_labels(personal=True)

    def test_shared_labels_need_the_shared_scope(self):
        with self.assertRaises(SecretScopeError):
            SecretScope((ALICE_SCOPE,)).create_labels()

    def test_personal_name(self):
        self.assertEqual(SecretScope.for_user(ALICE).personal_name("github"), "u-ff8d9819fc0e12bf-github")

    def test_personal_name_needs_a_user(self):
        with self.assertRaises(SecretScopeError):
            SecretScope().personal_name("github")

    def test_personal_scope(self):
        self.assertIsNone(SecretScope().personal_scope())
        self.assertEqual(SecretScope.for_user(ALICE).personal_scope(), ALICE_SCOPE)
        self.assertEqual(SecretScope((ALICE_SCOPE,)).personal_scope(), ALICE_SCOPE)

    def test_owns(self):
        alice = SecretScope.for_user(ALICE)
        self.assertTrue(alice.owns({RESOURCE_TYPE: "secret", SCOPE: ALICE_SCOPE}))
        self.assertFalse(alice.owns({RESOURCE_TYPE: "secret", SCOPE: "shared"}))
        self.assertFalse(alice.owns({RESOURCE_TYPE: "secret", SCOPE: OTHER_SCOPE}))
        self.assertFalse(alice.owns({SCOPE: ALICE_SCOPE}))
        self.assertFalse(SecretScope().owns({RESOURCE_TYPE: "secret", SCOPE: ALICE_SCOPE}))

    def test_personal_only(self):
        self.assertIsNone(SecretScope().personal_only())
        self.assertEqual(SecretScope.for_user(ALICE).personal_only(), SecretScope((ALICE_SCOPE,)))

    def test_includes_shared(self):
        self.assertTrue(SecretScope().includes_shared)
        self.assertTrue(SecretScope.for_user(ALICE).includes_shared)
        self.assertFalse(SecretScope((ALICE_SCOPE,)).includes_shared)

    def test_equality_ignores_order(self):
        self.assertEqual(SecretScope((ALICE_SCOPE, "shared")), SecretScope(("shared", ALICE_SCOPE)))
        self.assertEqual(SecretScope((ALICE_SCOPE, "shared")).scopes, ("shared", ALICE_SCOPE))

    def test_personal_name_fits_a_kubernetes_name(self):
        scope = SecretScope.for_user(ALICE)
        self.assertEqual(len(scope.personal_name("x" * 234)), 253)
        with self.assertRaises(ValueError):
            scope.personal_name("x" * 235)

    def test_change_errors_are_scope_errors(self):
        self.assertTrue(issubclass(SecretScopeChangeError, SecretScopeError))
        self.assertTrue(issubclass(SecretScopeError, ValueError))

    def test_accepts_a_list_and_stores_a_tuple(self):
        scope = SecretScope(["shared", ALICE_SCOPE])
        self.assertEqual(scope.scopes, ("shared", ALICE_SCOPE))
        self.assertEqual(scope, SecretScope(("shared", ALICE_SCOPE)))

    def test_rejects_malformed_scopes(self):
        cases = [
            "shared",
            (),
            ("share",),
            ("user-x",),
            ("user-0123456789ABCDEF",),
            ("shared", "shared"),
            ("shared", ALICE_SCOPE, OTHER_SCOPE),
            ("shared", ""),
            ("shared", "user-0123456789abcdef\n"),
            (" user-0123456789abcdef",),
            ("shared ",),
            (None,),
            (1,),
            (b"shared",),
        ]
        for scopes in cases:
            with self.subTest(scopes=scopes):
                with self.assertRaises(SecretScopeError):
                    SecretScope(scopes)


class TestUserScope(unittest.TestCase):
    def test_is_the_first_sixteen_hex_digits_of_the_sha256(self):
        self.assertEqual(user_scope(ALICE), ALICE_SCOPE)

    def test_hashes_utf8_and_is_case_sensitive(self):
        self.assertEqual(user_scope("José"), "user-24c2ab65b7adab7e")
        self.assertEqual(user_scope("Alice@example.com"), "user-cdbc73c2371c82a2")
        self.assertNotEqual(user_scope("Alice@example.com"), ALICE_SCOPE)

    def test_needs_a_username(self):
        with self.assertRaises(SecretScopeError):
            user_scope("")


class TestNames(unittest.TestCase):
    def test_is_reserved_name(self):
        self.assertTrue(is_reserved_name("u-ff8d9819fc0e12bf-github"))
        for name in ("github", "u-short-x", "u-ff8d9819fc0e12bf", "my-u-ff8d9819fc0e12bf-x"):
            with self.subTest(name=name):
                self.assertFalse(is_reserved_name(name))

    def test_display_name_strips_the_personal_prefix_once(self):
        cases = {
            "u-ff8d9819fc0e12bf-github": "github",
            "u-ff8d9819fc0e12bf-u-0123456789abcdef-x": "u-0123456789abcdef-x",
            "github": "github",
            "u-short-x": "u-short-x",
            "u-0123456789ABCDEF-x": "u-0123456789ABCDEF-x",
        }
        for name, expected in cases.items():
            with self.subTest(name=name):
                self.assertEqual(display_name(name), expected)


class TestScopeKind(unittest.TestCase):
    def test_scope_kind(self):
        cases = [
            ({RESOURCE_TYPE: "secret", SCOPE: "shared"}, "shared"),
            ({RESOURCE_TYPE: "secret", SCOPE: ALICE_SCOPE}, "personal"),
            ({RESOURCE_TYPE: "secret", SCOPE: "user-x"}, None),
            ({RESOURCE_TYPE: "secret", SCOPE: "user-0123456789abcdef\n"}, None),
            ({RESOURCE_TYPE: "secret"}, None),
            ({SCOPE: "shared"}, None),
            ({RESOURCE_TYPE: "configuration", SCOPE: "shared"}, None),
            (None, None),
        ]
        for labels, expected in cases:
            with self.subTest(labels=labels):
                self.assertEqual(scope_kind(labels), expected)


class TestValidateSecretName(unittest.TestCase):
    def test_accepts_names_outside_the_reserved_prefix(self):
        for name in ("u-short-x", "my-u-0123456789abcdef-x", "u-0123456789ABCDEF-x", "u-0123456789abcdef"):
            with self.subTest(name=name):
                self.assertEqual(validate_secret_name(name), name)

    def test_rejects_reserved_user_prefix(self):
        with self.assertRaises(ValueError):
            validate_secret_name("u-0123456789abcdef-x")
