"""Logging filter that redacts credentials from ark-api log records.

Attached globally by ``core.config.setup_logging``. Passes, in order: shape-based (JWTs,
provider API keys, PEM private keys), key-anchored (``key=value`` / ``Bearer <token>``),
cookie/set-cookie (redacts the whole ;-separated header, not just the first pair), and
userinfo (``scheme://user:<secret>@host``, literal and percent-encoded). Kept in sync with
the Go trace redactor (``ark/internal/telemetry/redact``) via shared testdata fixtures. Not
content-level DLP: opaque secrets and PII are not detected.
"""
from __future__ import annotations

import logging
import re

# Single source of truth for the credential key names. Both the string-redaction regex
# (_STRING_KEYS below) and the dict-key redaction (_redact_mapping) derive from this set, so
# adding a key updates both paths at once -- they cannot silently drift apart. "cookie" is the
# one exception: it stays here for _redact_mapping's exact dict-key match, but is excluded
# from the string regex because it needs COOKIE_PATTERN's different (unbounded) value shape.
SENSITIVE_KEYS = frozenset({
    "access_token",
    "refresh_token",
    "client_secret",
    "code_verifier",
    "authorization",
    "password",
    "passwd",
    "api_key",
    "apikey",
    "api-key",
    "secret",
    "client_key",
    "aws_secret_access_key",
    "secret_access_key",
    "private_key",
    "cookie",
    "token",
})

# Value group matches a quoted string, a `Bearer <token>` pair, or an unquoted
# token bounded by whitespace / , ; & } and quotes, so it doesn't swallow an
# adjacent field or a trailing ` HTTP/1.1`. Key may be quoted (dict repr). The key
# alternation is derived from SENSITIVE_KEYS (minus "cookie", see above); sorted() keeps the
# compiled pattern deterministic (frozenset order isn't), and order is irrelevant since the
# keys are disjoint literals.
_STRING_KEYS = SENSITIVE_KEYS - {"cookie"}
_KEYS = "|".join(re.escape(k) for k in sorted(_STRING_KEYS))
SENSITIVE_PATTERNS = re.compile(
    r"(?P<key>['\"]?(?:" + _KEYS + r")['\"]?)"
    r"(?P<sep>\s*[=:]\s*)"
    r"(?P<val>'[^']*'|\"[^\"]*\"|(?:[Bb]earer|[Bb]asic)\s+[^\s,;]+|[^\s,;&}'\"]+)",
    re.IGNORECASE,
)

# A Cookie/Set-Cookie header is one or more ;-separated pairs (Cookie: a=1; session=SECRET),
# so unlike every other key above, the unquoted value must run to end of line rather than
# stopping at the first ';' -- otherwise every pair past the first leaks. The quoted
# alternatives still take priority and stay bounded by their closing quote, so a
# JSON-embedded cookie value doesn't swallow trailing structure (e.g. a closing '}').
COOKIE_PATTERN = re.compile(
    r"(?P<key>['\"]?(?:cookie|set-cookie)['\"]?)(?P<sep>\s*:\s*)"
    r"(?P<val>'[^']*'|\"[^\"]*\"|[^\r\n]+)",
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

# _USERINFO_BOUNDARY bounds the user/password segments of a URL's userinfo. It excludes
# whitespace and '@' (the real delimiter) plus URL/JSON structural characters that would
# otherwise let the match run past the credential into unrelated surrounding content -- e.g.
# a URL and an email address sharing one whitespace-free JSON blob, where an unbounded class
# would merge the two into a single bogus "redaction" that silently mangles both, and (in
# Python's backtracking engine specifically) can turn one long, boundary-free log line into a
# multi-second match on the synchronous logging path.
_USERINFO_BOUNDARY = r"[^\s@/?#\"',;&}\\]"

# Matches a URL with literal delimiters: scheme://user:<secret>@host, e.g. a Postgres DSN.
# There is no key=value pair here, so SENSITIVE_PATTERNS can't see it. Scheme and user are
# preserved; only the password segment is replaced. user/pass are greedy so an
# already-percent-encoded character inside the password itself (e.g. a literal '%40'
# standing for an '@' the password needed) is treated as ordinary text and the match still
# runs to the real, final '@' rather than stopping at the first look-alike.
USERINFO_LITERAL_PATTERN = re.compile(
    r"(?P<scheme>[A-Za-z][A-Za-z0-9+.-]*://)"
    r"(?P<user>" + _USERINFO_BOUNDARY + r"*)(?P<colon>:)"
    r"(?P<pass>" + _USERINFO_BOUNDARY + r"+)(?P<at>@)"
)

# Matches the same shape after the entire URL has been percent-encoded (e.g. it arrived as a
# query-parameter value): scheme%3a%2f%2fuser%3a<secret>%40host -- this is how uvicorn's raw
# access log sees a DSN that was passed as a query string value, since it logs the
# request-target before Starlette decodes it. Kept as a separate pattern from the literal one
# above -- letting each delimiter be independently literal-or-encoded (the original design)
# let a URL that was literal everywhere else falsely match against a percent-encoded
# look-alike substring elsewhere in the line. Lazy here (unlike the greedy literal pattern) to
# avoid running past the end of a short encoded query value into unrelated,
# alphanumeric-and-'%'-shaped content later in the same log line.
USERINFO_ENCODED_PATTERN = re.compile(
    r"(?P<scheme>[A-Za-z][A-Za-z0-9+.-]*%3[Aa]%2[Ff]%2[Ff])"
    r"(?P<user>" + _USERINFO_BOUNDARY + r"*?)(?P<colon>%3[Aa])"
    r"(?P<pass>" + _USERINFO_BOUNDARY + r"+?)(?P<at>%40)"
)

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
    # Shape pass runs first, deliberately: it matches self-contained anchors (a full
    # -----BEGIN...END----- block) that do not depend on delimiter context, whereas the
    # key-anchored pass below has a val group bounded by the first whitespace/comma/etc. If
    # the key-anchored pass ran first, a key like private_key= or secret= would eat only the
    # "-----BEGIN" prefix off a PEM value (unquoted values stop at the first space) and
    # destroy the anchor the shape pass needs to see, redacting only the front of the key and
    # leaking the rest verbatim.
    s = SHAPE_PATTERNS.sub(REDACTED, s)
    s = SENSITIVE_PATTERNS.sub(
        lambda m: f"{m.group('key')}{m.group('sep')}{REDACTED}",
        s,
    )
    s = COOKIE_PATTERN.sub(
        lambda m: f"{m.group('key')}{m.group('sep')}{REDACTED}",
        s,
    )
    # Cheap guard: skip both userinfo regexes entirely when neither delimiter they look for
    # is even present, rather than paying for a full (and, for a long boundary-free string,
    # potentially very slow) regex scan on every log line.
    if "@" in s or "%40" in s:
        s = USERINFO_LITERAL_PATTERN.sub(
            lambda m: f"{m.group('scheme')}{m.group('user')}{m.group('colon')}{REDACTED}{m.group('at')}",
            s,
        )
        s = USERINFO_ENCODED_PATTERN.sub(
            lambda m: f"{m.group('scheme')}{m.group('user')}{m.group('colon')}{REDACTED}{m.group('at')}",
            s,
        )
    return s


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
