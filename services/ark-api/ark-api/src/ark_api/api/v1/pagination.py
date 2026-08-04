"""Shared cursor-pagination query parameters for list endpoints."""
from dataclasses import dataclass
from typing import Optional

from fastapi import Query

DEFAULT_PAGE_LIMIT = 100
MAX_PAGE_LIMIT = 1000


@dataclass
class PaginationParams:
    """Cursor-pagination query params (``?limit=`` and ``?continue=``).

    Used directly as a FastAPI dependency: ``pagination: PaginationParams = Depends(PaginationParams)``.
    FastAPI inspects the generated ``__init__`` and picks up the ``Query(...)``
    defaults as query-parameter declarations, so no factory function is needed.
    """

    limit: int = Query(
        DEFAULT_PAGE_LIMIT,
        ge=1,
        le=MAX_PAGE_LIMIT,
        description="Maximum number of items to return per page",
    )
    continue_token: Optional[str] = Query(
        None,
        alias="continue",
        description="Continuation token returned by the previous page",
    )
