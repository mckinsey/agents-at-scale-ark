"""Tests for ark_api.core.mcp_auth_config."""
from __future__ import annotations

import socket
import unittest
from pathlib import Path
from unittest.mock import patch

import yaml

from ark_api.core.mcp_auth_config import (
    CALLBACK_PATH,
    McpAuthConfigError,
    _has_embedded_loopback_ip,
    _is_loopback_host,
    _is_loopback_literal,
    _read_int,
    _validate_callback_url,
    is_strict_idp_acceptable,
    load_mcp_auth_config,
)

_WARN_LOGGER = "ark_api.core.mcp_auth_config"


class TestValidateCallbackUrl(unittest.TestCase):
    def test_https_public_host_is_accepted(self):
        result = _validate_callback_url("https://ark.example.com/v1/mcp/auth/callback")
        self.assertEqual(result, "https://ark.example.com/v1/mcp/auth/callback")

    def test_http_loopback_v4_is_accepted(self):
        result = _validate_callback_url("http://127.0.0.1:8080/v1/mcp/auth/callback")
        self.assertEqual(result, "http://127.0.0.1:8080/v1/mcp/auth/callback")

    def test_http_loopback_v6_is_accepted_bracketed(self):
        result = _validate_callback_url("http://[::1]:8080/v1/mcp/auth/callback")
        self.assertEqual(result, "http://[::1]:8080/v1/mcp/auth/callback")

    def test_http_localhost_is_accepted(self):
        result = _validate_callback_url("http://localhost:8080/v1/mcp/auth/callback")
        self.assertEqual(result, "http://localhost:8080/v1/mcp/auth/callback")

    def test_http_public_host_is_rejected(self):
        with self.assertRaises(McpAuthConfigError):
            _validate_callback_url("http://ark.example.com/v1/mcp/auth/callback")

    def test_unbracketed_ipv6_is_rejected(self):
        with self.assertRaises(McpAuthConfigError) as ctx:
            _validate_callback_url("http://::1:8080/v1/mcp/auth/callback")
        self.assertIn("RFC 3986", str(ctx.exception))

    def test_callback_path_is_appended_when_root(self):
        result = _validate_callback_url("https://ark.example.com")
        self.assertTrue(result.endswith(CALLBACK_PATH))

    def test_bad_scheme_is_rejected(self):
        with self.assertRaises(McpAuthConfigError):
            _validate_callback_url("ftp://ark.example.com/v1/mcp/auth/callback")

    def test_empty_string_is_rejected(self):
        with self.assertRaises(McpAuthConfigError) as ctx:
            _validate_callback_url("")
        self.assertIn("not set", str(ctx.exception))

    def test_missing_netloc_is_rejected(self):
        with self.assertRaises(McpAuthConfigError) as ctx:
            _validate_callback_url("https:///v1/mcp/auth/callback")
        self.assertIn("missing host", str(ctx.exception))

    def test_empty_hostname_with_port_is_rejected(self):
        with self.assertRaises(McpAuthConfigError) as ctx:
            _validate_callback_url("https://:8080/v1/mcp/auth/callback")
        self.assertIn("missing host", str(ctx.exception))

    def test_http_dns_resolved_loopback_is_accepted(self):
        result = _validate_callback_url(
            "http://ark-api.default.127.0.0.1.nip.io:8080/v1/mcp/auth/callback"
        )
        self.assertIn("nip.io", result)

    def test_extra_path_segments_are_preserved_and_callback_appended(self):
        result = _validate_callback_url("https://ark.example.com/proxy")
        self.assertTrue(result.endswith(CALLBACK_PATH))
        self.assertIn("/proxy", result)


class TestStrictIdpWarning(unittest.TestCase):
    def test_nip_io_loopback_is_accepted_but_warns(self):
        with self.assertLogs(_WARN_LOGGER, level="WARNING") as ctx:
            result = _validate_callback_url(
                "http://ark-api.default.127.0.0.1.nip.io:8080/v1/mcp/auth/callback"
            )
        self.assertIn("nip.io", result)
        self.assertTrue(any("loopback literal" in msg for msg in ctx.output))

    def test_loopback_literal_does_not_warn(self):
        for url in (
            "http://127.0.0.1:34780/v1/mcp/auth/callback",
            "http://[::1]:34780/v1/mcp/auth/callback",
            "http://localhost:34780/v1/mcp/auth/callback",
        ):
            with self.assertNoLogs(_WARN_LOGGER, level="WARNING"):
                _validate_callback_url(url)

    def test_https_public_host_does_not_warn(self):
        with self.assertNoLogs(_WARN_LOGGER, level="WARNING"):
            _validate_callback_url("https://ark.example.com/v1/mcp/auth/callback")


