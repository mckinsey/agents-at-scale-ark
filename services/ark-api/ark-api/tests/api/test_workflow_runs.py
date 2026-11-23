import os
import unittest
from unittest.mock import AsyncMock, Mock, patch

from fastapi.testclient import TestClient
from kubernetes_asyncio.client.rest import ApiException

os.environ["AUTH_MODE"] = "open"

RUN_PATH = "/v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/wf/run"


def workflow():
    return {
        "metadata": {"name": "wf", "namespace": "default", "uid": "uid-1"},
        "status": {
            "phase": "Succeeded",
            "startedAt": "2026-11-18T10:00:00Z",
            "finishedAt": "2026-11-18T10:01:00Z",
            "nodes": {
                "wf": {
                    "name": "wf",
                    "displayName": "wf",
                    "type": "Steps",
                    "phase": "Succeeded",
                    "startedAt": "2026-11-18T10:00:00Z",
                    "finishedAt": "2026-11-18T10:01:00Z",
                    "children": ["wf-123"],
                },
                "wf-123": {
                    "name": "wf[0].ask",
                    "displayName": "ask",
                    "templateName": "query",
                    "type": "Pod",
                    "phase": "Succeeded",
                    "startedAt": "2026-11-18T10:00:05Z",
                    "finishedAt": "2026-11-18T10:00:30Z",
                    "boundaryID": "wf",
                    "message": "token=abc123",
                    "inputs": {"parameters": [
                        {"name": "input", "value": "hello"},
                        {"name": "api_key", "value": "sk-live-xyz"},
                    ]},
                    "outputs": {"parameters": [{"name": "response", "value": "password=hunter2"}], "exitCode": "0"},
                },
            },
        },
    }


def pod(name="wf-query-123", node_id="wf-123"):
    metadata = Mock(annotations={
        "workflows.argoproj.io/node-id": node_id,
        "workflows.argoproj.io/trace-id": "4bf92f3577b34da6a3ce929d0e0e4736",
        "workflows.argoproj.io/span-id": "00f067aa0ba902b7",
    })
    metadata.name = name
    return Mock(metadata=metadata)


