"""Tests for the archived workflow-log fallback (Argo Server artifact endpoint)."""
import os
import unittest
from unittest.mock import AsyncMock, Mock, patch

import httpx
from fastapi import HTTPException
from fastapi.testclient import TestClient
from kubernetes_asyncio.client.rest import ApiException

os.environ["AUTH_MODE"] = "open"

from ark_api.api.v1 import argo_server  # noqa: E402
from ark_api.api.v1.resources import _build_archived_window  # noqa: E402

ARGO_URL = "http://argo-server.test:2746"
REAL_ASYNC_CLIENT = httpx.AsyncClient

WF_LOG_PATH = "/v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/wf/wf-123/log"
WF_WINDOW_PATH = WF_LOG_PATH + "/window"


def argo_client_factory(handler):
    def factory(**kwargs):
        return REAL_ASYNC_CLIENT(transport=httpx.MockTransport(handler), **kwargs)
    return factory


def access_review(allowed):
    auth_api = Mock()
    auth_api.create_self_subject_access_review = AsyncMock(
        return_value=Mock(status=Mock(allowed=allowed))
    )
    return auth_api


def workflow_node(phase="Succeeded", node_type="Pod"):
    return {
        "metadata": {"name": "wf"},
        "status": {"nodes": {"wf-123": {"type": node_type, "phase": phase, "templateName": "run"}}},
    }


def archive_handler(calls, text="archived\n", status_code=200):
    def handler(request):
        calls.append(str(request.url))
        return httpx.Response(status_code, text=text)
    return handler


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

    def test_trailing_newline_does_not_add_phantom_line(self):
        # split("\n") on "a\nb\n" would yield a 3rd empty element; splitlines must not.
        w = _build_archived_window("a\nb\n", max_lines=10, skip_tail_lines=0, max_bytes=1_000_000)
        self.assertEqual(w.content, "a\nb")
        self.assertEqual(w.line_count, 2)

    def test_byte_cut_keeps_line_count_consistent_with_content(self):
        # Many short lines, byte cap mid-log: line_count must match returned lines
        # (not the pre-cut window size) so "load older" paging stays aligned.
        text = "\n".join(f"line{i}" for i in range(50))
        w = _build_archived_window(text, max_lines=50, skip_tail_lines=0, max_bytes=20)
        self.assertLessEqual(w.byte_count, 20)
        self.assertEqual(w.line_count, len(w.content.split("\n")))
        self.assertTrue(w.has_more_before)


