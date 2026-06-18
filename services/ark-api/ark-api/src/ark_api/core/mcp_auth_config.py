"""Configuration for the MCP authorization endpoints.

Reads `ARK_API_PUBLIC_CALLBACK_URL` and the three MCP-auth timeout / TTL env vars
at import time, validates them, and exposes them via getters. The public
callback URL SHALL be HTTPS unless the host is a loopback literal
(`127.0.0.1`, `[::1]`, or `localhost`) per RFC 8252 §7.3. IPv6 loopback
literals SHALL be bracketed per RFC 3986 §3.2.2.
"""
from __future__ import annotations

import ipaddress
import logging
import os
import socket
from urllib.parse import urlsplit, urlunsplit

logger = logging.getLogger(__name__)

CALLBACK_PATH = "/v1/mcp/auth/callback"

DEFAULT_CACHE_TTL_SECONDS = 600
DEFAULT_DCR_TIMEOUT_SECONDS = 15
DEFAULT_TOKEN_TIMEOUT_SECONDS = 15

_LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "[::1]"}


class McpAuthConfigError(ValueError):
    """Raised when MCP-auth configuration is invalid."""


def _has_embedded_loopback_ip(host: str) -> bool:
    labels = host.replace("-", ".").split(".")
    for i in range(len(labels) - 3):
        try:
            if ipaddress.ip_address(".".join(labels[i : i + 4])).is_loopback:
                return True
        except ValueError:
            continue
    return False


def _is_loopback_host(host: str) -> bool:
    if host in _LOOPBACK_HOSTS:
        return True
    try:
        ip = ipaddress.ip_address(host)
        if ip.is_loopback:
            return True
    except ValueError:
        pass
    try:
        resolved = socket.getaddrinfo(host, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
        return all(
            ipaddress.ip_address(addr[4][0]).is_loopback for addr in resolved
        )
    except (socket.gaierror, ValueError):
        return _has_embedded_loopback_ip(host)


def _validate_callback_url(raw: str) -> str:
    """Validate and normalise ARK_API_PUBLIC_CALLBACK_URL.

    Returns the URL with the canonical callback path appended if missing.
    Rejects unbracketed IPv6 literals and non-HTTPS public hosts.
    """
    if not raw:
        raise McpAuthConfigError("ARK_API_PUBLIC_CALLBACK_URL is not set")

    parts = urlsplit(raw)
    if parts.scheme not in {"http", "https"}:
        raise McpAuthConfigError(
            f"ARK_API_PUBLIC_CALLBACK_URL scheme must be http or https (got {parts.scheme!r})"
        )

    netloc = parts.netloc
    if not netloc:
        raise McpAuthConfigError("ARK_API_PUBLIC_CALLBACK_URL is missing host")

    host_in_netloc = netloc.split("@", 1)[-1]
    if "[" not in host_in_netloc and host_in_netloc.count(":") >= 2:
        raise McpAuthConfigError(
            "ARK_API_PUBLIC_CALLBACK_URL must bracket IPv6 host literals "
            "per RFC 3986 §3.2.2 (e.g. http://[::1]:8080/...)"
        )

    host = parts.hostname or ""
    if not host:
        raise McpAuthConfigError("ARK_API_PUBLIC_CALLBACK_URL is missing host")

    is_loopback = _is_loopback_host(host)

    if parts.scheme == "http" and not is_loopback:
        raise McpAuthConfigError(
            "ARK_API_PUBLIC_CALLBACK_URL must be https unless host is a "
            "loopback literal (127.0.0.1, [::1], or localhost); got host "
            f"{host!r}"
        )

    path = parts.path or ""
    if not path or path == "/":
        path = CALLBACK_PATH
    elif not path.endswith(CALLBACK_PATH):
        if path.rstrip("/") != CALLBACK_PATH:
            path = path.rstrip("/") + CALLBACK_PATH if not path.endswith(CALLBACK_PATH) else path

    normalised = urlunsplit((parts.scheme, parts.netloc, path, "", ""))
    return normalised


def _read_int(env: str, default: int) -> int:
    raw = os.environ.get(env)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise McpAuthConfigError(f"{env} must be an integer (got {raw!r})") from exc
    if value <= 0:
        raise McpAuthConfigError(f"{env} must be positive (got {value})")
    return value


class McpAuthConfig:
    def __init__(
        self,
        public_callback_url: str | None,
        cache_ttl_seconds: int,
        dcr_timeout_seconds: int,
        token_timeout_seconds: int,
    ):
        self._public_callback_url = public_callback_url
        self.cache_ttl_seconds = cache_ttl_seconds
        self.dcr_timeout_seconds = dcr_timeout_seconds
        self.token_timeout_seconds = token_timeout_seconds

    @property
    def public_callback_url(self) -> str:
        if self._public_callback_url is None:
            raise McpAuthConfigError(
                "ARK_API_PUBLIC_CALLBACK_URL is not set; required by the MCP auth endpoints"
            )
        return self._public_callback_url

    @property
    def is_callback_url_set(self) -> bool:
        return self._public_callback_url is not None


def load_mcp_auth_config() -> McpAuthConfig:
    raw_callback = os.environ.get("ARK_API_PUBLIC_CALLBACK_URL", "").strip()
    callback_url: str | None
    if raw_callback:
        callback_url = _validate_callback_url(raw_callback)
        logger.info("MCP auth public callback URL: %s", callback_url)
    else:
        callback_url = None
        logger.info("ARK_API_PUBLIC_CALLBACK_URL is unset; MCP auth endpoints will return 503")

    return McpAuthConfig(
        public_callback_url=callback_url,
        cache_ttl_seconds=_read_int("ARK_API_MCP_AUTH_CACHE_TTL_SECONDS", DEFAULT_CACHE_TTL_SECONDS),
        dcr_timeout_seconds=_read_int("ARK_API_MCP_AUTH_DCR_TIMEOUT_SECONDS", DEFAULT_DCR_TIMEOUT_SECONDS),
        token_timeout_seconds=_read_int(
            "ARK_API_MCP_AUTH_TOKEN_TIMEOUT_SECONDS", DEFAULT_TOKEN_TIMEOUT_SECONDS
        ),
    )


_cached: McpAuthConfig | None = None


def get_mcp_auth_config() -> McpAuthConfig:
    """Return the lazily-loaded MCP auth config (re-read on demand for tests)."""
    global _cached
    if _cached is None:
        _cached = load_mcp_auth_config()
    return _cached


def reset_mcp_auth_config() -> None:
    """Reset the cached config so the next call re-reads the environment."""
    global _cached
    _cached = None