@patch("ark_api.api.v1.client_utils.create_api_client")
class TestGetWorkflowRun(unittest.TestCase):
    def setUp(self):
        from ark_api.main import app
        self.client = TestClient(app)

    def _dynamic_client(self, mock_dyn, workflow_dict=None, error=None):
        dynamic_client = AsyncMock()

        async def create(*args, **kwargs):
            return dynamic_client

        mock_dyn.side_effect = create
        api_resource = AsyncMock()
        if error is not None:
            api_resource.get = AsyncMock(side_effect=error)
        else:
            obj = Mock()
            obj.to_dict.return_value = workflow_dict
            api_resource.get = AsyncMock(return_value=obj)
        dynamic_client.resources.get = AsyncMock(return_value=api_resource)

    def _core(self, mock_core, pods, log_text=None, log_error=None):
        core = Mock()
        core.list_namespaced_pod = AsyncMock(return_value=Mock(items=pods))
        core.read_namespaced_pod_log = AsyncMock(return_value=log_text, side_effect=log_error)
        mock_core.return_value = core
        return core

    @patch("ark_api.api.v1.workflow_runs.CoreV1Api")
    @patch("ark_api.api.v1.workflow_runs.create_dynamic_client")
    def test_returns_nodes_with_timings_trace_ids_and_log_excerpt(self, mock_dyn, mock_core, _api):
        self._dynamic_client(mock_dyn, workflow())
        core = self._core(mock_core, [pod()], log_text="one\ntwo\nthree\n")

        r = self.client.get(RUN_PATH + "?log_lines=2")

        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual((body["name"], body["uid"], body["phase"]), ("wf", "uid-1", "Succeeded"))
        self.assertEqual(body["trace_id"], "4bf92f3577b34da6a3ce929d0e0e4736")
        self.assertEqual([n["id"] for n in body["nodes"]], ["wf", "wf-123"])
        step = body["nodes"][1]
        self.assertEqual(step["template_name"], "query")
        self.assertEqual(step["pod_name"], "wf-query-123")
        self.assertEqual(step["span_id"], "00f067aa0ba902b7")
        self.assertEqual(step["exit_code"], "0")
        self.assertEqual(step["log"], {"excerpt": "two\nthree", "truncated": True, "source": "pod"})
        self.assertIsNone(body["nodes"][0]["log"])
        core.read_namespaced_pod_log.assert_awaited_once_with(
            name="wf-query-123", namespace="default", container="main", tail_lines=5000
        )

    @patch("ark_api.api.v1.workflow_runs.CoreV1Api")
    @patch("ark_api.api.v1.workflow_runs.create_dynamic_client")
    def test_drops_argo_executor_lines_from_log_excerpt(self, mock_dyn, mock_core, _api):
        self._dynamic_client(mock_dyn, workflow())
        self._core(mock_core, [pod()], log_text=(
            "step output\n"
            'time=2026-11-18T09:29:00Z level=INFO msg="sub-process exited" argo=true error=<nil>\n'
            'time=2026-11-18T09:29:00Z level=INFO msg="saving parameter" argo=true src=/tmp/text.txt\n'
        ))

        step = self.client.get(RUN_PATH + "?log_lines=2").json()["nodes"][1]

        self.assertEqual(step["log"], {"excerpt": "step output", "truncated": False, "source": "pod"})

    @patch("ark_api.api.v1.workflow_runs.CoreV1Api")
    @patch("ark_api.api.v1.workflow_runs.create_dynamic_client")
    def test_redacts_credentials_in_parameters_messages_and_logs(self, mock_dyn, mock_core, _api):
        self._dynamic_client(mock_dyn, workflow())
        self._core(mock_core, [pod()], log_text="Authorization: Bearer abc.def\n")

        step = self.client.get(RUN_PATH).json()["nodes"][1]

        self.assertEqual(step["inputs"], [
            {"name": "input", "value": "hello"},
            {"name": "api_key", "value": "[REDACTED]"},
        ])
        self.assertEqual(step["outputs"], [{"name": "response", "value": "password=[REDACTED]"}])
        self.assertEqual(step["message"], "token=[REDACTED]")
        self.assertNotIn("abc.def", step["log"]["excerpt"])

    @patch("ark_api.api.v1.workflow_runs.CoreV1Api")
    @patch("ark_api.api.v1.workflow_runs.create_dynamic_client")
    def test_no_log_when_pod_is_gone(self, mock_dyn, mock_core, _api):
        self._dynamic_client(mock_dyn, workflow())
        core = self._core(mock_core, [])

        step = self.client.get(RUN_PATH).json()["nodes"][1]

        self.assertIsNone(step["log"])
        self.assertIsNone(step["pod_name"])
        core.read_namespaced_pod_log.assert_not_called()

    @patch("ark_api.api.v1.workflow_runs.CoreV1Api")
    @patch("ark_api.api.v1.workflow_runs.create_dynamic_client")
    def test_no_log_when_container_logs_are_unavailable(self, mock_dyn, mock_core, _api):
        self._dynamic_client(mock_dyn, workflow())
        self._core(mock_core, [pod()], log_error=ApiException(status=400, reason="container logs gone"))

        step = self.client.get(RUN_PATH).json()["nodes"][1]

        self.assertIsNone(step["log"])

    @patch("ark_api.api.v1.workflow_runs.CoreV1Api")
    @patch("ark_api.api.v1.workflow_runs.create_dynamic_client")
    def test_log_lines_zero_skips_logs(self, mock_dyn, mock_core, _api):
        self._dynamic_client(mock_dyn, workflow())
        core = self._core(mock_core, [pod()], log_text="x\n")

        step = self.client.get(RUN_PATH + "?log_lines=0").json()["nodes"][1]

        self.assertIsNone(step["log"])
        core.read_namespaced_pod_log.assert_not_called()

    @patch("ark_api.api.v1.workflow_runs.CoreV1Api")
    @patch("ark_api.api.v1.workflow_runs.create_dynamic_client")
    def test_forbidden_pod_log_is_not_hidden(self, mock_dyn, mock_core, _api):
        self._dynamic_client(mock_dyn, workflow())
        self._core(mock_core, [pod()], log_error=ApiException(status=403, reason="Forbidden"))

        r = self.client.get(RUN_PATH)

        self.assertEqual(r.status_code, 403)

    @patch("ark_api.api.v1.workflow_runs.CoreV1Api")
    @patch("ark_api.api.v1.workflow_runs.create_dynamic_client")
    def test_missing_workflow_returns_not_found(self, mock_dyn, mock_core, _api):
        self._dynamic_client(mock_dyn, error=ApiException(status=404, reason="Not Found"))
        self._core(mock_core, [])

        r = self.client.get(RUN_PATH)

        self.assertEqual(r.status_code, 404)


if __name__ == "__main__":
    unittest.main()
