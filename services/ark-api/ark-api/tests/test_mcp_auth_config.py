"""Tests for ark_api.core.mcp_auth_config."""
from __future__ import annotations

import unittest
from unittest.mock import patch

from ark_api.core.mcp_auth_config import (
    CALLBACK_PATH,
    McpAuthConfigError,
    _read_int,
    _validate_callback_url,
    load_mcp_auth_config,
)


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