@patch.dict(os.environ, {"ARGO_SERVER_URL": ARGO_URL})
@patch("ark_api.api.v1.client_utils.create_api_client")
@patch("ark_api.api.v1.resources.get_context", return_value={"namespace": "default"})
class TestArchivedLogRoutes(unittest.TestCase):
    """Route-level tests for the pods/log RBAC gate on the archive fallback."""

    def setUp(self):
        from ark_api.main import app
        self.client = TestClient(app)

    def _workflow_dynamic_client(self, mock_dynamic_client_cls, workflow_dict):
        dynamic_client = AsyncMock()

        async def create(*args, **kwargs):
            return dynamic_client

        mock_dynamic_client_cls.side_effect = create
        api_resource = AsyncMock()
        obj = Mock()
        obj.to_dict.return_value = workflow_dict
        api_resource.get = AsyncMock(return_value=obj)
        dynamic_client.resources.get = AsyncMock(return_value=api_resource)
        return api_resource

    def _assert_reviewed_pods_log(self, mock_auth):
        attrs = mock_auth.return_value.create_self_subject_access_review.call_args.args[0].spec.resource_attributes
        self.assertEqual(
            (attrs.namespace, attrs.group, attrs.resource, attrs.verb, attrs.subresource),
            ("default", "", "pods", "get", "log"),
        )

    # ---- /log/window ----
    @patch("ark_api.api.v1.resources._resolve_workflow_pod_name", new_callable=AsyncMock)
    @patch("ark_api.api.v1.resources.DynamicClient")
    @patch("ark_api.api.v1.resources.client.AuthorizationV1Api")
    def test_window_pod_gone_allowed_returns_archive(self, mock_auth, mock_dyn, mock_resolve, _ctx, _api):
        mock_auth.return_value = access_review(True)
        mock_resolve.side_effect = HTTPException(status_code=404, detail="gone")
        self._workflow_dynamic_client(mock_dyn, workflow_node())
        calls = []
        with patch("ark_api.api.v1.argo_server.httpx.AsyncClient", argo_client_factory(archive_handler(calls, "l1\nl2\n"))):
            r = self.client.get(WF_WINDOW_PATH)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["content"], "l1\nl2")
        self._assert_reviewed_pods_log(mock_auth)
        self.assertEqual(len(calls), 1)

    @patch("ark_api.api.v1.resources._resolve_workflow_pod_name", new_callable=AsyncMock)
    @patch("ark_api.api.v1.resources.DynamicClient")
    @patch("ark_api.api.v1.resources.client.AuthorizationV1Api")
    def test_window_pod_gone_denied_returns_403_without_argo(self, mock_auth, mock_dyn, mock_resolve, _ctx, _api):
        mock_auth.return_value = access_review(False)
        mock_resolve.side_effect = HTTPException(status_code=404, detail="gone")
        self._workflow_dynamic_client(mock_dyn, workflow_node())
        calls = []
        with patch("ark_api.api.v1.argo_server.httpx.AsyncClient", argo_client_factory(archive_handler(calls))):
            r = self.client.get(WF_WINDOW_PATH)
        self.assertEqual(r.status_code, 403)
        self.assertEqual(calls, [])

    @patch("ark_api.api.v1.resources._read_log_window", new_callable=AsyncMock)
    @patch("ark_api.api.v1.resources._resolve_workflow_pod_name", new_callable=AsyncMock)
    @patch("ark_api.api.v1.resources.DynamicClient")
    @patch("ark_api.api.v1.resources.client.AuthorizationV1Api")
    def test_window_gc_container_non_404_still_serves_archive(self, mock_auth, mock_dyn, mock_resolve, mock_window, _ctx, _api):
        # Pod exists but its container logs were GC'd — kubelet returns a non-404.
        mock_auth.return_value = access_review(True)
        mock_resolve.return_value = "wf-run-123"
        mock_window.side_effect = ApiException(status=400, reason="unable to retrieve container logs")
        self._workflow_dynamic_client(mock_dyn, workflow_node())
        calls = []
        with patch("ark_api.api.v1.argo_server.httpx.AsyncClient", argo_client_factory(archive_handler(calls, "x\n"))):
            r = self.client.get(WF_WINDOW_PATH)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["content"], "x")
        self.assertEqual(len(calls), 1)

    # ---- /log ----
    @patch("ark_api.api.v1.resources.CoreV1Api")
    @patch("ark_api.api.v1.resources._resolve_workflow_pod_name", new_callable=AsyncMock)
    @patch("ark_api.api.v1.resources.DynamicClient")
    @patch("ark_api.api.v1.resources.client.AuthorizationV1Api")
    def test_log_k8s_403_returns_403_without_archive(self, mock_auth, mock_dyn, mock_resolve, mock_core, _ctx, _api):
        mock_resolve.return_value = "wf-run-123"
        core = Mock()
        core.read_namespaced_pod_log = AsyncMock(side_effect=ApiException(status=403, reason="Forbidden"))
        mock_core.return_value = core
        calls = []
        with patch("ark_api.api.v1.argo_server.httpx.AsyncClient", argo_client_factory(archive_handler(calls))):
            r = self.client.get(WF_LOG_PATH)
        self.assertEqual(r.status_code, 403)
        self.assertEqual(calls, [])
        mock_auth.return_value.create_self_subject_access_review.assert_not_called()

    @patch("ark_api.api.v1.resources.CoreV1Api")
    @patch("ark_api.api.v1.resources._resolve_workflow_pod_name", new_callable=AsyncMock)
    @patch("ark_api.api.v1.resources.DynamicClient")
    @patch("ark_api.api.v1.resources.client.AuthorizationV1Api")
    def test_log_pod_gone_allowed_returns_archive(self, mock_auth, mock_dyn, mock_resolve, mock_core, _ctx, _api):
        mock_auth.return_value = access_review(True)
        mock_resolve.side_effect = HTTPException(status_code=404, detail="gone")
        mock_core.return_value = Mock()
        self._workflow_dynamic_client(mock_dyn, workflow_node())
        calls = []
        with patch("ark_api.api.v1.argo_server.httpx.AsyncClient", argo_client_factory(archive_handler(calls, "a\nb\n"))):
            r = self.client.get(WF_LOG_PATH)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.text, "a\nb\n")
        self._assert_reviewed_pods_log(mock_auth)

    @patch.dict(os.environ, {"ARGO_SERVER_URL": ""})
    @patch("ark_api.api.v1.resources.CoreV1Api")
    @patch("ark_api.api.v1.resources._resolve_workflow_pod_name", new_callable=AsyncMock)
    @patch("ark_api.api.v1.resources.DynamicClient")
    @patch("ark_api.api.v1.resources.client.AuthorizationV1Api")
    def test_log_argo_unset_returns_pod_deleted_without_review(self, mock_auth, mock_dyn, mock_resolve, mock_core, _ctx, _api):
        mock_auth.return_value = access_review(True)
        mock_resolve.side_effect = HTTPException(status_code=404, detail="gone")
        mock_core.return_value = Mock()
        self._workflow_dynamic_client(mock_dyn, workflow_node())
        calls = []
        with patch("ark_api.api.v1.argo_server.httpx.AsyncClient", argo_client_factory(archive_handler(calls))):
            r = self.client.get(WF_LOG_PATH)
        self.assertEqual(r.status_code, 404)
        self.assertIn("Pod has been deleted", r.text)
        self.assertEqual(calls, [])
        mock_auth.return_value.create_self_subject_access_review.assert_not_called()


if __name__ == "__main__":
    unittest.main()
