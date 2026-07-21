"""Shared cursor-pagination query parameters for list endpoints."""
from dataclasses import dataclass
from typing import Optional

from fastapi import Query

DEFAULT_PAGE_LIMIT = 100
MAX_PAGE_LIMIT = 1000


@dataclass
class PaginationParams:
    """Resolved pagination inputs for a Kubernetes server-side list page."""
    limit: int
    continue_token: Optional[str]


def pagination_params(
    limit: int = Query(
        DEFAULT_PAGE_LIMIT,
        ge=1,
        le=MAX_PAGE_LIMIT,
        description="Maximum number of items to return per page",
    ),
    continue_token: Optional[str] = Query(
        None,
        alias="continue",
        description="Continuation token returned by the previous page",
    ),
) -> PaginationParams:
    """FastAPI dependency exposing ``?limit=`` and ``?continue=`` consistently."""
    return PaginationParams(limit=limit, continue_token=continue_token)
