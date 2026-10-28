"""The Substrate runner contract: serve /healthz and /readyz on port 80.

/healthz returns 200 as soon as the runner is alive; /readyz returns 503 until the
agent run has finished, then 200. Runs in a background thread so the main thread can
do the agent work. (Guest services for `ax ssh`/debug are a TODO.)
"""

from __future__ import annotations

import logging
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

logger = logging.getLogger(__name__)


class _State:
    ready = False


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        if self.path.startswith("/healthz"):
            self._send(200, b"ok")
        elif self.path.startswith("/readyz"):
            self._send(200 if _State.ready else 503, b"ready" if _State.ready else b"initializing")
        else:
            self._send(404, b"not found")

    def _send(self, code: int, body: bytes):
        self.send_response(code)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):  # silence access logs
        pass


def start(port: int = 80) -> None:
    server = ThreadingHTTPServer(("0.0.0.0", port), _Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    logger.info("runner probe server listening on :%d", port)


def set_ready(ready: bool = True) -> None:
    _State.ready = ready
