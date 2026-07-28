"""Logging filter that redacts known-sensitive keys from ark-api log records.

Attached globally (root + uvicorn handlers) by ``core.config.setup_logging`` so it
applies to all ark-api logs, not just the MCP auth flow. See the Logging Contract
docs for the exact keys and the boundary with content-level DLP.

Key-anchored: a credential is redacted only when a known key sits next to it
(``key=value``, ``key: value``, ``'key': 'value'``, ``?key=value``,
``authorization: Bearer <token>``). A bare value with no adjacent key -- e.g. a
lone positional ``%s`` arg -- is not recognised; that boundary is in the docs.
"""
from __future__ import annotations

import logging
import re

# Value group matches a quoted string, a `Bearer <token>` pair, or an unquoted
# token bounded by whitespace / , ; & } and quotes, so it doesn't swallow an
# adjacent field or a trailing ` HTTP/1.1`. Key may be quoted (dict repr).
_KEYS = r"access_token|refresh_token|client_secret|code_verifier|authorization"
SENSITIVE_PATTERNS = re.compile(
    r"(?P<key>['\"]?(?:" + _KEYS + r")['\"]?)"
    r"(?P<sep>\s*[=:]\s*)"
    r"(?P<val>'[^']*'|\"[^\"]*\"|[Bb]earer\s+[^\s,;]+|[^\s,;&}'\"]+)",
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

# uvicorn's access logger passes a fixed 5-tuple its AccessFormatter unpacks
# positionally; we must keep that tuple, not collapse the record to text.
_UVICORN_ACCESS_LOGGER = "uvicorn.access"
_EXC_FORMATTER = logging.Formatter()


class SensitiveDataFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if record.args:
            record.args = _redact_args(record.args)

        if record.name != _UVICORN_ACCESS_LOGGER:
            # Render `msg % args` once, then redact the result. Redacting a printf
            # template in place could delete a `%s` and desync it from args,
            # raising TypeError at emit (which dumps the raw args to stderr).
            record.msg = _redact_string(_safe_get_message(record))
            record.args = None

        _redact_exception(record)
        return True


def _safe_get_message(record: logging.LogRecord) -> str:
    try:
        return record.getMessage()
    except Exception:
        # A pre-existing msg/args mismatch isn't ours to raise on.
        return str(record.msg)


def _redact_string(s: str) -> str:
    return SENSITIVE_PATTERNS.sub(
        lambda m: f"{m.group('key')}{m.group('sep')}{REDACTED}",
        s,
    )


def _redact_value(v):
    if isinstance(v, str):
        return _redact_string(v)
    if isinstance(v, dict):
        return _redact_mapping(v)
    if isinstance(v, (list, tuple)):
        return type(v)(_redact_value(x) for x in v)
    return v


def _redact_mapping(d: dict) -> dict:
    return {
        k: (REDACTED if isinstance(k, str) and k.lower() in SENSITIVE_KEYS
            else _redact_value(v))
        for k, v in d.items()
    }


def _redact_args(args):
    if isinstance(args, dict):
        return _redact_mapping(args)
    if isinstance(args, tuple):
        return tuple(_redact_value(a) for a in args)
    return args


def _redact_exception(record: logging.LogRecord) -> None:
    # An exception message or traceback frame can carry a credential too.
    # Materialise exc_text from exc_info so the redacted text is what handlers
    # format (Formatter reuses a non-empty exc_text instead of re-deriving it).
    if record.exc_info and not record.exc_text:
        record.exc_text = _EXC_FORMATTER.formatException(record.exc_info)
    if record.exc_text:
        record.exc_text = _redact_string(record.exc_text)
    if getattr(record, "stack_info", None):
        record.stack_info = _redact_string(record.stack_info)
