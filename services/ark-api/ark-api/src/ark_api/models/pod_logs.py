"""Pydantic models for windowed pod log endpoints."""
from typing import Optional

from pydantic import BaseModel


class LogWindow(BaseModel):
    """A bounded slice of a pod log.

    Pages are anchored at the end of the log: ``skip_tail_lines`` counts lines
    backwards from the last line, and the window covers the ``max_lines``
    immediately older than that point. ``has_more_before`` is a best-effort
    hint that older lines exist, and is ``False`` once a page comes back short.
    """

    content: str
    line_count: int
    first_timestamp: Optional[str] = None
    last_timestamp: Optional[str] = None
    has_more_before: bool = False
    truncated: bool = False
    byte_count: int = 0
