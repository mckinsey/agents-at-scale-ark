"""Flatten a FastAPI app's routes, descending into lazily-included routers.

FastAPI >=0.163.2 fixed a quadratic request-parameter DoS
(GHSA-f56c-v883-vx8r) by no longer eagerly flattening included routers into
``app.routes``. An included router now appears as a single ``_IncludedRouter``
node whose child routes are resolved lazily, so walking ``app.routes`` for
``APIRoute`` instances only finds the handful of routes added to the app
directly. This walks the tree and yields every effective ``(full_path, route)``
pair, working on both the old (eager) and new (lazy) layouts.
"""
from collections.abc import Iterator

from fastapi import FastAPI
from fastapi.routing import APIRoute

try:
    from fastapi.routing import _IncludedRouter
except ImportError:
    _IncludedRouter = None


def iter_api_routes(app: FastAPI) -> Iterator[tuple[str, APIRoute]]:
    yield from _walk(app.routes)


def _walk(routes, prefix: str = "") -> Iterator[tuple[str, APIRoute]]:
    for route in routes:
        if isinstance(route, APIRoute):
            yield prefix + route.path, route
        elif _IncludedRouter is not None and isinstance(route, _IncludedRouter):
            yield from _walk(
                route.original_router.routes,
                prefix + route.include_context.prefix,
            )
