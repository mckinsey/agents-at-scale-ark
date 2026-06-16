import unittest

from ark_api.auth.middleware import _extract_claim, _extract_user_identity
from ark_api.auth.impersonation_config import ImpersonationSettings
from ark_api.models.auth import UserIdentity


class TestExtractClaim(unittest.TestCase):

    def test_simple_claim(self):
        payload = {"email": "jane@acme.com", "sub": "123"}
        self.assertEqual(_extract_claim(payload, "email"), "jane@acme.com")

    def test_nested_claim(self):
        payload = {"realm_access": {"roles": ["admin", "user"]}}
        self.assertEqual(_extract_claim(payload, "realm_access.roles"), ["admin", "user"])

    def test_missing_claim(self):
        self.assertIsNone(_extract_claim({}, "email"))

    def test_missing_nested_claim(self):
        payload = {"realm_access": {}}
        self.assertIsNone(_extract_claim(payload, "realm_access.roles"))

    def test_non_dict_intermediate(self):
        payload = {"realm_access": "not_a_dict"}
        self.assertIsNone(_extract_claim(payload, "realm_access.roles"))


class TestExtractUserIdentity(unittest.TestCase):

    def _settings(self, **kwargs):
        defaults = {
            "enabled": True,
            "fallback": False,
            "username_claim": "email",
            "groups_claim": "groups",
            "prefix": "",
        }
        defaults.update(kwargs)
        return ImpersonationSettings(**defaults)

    def test_email_and_groups(self):
        payload = {"email": "jane@acme.com", "groups": ["team-a", "admins"]}
        identity = _extract_user_identity(payload, self._settings())
        self.assertEqual(identity, UserIdentity(username="jane@acme.com", groups=["team-a", "admins"]))

    def test_preferred_username(self):
        payload = {"preferred_username": "jane"}
        identity = _extract_user_identity(payload, self._settings(username_claim="preferred_username"))
        self.assertEqual(identity.username, "jane")

    def test_nested_groups(self):
        payload = {"email": "jane@acme.com", "realm_access": {"roles": ["admin", "user"]}}
        identity = _extract_user_identity(payload, self._settings(groups_claim="realm_access.roles"))
        self.assertEqual(identity.groups, ["admin", "user"])

    def test_missing_username_returns_none(self):
        identity = _extract_user_identity({}, self._settings())
        self.assertIsNone(identity)

    def test_missing_groups_returns_empty_list(self):
        payload = {"email": "jane@acme.com"}
        identity = _extract_user_identity(payload, self._settings())
        self.assertEqual(identity.groups, [])

    def test_prefix_applied(self):
        payload = {"email": "jane@acme.com", "groups": ["team-a"]}
        identity = _extract_user_identity(payload, self._settings(prefix="oidc:"))
        self.assertEqual(identity.username, "oidc:jane@acme.com")
        self.assertEqual(identity.groups, ["oidc:team-a"])

    def test_string_group_becomes_list(self):
        payload = {"email": "jane@acme.com", "groups": "single-group"}
        identity = _extract_user_identity(payload, self._settings())
        self.assertEqual(identity.groups, ["single-group"])


class TestImpersonationSettings(unittest.TestCase):

    def test_defaults(self):
        import os
        from unittest.mock import patch

        env = {}
        with patch.dict(os.environ, env, clear=True):
            settings = ImpersonationSettings.from_env()
        self.assertFalse(settings.enabled)
        self.assertFalse(settings.fallback)
        self.assertEqual(settings.username_claim, "email")
        self.assertEqual(settings.groups_claim, "groups")
        self.assertEqual(settings.prefix, "")

    def test_enabled_from_env(self):
        import os
        from unittest.mock import patch

        env = {"IMPERSONATION_ENABLED": "true", "IMPERSONATION_PREFIX": "oidc:"}
        with patch.dict(os.environ, env, clear=True):
            settings = ImpersonationSettings.from_env()
        self.assertTrue(settings.enabled)
        self.assertEqual(settings.prefix, "oidc:")


class TestImpersonationHeaderRejection(unittest.TestCase):

    def test_has_impersonate_user_header(self):
        from unittest.mock import MagicMock
        from ark_api.auth.middleware import AuthMiddleware

        middleware = MagicMock(spec=AuthMiddleware)
        middleware._has_impersonation_headers = AuthMiddleware._has_impersonation_headers.__get__(middleware)

        request = MagicMock()
        request.headers = {"impersonate-user": "admin@acme.com", "authorization": "Bearer xyz"}
        self.assertTrue(middleware._has_impersonation_headers(request))

    def test_no_impersonate_headers(self):
        from unittest.mock import MagicMock
        from ark_api.auth.middleware import AuthMiddleware

        middleware = MagicMock(spec=AuthMiddleware)
        middleware._has_impersonation_headers = AuthMiddleware._has_impersonation_headers.__get__(middleware)

        request = MagicMock()
        request.headers = {"authorization": "Bearer xyz", "content-type": "application/json"}
        self.assertFalse(middleware._has_impersonation_headers(request))


if __name__ == "__main__":
    unittest.main()
