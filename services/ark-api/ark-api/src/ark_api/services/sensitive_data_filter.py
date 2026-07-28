"""Logging filter that redacts credentials from ark-api log records.

Attached globally by ``core.config.setup_logging``. Two passes: key-anchored
(``key=value`` / ``Bearer <token>``) and shape-based (JWTs, provider API keys, PEM
private keys) for bare tokens. Kept in sync with the Go trace redactor
(``ark/internal/telemetry/redact``) via shared testdata fixtures. Not content-level DLP:
opaque secrets and PII are not detected.
"""
from __future__ import annotations

import logging
import re

# Single source of truth for the credential key names. Both the string-redaction regex
# (_KEYS below) and the dict-key redaction (_redact_mapping) derive from this set, so
# adding a key updates both paths at once -- they cannot silently drift apart.
SENSITIVE_KEYS = frozenset({
    "access_token",
    "refresh_token",
    "client_secret",
    "code_verifier",
    "authorization",
})

# Value group matches a quoted string, a `Bearer <token>` pair, or an unquoted
# token bounded by whitespace / , ; & } and quotes, so it doesn't swallow an
# adjacent field or a trailing ` HTTP/1.1`. Key may be quoted (dict repr). The key
# alternation is derived from SENSITIVE_KEYS; sorted() keeps the compiled pattern
# deterministic (frozenset order isn't), and order is irrelevant since the keys are
# disjoint literals.
_KEYS = "|".join(re.escape(k) for k in sorted(SENSITIVE_KEYS))
SENSITIVE_PATTERNS = re.compile(
    r"(?P<key>['\"]?(?:" + _KEYS + r")['\"]?)"
    r"(?P<sep>\s*[=:]\s*)"
    r"(?P<val>'[^']*'|\"[^\"]*\"|(?:[Bb]earer|[Bb]asic)\s+[^\s,;]+|[^\s,;&}'\"]+)",
    re.IGNORECASE,
)

# Case-sensitive; kept in sync with shapePattern in ark/internal/telemetry/redact/redact.go.
_SHAPE_ALTERNATIVES = [
    r"eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+",  # JWT
    r"sk-(?:ant-|proj-)?[A-Za-z0-9_-]{40,}",  # OpenAI/Anthropic
    r"gh[pousr]_[A-Za-z0-9]{36,}",  # GitHub
    r"github_pat_[A-Za-z0-9_]{22,}",  # GitHub PAT
    r"(?:AKIA|ASIA)[0-9A-Z]{16}",  # AWS
    r"AIza[0-9A-Za-z_-]{35}",  # Google
    r"xox[baprs]-[A-Za-z0-9-]{10,}",  # Slack
    r"(?:sk|rk)_live_[A-Za-z0-9]{16,}",  # Stripe
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:[A-Za-z0-9._~+/=-]{16,}",  # McKinsey svc cred (uuid:token)
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----",  # PEM
]
SHAPE_PATTERNS = re.compile("|".join(_SHAPE_ALTERNATIVES))

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
    s = SENSITIVE_PATTERNS.sub(
        lambda m: f"{m.group('key')}{m.group('sep')}{REDACTED}",
        s,
    )
    return SHAPE_PATTERNS.sub(REDACTED, s)


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