class TestIsLoopbackLiteral(unittest.TestCase):
    def test_literal_hosts_are_literals(self):
        for host in ("127.0.0.1", "::1", "[::1]", "localhost"):
            self.assertTrue(_is_loopback_literal(host), host)

    def test_resolved_loopback_name_is_not_a_literal(self):
        self.assertFalse(_is_loopback_literal("ark-api.default.127.0.0.1.nip.io"))

    def test_public_host_is_not_a_literal(self):
        self.assertFalse(_is_loopback_literal("ark.example.com"))


class TestIsStrictIdpAcceptable(unittest.TestCase):
    def test_https_is_acceptable(self):
        self.assertTrue(is_strict_idp_acceptable("https://ark.example.com/v1/mcp/auth/callback"))

    def test_http_loopback_literal_is_acceptable(self):
        self.assertTrue(is_strict_idp_acceptable("http://127.0.0.1:34780/v1/mcp/auth/callback"))
        self.assertTrue(is_strict_idp_acceptable("http://[::1]:34780/v1/mcp/auth/callback"))
        self.assertTrue(is_strict_idp_acceptable("http://localhost:34780/v1/mcp/auth/callback"))

    def test_http_nip_io_is_not_acceptable(self):
        self.assertFalse(
            is_strict_idp_acceptable(
                "http://ark-api.default.127.0.0.1.nip.io:8080/v1/mcp/auth/callback"
            )
        )


class TestChartDefaultIsStrictIdpAcceptable(unittest.TestCase):
    def test_chart_default_callback_is_accepted_by_strict_idps(self):
        values_path = Path(__file__).parents[2] / "chart" / "values.yaml"
        values = yaml.safe_load(values_path.read_text())
        env = values["app"]["env"]
        match = next(
            (e for e in env if e.get("name") == "ARK_API_PUBLIC_CALLBACK_URL"), None
        )
        self.assertIsNotNone(match, "ARK_API_PUBLIC_CALLBACK_URL missing from chart values")
        self.assertTrue(
            is_strict_idp_acceptable(match["value"]),
            f"chart default {match['value']!r} is not accepted by RFC 8252-strict IdPs",
        )


class TestHasEmbeddedLoopbackIp(unittest.TestCase):
    def test_dotted_embedded_loopback_is_detected(self):
        self.assertTrue(_has_embedded_loopback_ip("127.0.0.1.nip.io"))

    def test_dash_embedded_loopback_is_detected(self):
        self.assertTrue(_has_embedded_loopback_ip("ark-api.default.127-0-0-1.nip.io"))

    def test_mixed_dash_and_dot_embedded_loopback_is_detected(self):
        self.assertTrue(_has_embedded_loopback_ip("ark-api.default.127.0.0.1.nip.io"))

    def test_no_embedded_ip_returns_false(self):
        self.assertFalse(_has_embedded_loopback_ip("ark.example.com"))

    def test_embedded_non_loopback_ip_returns_false(self):
        self.assertFalse(_has_embedded_loopback_ip("host.8.8.8.8.nip.io"))

    def test_too_few_labels_returns_false(self):
        self.assertFalse(_has_embedded_loopback_ip("127.0.0"))


