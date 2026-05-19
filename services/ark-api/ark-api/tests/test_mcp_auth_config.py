"""Tests for ark_api.core.mcp_auth_config."""
from __future__ import annotations

import unittest
from unittest.mock import patch

from ark_api.core.mcp_auth_config import (
    CALLBACK_PATH,
    McpAuthConfigError,
    _validate_callback_url,
    load_mcp_auth_config,
)


class TestValidateCallbackUrl(unittest.TestCase):
    def test_https_public_host_is_accepted(self):
        result = _validate_callback_url("https://ark.example.com/api/v1/mcp/auth/callback")
        self.assertEqual(result, "https://ark.example.com/api/v1/mcp/auth/callback")

    def test_http_loopback_v4_is_accepted(self):
        result = _validate_callback_url("http://127.0.0.1:8080/api/v1/mcp/auth/callback")
        self.assertEqual(result, "http://127.0.0.1:8080/api/v1/mcp/auth/callback")

    def test_http_loopback_v6_is_accepted_bracketed(self):
        result = _validate_callback_url("http://[::1]:8080/api/v1/mcp/auth/callback")
        self.assertEqual(result, "http://[::1]:8080/api/v1/mcp/auth/callback")

    def test_http_localhost_is_accepted(self):
        result = _validate_callback_url("http://localhost:8080/api/v1/mcp/auth/callback")
        self.assertEqual(result, "http://localhost:8080/api/v1/mcp/auth/callback")

    def test_http_public_host_is_rejected(self):
        with self.assertRaises(McpAuthConfigError):
            _validate_callback_url("http://ark.example.com/api/v1/mcp/auth/callback")

    def test_unbracketed_ipv6_is_rejected(self):
        with self.assertRaises(McpAuthConfigError) as ctx:
            _validate_callback_url("http://::1:8080/api/v1/mcp/auth/callback")
        self.assertIn("RFC 3986", str(ctx.exception))

    def test_callback_path_is_appended_when_root(self):
        result = _validate_callback_url("https://ark.example.com")
        self.assertTrue(result.endswith(CALLBACK_PATH))

    def test_bad_scheme_is_rejected(self):
        with self.assertRaises(McpAuthConfigError):
            _validate_callback_url("ftp://ark.example.com/api/v1/mcp/auth/callback")


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
            "ARK_API_PUBLIC_CALLBACK_URL": "https://ark.example.com/api/v1/mcp/auth/callback",
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
