import os
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware


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
