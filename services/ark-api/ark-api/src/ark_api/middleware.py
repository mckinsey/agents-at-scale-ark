import os
from typing import Callable

from fastapi import Request, Response
from starlette.datastructures import MutableHeaders
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp, Message, Receive, Scope, Send

CACHE_CONTROL_VALUE = "no-cache, no-store, must-revalidate"


class CacheControlMiddleware:
    """Stamp no-cache directives on every response so sensitive data is not cached."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_cache_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers["Cache-Control"] = CACHE_CONTROL_VALUE
                headers["Pragma"] = "no-cache"
                headers["Expires"] = "0"
            await send(message)

        await self.app(scope, receive, send_with_cache_headers)


class ReadOnlyMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self.read_only_mode = os.getenv("READ_ONLY_MODE", "false").lower() == "true"
        
        self.allowed_paths = {
            "/v1/queries",
        }

        self.allowed_path_prefixes = [
            "/v1/resources/apis/argoproj.io/",
        ]

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if not self.read_only_mode:
            return await call_next(request)
        
        if request.method not in ["POST", "PUT", "PATCH", "DELETE"]:
            return await call_next(request)
        
        if request.url.path in self.allowed_paths:
            return await call_next(request)
        
        if any(request.url.path.startswith(prefix) for prefix in self.allowed_path_prefixes):
            return await call_next(request)
        
        return Response(
            content='{"detail":"This is a demo environment. Create, update, and delete operations are disabled."}',
            status_code=403,
            media_type="application/json",
        )
