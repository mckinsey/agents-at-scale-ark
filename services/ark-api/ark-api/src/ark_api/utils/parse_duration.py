from __future__ import annotations

import re


def parse_duration_to_seconds(duration_str: str | None) -> int | None:
    """Parse a Kubernetes duration string to seconds.

    Matches K8s duration format exactly: "1000ms", "30s", "5m", "1h", "5m0s", "1h30m0s"
    Note: K8s rejects 'd' (days) - we match this behavior.

    Returns None if the input is None or empty otherwise seconds as an integer.
    Raises ValueError if the format is invalid.
    """
    if not duration_str:
        return None

    duration_str = duration_str.strip()
    if not duration_str:
        return None

    match = re.match(
        r"^(?:(\d+)h)?(?:(\d+)m(?!s))?(?:(\d+)s)?(?:(\d+)ms)?$", duration_str
    )
    if not match or not any(match.groups()):
        raise ValueError(f"Invalid duration format: {duration_str}")

    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    seconds = int(match.group(3) or 0)
    milliseconds = int(match.group(4) or 0)
    return int(hours * 3600 + minutes * 60 + seconds + milliseconds / 1000)
