
import re
from datetime import datetime
from typing import Any, Optional

RFC1123_SEGMENT_MAX = 63        # bytes per DNS label
RFC1123_NAME_MAX    = 253       # bytes total (incl. dots)

_subst_invalid = re.compile(r'[^a-z0-9.-]')
_collapse_dash = re.compile(r'-{2,}')
_collapse_dot  = re.compile(r'\.{2,}')

def to_rfc1123(name: str) -> str:
    """
    Return *name* transformed so it satisfies the Kubernetes/RFC-1123
    DNS-subdomain rule:
        [a-z0-9]([-a-z0-9]*[a-z0-9])?(\\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*

    Strategy
    --------
    1. Lower-case.
    2. Replace every char not in [a-z0-9.-] with '-'.
    3. Squash repeated '-' or '.'.
    4. For each dot-separated label, trim leading/trailing '-'
       and truncate to 63 bytes.
    5. Re-join labels, trim non-alnum at the global ends,
       then truncate to 253 bytes.

    Raises
    ------
    ValueError if the result would be empty.
    """
    s = name.lower()

    # 1-2. purge illegal characters
    s = _subst_invalid.sub('-', s)

    # 3. collapse runs
    s = _collapse_dash.sub('-', _collapse_dot.sub('.', s))

    # 4. per-label cleanup
    labels = []
    for lbl in s.split('.'):
        lbl = lbl.strip('-')            # must start/end with alnum
        if lbl:                         # skip empty labels
            labels.append(lbl[:RFC1123_SEGMENT_MAX])

    s = '.'.join(labels)

    # 5. global cleanup
    s = re.sub(r'^[^a-z0-9]+', '', s)
    non_alnum_chars = set([chr(i) for i in range(128)]) - set('abcdefghijklmnopqrstuvwxyz0123456789')
    s = s.rstrip(''.join(non_alnum_chars))
    s = s[:RFC1123_NAME_MAX]

    if not s:
        raise ValueError("Cannot coerce {!r} to a valid RFC-1123 name".format(name))

    return s


def parse_iso_timestamp(value: Any) -> Optional[datetime]:
    """Parse a Kubernetes / ISO-8601 timestamp into a datetime.

    Accepts an ISO-8601 string (with or without a trailing ``Z``), an already
    parsed ``datetime`` (returned as-is — the k8s client hands these back for
    some fields), or ``None``/empty (returns ``None``). Returns ``None`` on an
    unparseable value rather than raising.
    """
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None
