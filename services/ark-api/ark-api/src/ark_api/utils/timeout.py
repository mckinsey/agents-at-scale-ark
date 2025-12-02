import re


def parse_timeout_to_seconds(timeout_str: str | None) -> int | None:
    if not timeout_str:
        return None

    match = re.match(r'^(\d+)(s|m|h)?$', timeout_str.strip())
    if not match:
        return None

    value = int(match.group(1))
    unit = match.group(2) or 's'

    if unit == 's':
        return value
    elif unit == 'm':
        return value * 60
    elif unit == 'h':
        return value * 3600

    return None
