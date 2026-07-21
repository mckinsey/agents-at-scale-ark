"""Logging filter that redacts known-sensitive keys from ark-api log records.

Attached globally (root + uvicorn handlers) by ``core.config.setup_logging`` so it
applies to all ark-api logs, not just the MCP auth flow. See the Logging Contract
docs for the exact keys and the boundary with content-level DLP.
"""
from __future__ import annotations

import logging
import re

# Matches `key <=|:> value`, where the value spans the rest of the field up to a
# comma/semicolon/newline. Spanning past the first token is deliberate: it redacts
# scheme-prefixed values like `authorization: Bearer <token>` (the token, not just
# "Bearer"). Bounding at `,`/`;` avoids swallowing adjacent structured fields.
SENSITIVE_PATTERNS = re.compile(
    r"(?P<key>access_token|refresh_token|client_secret|code_verifier|authorization)"
    r"(?P<sep>\s*[=:]\s*)"
    r"\S[^,;\n]*",
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
        lambda m: f"{m.group('key')}{m.group('sep')}{REDACTED}",
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