class TestIsLoopbackHost(unittest.TestCase):
    def test_literal_loopback_name_is_loopback(self):
        self.assertTrue(_is_loopback_host("localhost"))

    def test_loopback_ipv4_literal_is_loopback(self):
        self.assertTrue(_is_loopback_host("127.0.0.1"))

    def test_loopback_ipv6_literal_is_loopback(self):
        self.assertTrue(_is_loopback_host("::1"))

    def test_dns_resolved_loopback_is_loopback(self):
        with patch(
            "ark_api.core.mcp_auth_config.socket.getaddrinfo",
            return_value=[(0, 0, 0, "", ("127.0.0.1", 0))],
        ):
            self.assertTrue(_is_loopback_host("loopback.example.com"))

    def test_dns_resolved_public_is_not_loopback(self):
        with patch(
            "ark_api.core.mcp_auth_config.socket.getaddrinfo",
            return_value=[(0, 0, 0, "", ("93.184.216.34", 0))],
        ):
            self.assertFalse(_is_loopback_host("public.example.com"))

    def test_unresolvable_host_falls_back_to_embedded_loopback(self):
        with patch(
            "ark_api.core.mcp_auth_config.socket.getaddrinfo",
            side_effect=socket.gaierror,
        ):
            self.assertTrue(_is_loopback_host("ark-api.default.127.0.0.1.nip.io"))

    def test_unresolvable_host_without_embedded_loopback_is_not_loopback(self):
        with patch(
            "ark_api.core.mcp_auth_config.socket.getaddrinfo",
            side_effect=socket.gaierror,
        ):
            self.assertFalse(_is_loopback_host("ark.example.com"))


class TestReadInt(unittest.TestCase):
    def test_unset_returns_default(self):
        import os

        os.environ.pop("ARK_API_TEST_READ_INT", None)
        self.assertEqual(_read_int("ARK_API_TEST_READ_INT", 42), 42)

    def test_empty_string_returns_default(self):
        with patch.dict("os.environ", {"ARK_API_TEST_READ_INT": ""}, clear=False):
            self.assertEqual(_read_int("ARK_API_TEST_READ_INT", 17), 17)

    def test_non_integer_raises(self):
        with patch.dict("os.environ", {"ARK_API_TEST_READ_INT": "abc"}, clear=False):
            with self.assertRaises(McpAuthConfigError) as ctx:
                _read_int("ARK_API_TEST_READ_INT", 1)
        self.assertIn("integer", str(ctx.exception))

    def test_zero_raises(self):
        with patch.dict("os.environ", {"ARK_API_TEST_READ_INT": "0"}, clear=False):
            with self.assertRaises(McpAuthConfigError) as ctx:
                _read_int("ARK_API_TEST_READ_INT", 1)
        self.assertIn("positive", str(ctx.exception))

    def test_negative_raises(self):
        with patch.dict("os.environ", {"ARK_API_TEST_READ_INT": "-5"}, clear=False):
            with self.assertRaises(McpAuthConfigError):
                _read_int("ARK_API_TEST_READ_INT", 1)


class TestLoadConfig(unittest.TestCase):
    def test_unset_callback_url_yields_disabled_config(self):
        with patch.dict("os.environ", {}, clear=False):
            import os
            os.environ.pop("ARK_API_PUBLIC_CALLBACK_URL", None)
            os.environ.pop("ARK_API_MCP_AUTH_CACHE_TTL_SECONDS", None)
            os.environ.pop("ARK_API_MCP_AUTH_DCR_TIMEOUT_SECONDS", None)
            os.environ.pop("ARK_API_MCP_AUTH_TOKEN_TIMEOUT_SECONDS", None)
            cfg = load_mcp_auth_config()
            self.assertFalse(cfg.is_callback_url_set)
            with self.assertRaises(McpAuthConfigError):
                _ = cfg.public_callback_url

    def test_set_callback_url_yields_enabled_config(self):
        env = {
            "ARK_API_PUBLIC_CALLBACK_URL": "https://ark.example.com/v1/mcp/auth/callback",
            "ARK_API_MCP_AUTH_CACHE_TTL_SECONDS": "120",
            "ARK_API_MCP_AUTH_DCR_TIMEOUT_SECONDS": "5",
            "ARK_API_MCP_AUTH_TOKEN_TIMEOUT_SECONDS": "7",
        }
        with patch.dict("os.environ", env, clear=False):
            cfg = load_mcp_auth_config()
            self.assertTrue(cfg.is_callback_url_set)
            self.assertEqual(cfg.public_callback_url, env["ARK_API_PUBLIC_CALLBACK_URL"])
            self.assertEqual(cfg.cache_ttl_seconds, 120)
            self.assertEqual(cfg.dcr_timeout_seconds, 5)
            self.assertEqual(cfg.token_timeout_seconds, 7)


if __name__ == "__main__":
    unittest.main()
