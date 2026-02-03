import os
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware


class ReadOnlyMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self.read_only_mode = os.getenv("READ_ONLY_MODE", "false").lower() == "true"

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if self.read_only_mode and request.method in ["POST", "PUT", "PATCH", "DELETE"]:
            return Response(
                content='{"detail":"This is a demo environment. Create, update, and delete operations are disabled."}',
                status_code=403,
                media_type="application/json",
            )

        return await call_next(request)
