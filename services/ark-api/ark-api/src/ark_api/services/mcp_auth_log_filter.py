"""Logging filter that redacts known-sensitive keys from MCP auth log records."""
from __future__ import annotations

import logging
import re

SENSITIVE_PATTERNS = re.compile(
    r"(access_token|refresh_token|client_secret|code_verifier|authorization)"
    r"\s*[=:]\s*\S+",
    re.IGNORECASE,
)

SENSITIVE_KEYS = frozenset({
    "access_token",
    "refresh_token",
    "client_secret",
    "code_verifier",
    "authorization",
})

REDACTED = "[REDACTED]"


class SensitiveDataFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if record.args:
            record.args = _redact_args(record.args)
        record.msg = _redact_string(str(record.msg))
        return True


def _redact_string(s: str) -> str:
    return SENSITIVE_PATTERNS.sub(
        lambda m: m.group(0).split("=")[0].split(":")[0].rstrip() + f"={REDACTED}"
        if "=" in m.group(0) else m.group(0).split(":")[0].rstrip() + f": {REDACTED}",
        s,
    )


def _redact_args(args):
    if isinstance(args, dict):
        return {
            k: REDACTED if isinstance(k, str) and k.lower() in SENSITIVE_KEYS else v
            for k, v in args.items()
        }
    if isinstance(args, tuple):
        return args
    return args
