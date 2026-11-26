import unittest
from unittest.mock import patch, MagicMock
from ark_sdk.impersonation import ImpersonationConfig
from ark_sdk.client import _build_headers, get_client

# Identities whose characters fall outside Latin-1. Each must survive header
# construction and be recoverable as the original UTF-8 identity by the server.
NON_LATIN1_IDENTITIES = [
    chr(0x03A9) + "mega@qa",                                        # Greek omega
    "".join(chr(c) for c in (0x0433, 0x0440, 0x0443, 0x043F, 0x043F, 0x0430)),  # Cyrillic
    chr(0x5C71) + chr(0x7530) + "@qa",                             # CJK
    chr(0x200B) + "user@qa",                                       # zero-width space prefix
    chr(0x00E9) + "lodie@qa",                                      # Latin-1 accented e
]


def _server_sees(header_value: str) -> str:
    """Round-trip a built header value the way the client stack and API server do.

    The client stack serializes header values as Latin-1 onto the wire; the
    Kubernetes API server reads those bytes back as UTF-8.
    """
    return header_value.encode("latin-1").decode("utf-8")


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
        self.assertEqual(headers["Impersonate-Group"], ["team-a", "admins"])

    def test_comma_in_group_stays_one_value(self):
        config = ImpersonationConfig(username="jane@acme.com", groups=["a,system:masters", "cn=devs,ou=groups,dc=corp"])
        headers = _build_headers(config)
        self.assertEqual(headers["Impersonate-Group"], ["a,system:masters", "cn=devs,ou=groups,dc=corp"])

    def test_empty_username_raises(self):
        for username in ["", "   ", "\t"]:
            with self.subTest(username=username), self.assertRaises(ValueError):
                _build_headers(ImpersonationConfig(username=username, groups=["team-a"]))

    def test_non_latin1_username_encodes_without_error(self):
        for username in NON_LATIN1_IDENTITIES:
            with self.subTest(username=username):
                headers = _build_headers(ImpersonationConfig(username=username))
                self.assertEqual(_server_sees(headers["Impersonate-User"]), username)

    def test_non_latin1_groups_encode_without_error(self):
        headers = _build_headers(
            ImpersonationConfig(username="jane@acme.com", groups=NON_LATIN1_IDENTITIES)
        )
        self.assertEqual(
            [_server_sees(group) for group in headers["Impersonate-Group"]],
            NON_LATIN1_IDENTITIES,
        )

    def test_ascii_username_unchanged(self):
        headers = _build_headers(ImpersonationConfig(username="jane@acme.com"))
        self.assertEqual(headers["Impersonate-User"], "jane@acme.com")


class TestApplyImpersonationHeaders(unittest.TestCase):

    def test_sets_headers_for_valid_username(self):
        from ark_sdk.k8s import apply_impersonation_headers

        api = MagicMock()
        apply_impersonation_headers(api, ImpersonationConfig(username="jane@acme.com", groups=["team-a"]))
        api.set_default_header.assert_any_call("Impersonate-User", "jane@acme.com")

    def test_empty_username_raises(self):
        from ark_sdk.k8s import apply_impersonation_headers

        for username in ["", "   ", "\t"]:
            with self.subTest(username=username), self.assertRaises(ValueError):
                apply_impersonation_headers(MagicMock(), ImpersonationConfig(username=username))

    def test_non_latin1_identity_encoded_on_headers(self):
        from ark_sdk.k8s import apply_impersonation_headers

        for username in NON_LATIN1_IDENTITIES:
            with self.subTest(username=username):
                api = MagicMock()
                apply_impersonation_headers(
                    api, ImpersonationConfig(username=username, groups=[username])
                )
                user_value = next(
                    call.args[1]
                    for call in api.set_default_header.call_args_list
                    if call.args[0] == "Impersonate-User"
                )
                group_value = next(
                    call.args[1]
                    for call in api.set_default_header.call_args_list
                    if call.args[0] == "Impersonate-Group"
                )
                self.assertEqual(_server_sees(user_value), username)
                self.assertEqual([_server_sees(g) for g in group_value], [username])


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
            default_headers={"Impersonate-User": "jane@acme.com", "Impersonate-Group": ["team-a"]},
            user_agent=None,
        )

    @patch("ark_sdk.client.get_context", return_value={"namespace": "default"})
    @patch("ark_sdk.client.versions")
    def test_no_impersonation_no_headers(self, mock_versions, mock_ctx):
        mock_client_class = MagicMock()
        mock_versions.ARKClientV1alpha1 = mock_client_class

        get_client(None, "v1alpha1")

        mock_client_class.assert_called_once_with("default", default_headers=None, user_agent=None)


if __name__ == "__main__":
    unittest.main()
