"""Tests for the archived workflow-log fallback (Argo Server artifact endpoint)."""
import os
import unittest
from unittest.mock import patch

import httpx

os.environ["AUTH_MODE"] = "open"

from ark_api.api.v1 import argo_server  # noqa: E402
from ark_api.api.v1.resources import _build_archived_window  # noqa: E402

ARGO_URL = "http://argo-server.test:2746"
REAL_ASYNC_CLIENT = httpx.AsyncClient


def argo_client_factory(handler):
    def factory(**kwargs):
        return REAL_ASYNC_CLIENT(transport=httpx.MockTransport(handler), **kwargs)
    return factory


class TestGetWorkflowLog(unittest.IsolatedAsyncioTestCase):
    async def test_reads_artifact_endpoint_and_returns_raw_text(self):
        captured = {}

        def handler(request):
            captured["url"] = str(request.url)
            return httpx.Response(200, text="START work\nDONE work\n")

        with patch("ark_api.api.v1.argo_server.httpx.AsyncClient", argo_client_factory(handler)):
            out = await argo_server.get_workflow_log(
                ARGO_URL, "default", "wf-abc", "wf-abc-123", container="main"
            )

        self.assertEqual(out, "START work\nDONE work\n")
        self.assertIn(
            "/artifact-files/default/workflows/wf-abc/wf-abc-123/outputs/main-logs",
            captured["url"],
        )

    async def test_container_selects_log_artifact_name(self):
        captured = {}

        def handler(request):
            captured["url"] = str(request.url)
            return httpx.Response(200, text="x")

        with patch("ark_api.api.v1.argo_server.httpx.AsyncClient", argo_client_factory(handler)):
            await argo_server.get_workflow_log(
                ARGO_URL, "default", "wf", "wf-1", container="sidecar"
            )

        self.assertIn("/outputs/sidecar-logs", captured["url"])

    async def test_returns_none_on_http_error(self):
        def handler(request):
            return httpx.Response(404, text="not found")

        with patch("ark_api.api.v1.argo_server.httpx.AsyncClient", argo_client_factory(handler)):
            out = await argo_server.get_workflow_log(ARGO_URL, "default", "wf", "wf-1")

        self.assertIsNone(out)


class TestBuildArchivedWindow(unittest.TestCase):
    def _lines(self, n):
        return "\n".join(f"line{i}" for i in range(n))

    def test_tails_from_end(self):
        w = _build_archived_window(self._lines(10), max_lines=3, skip_tail_lines=0, max_bytes=1_000_000)
        self.assertEqual(w.content, "line7\nline8\nline9")
        self.assertEqual(w.line_count, 3)
        self.assertTrue(w.has_more_before)

    def test_skip_tail_walks_backwards(self):
        w = _build_archived_window(self._lines(10), max_lines=3, skip_tail_lines=3, max_bytes=1_000_000)
        self.assertEqual(w.content, "line4\nline5\nline6")

    def test_no_more_before_when_whole_log_fits(self):
        w = _build_archived_window("a\nb", max_lines=10, skip_tail_lines=0, max_bytes=1_000_000)
        self.assertFalse(w.has_more_before)
        self.assertEqual(w.line_count, 2)

    def test_byte_cap_truncates(self):
        w = _build_archived_window("x" * 100, max_lines=10, skip_tail_lines=0, max_bytes=10)
        self.assertTrue(w.truncated)
        self.assertLessEqual(w.byte_count, 10)


if __name__ == "__main__":
    unittest.main()
