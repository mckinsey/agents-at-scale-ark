import unittest
from unittest.mock import patch, MagicMock
from ark_sdk.impersonation import ImpersonationConfig
from ark_sdk.client import _build_headers, get_client


class TestImpersonationConfig(unittest.TestCase):

    def test_frozen_dataclass(self):
        config = ImpersonationConfig(username="jane@acme.com", groups=["team-a"])
        with self.assertRaises(AttributeError):
            config.username = "other"

    def test_cache_key(self):
        config = ImpersonationConfig(username="jane@acme.com", groups=["b", "a"])
        self.assertEqual(config.cache_key, ("jane@acme.com", frozenset(["a", "b"])))

    def test_default_groups_empty(self):
        config = ImpersonationConfig(username="jane@acme.com")
        self.assertEqual(config.groups, [])


class TestBuildHeaders(unittest.TestCase):

    def test_none_returns_none(self):
        self.assertIsNone(_build_headers(None))

    def test_username_only(self):
        config = ImpersonationConfig(username="jane@acme.com")
        headers = _build_headers(config)
        self.assertEqual(headers, {"Impersonate-User": "jane@acme.com"})
        self.assertNotIn("Impersonate-Group", headers)

    def test_username_and_groups(self):
        config = ImpersonationConfig(username="jane@acme.com", groups=["team-a", "admins"])
        headers = _build_headers(config)
        self.assertEqual(headers["Impersonate-User"], "jane@acme.com")
        self.assertEqual(headers["Impersonate-Group"], "team-a,admins")


class TestGetClientImpersonation(unittest.TestCase):

    @patch("ark_sdk.client.get_context", return_value={"namespace": "default"})
    @patch("ark_sdk.client.versions")
    def test_impersonation_headers_passed(self, mock_versions, mock_ctx):
        mock_client_class = MagicMock()
        mock_versions.ARKClientV1alpha1 = mock_client_class

        config = ImpersonationConfig(username="jane@acme.com", groups=["team-a"])
        get_client(None, "v1alpha1", impersonation=config)

        mock_client_class.assert_called_once_with(
            "default",
            default_headers={"Impersonate-User": "jane@acme.com", "Impersonate-Group": "team-a"},
        )

    @patch("ark_sdk.client.get_context", return_value={"namespace": "default"})
    @patch("ark_sdk.client.versions")
    def test_no_impersonation_no_headers(self, mock_versions, mock_ctx):
        mock_client_class = MagicMock()
        mock_versions.ARKClientV1alpha1 = mock_client_class

        get_client(None, "v1alpha1")

        mock_client_class.assert_called_once_with("default", default_headers=None)


if __name__ == "__main__":
    unittest.main()
