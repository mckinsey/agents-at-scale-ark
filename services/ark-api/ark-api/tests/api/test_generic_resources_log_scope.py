"""The log routes only read pods that belong to an Argo workflow."""
import os
import unittest
from unittest.mock import AsyncMock, Mock, patch

from fastapi.testclient import TestClient
from kubernetes_asyncio.client import V1ObjectMeta, V1Pod
from kubernetes_asyncio.client.rest import ApiException

os.environ["AUTH_MODE"] = "open"

from ark_api.main import app  # noqa: E402

WORKFLOW_POD_LABEL = "workflows.argoproj.io/workflow"

POD_LOG = "/v1/resources/api/v1/namespaces/default/pods/{pod}/log"
POD_LOG_WINDOW = "/v1/resources/api/v1/namespaces/default/pods/{pod}/log/window"
NODE_LOG = "/v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/{workflow}/{node}/log"
NODE_LOG_WINDOW = "/v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/{workflow}/{node}/log/window"


def pod(name, labels=None):
    return V1Pod(metadata=V1ObjectMeta(name=name, labels=labels))


def workflow_pod(name, workflow):
    return pod(name, {WORKFLOW_POD_LABEL: workflow})


class FakeLogStream:
    def __init__(self, text):
        self.status = 200
        self.content = Mock()
        self.content.iter_chunked = self._iter_chunked
        self._payload = text.encode()

    async def _iter_chunked(self, _size):
        yield self._payload

    def release(self):
        return None


def stream_reader(text):
    async def read(*_args, **kwargs):
        if kwargs.get("_preload_content") is False:
            return FakeLogStream(text)
        return text
    return AsyncMock(side_effect=read)


@patch("ark_api.api.v1.client_utils.create_api_client")
@patch("ark_api.api.v1.resources.CoreV1Api")
class TestPodLogRoutesServeOnlyWorkflowPods(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def _core_v1(self, mock_core_v1_cls, read_pod):
        core_v1 = AsyncMock()
        core_v1.read_namespaced_pod = read_pod
        core_v1.read_namespaced_pod_log = stream_reader("2024-01-01T00:00:00.000000000Z step output\n")
        mock_core_v1_cls.return_value = core_v1
        return core_v1

    def test_a_workflow_pod_is_served(self, mock_core_v1_cls, _mock_api_client):
        for route in (POD_LOG, POD_LOG_WINDOW):
            with self.subTest(route=route):
                core_v1 = self._core_v1(mock_core_v1_cls, AsyncMock(return_value=workflow_pod("wf-step-1", "wf")))

                response = self.client.get(route.format(pod="wf-step-1"))

                self.assertEqual(response.status_code, 200, response.text)
                self.assertIn("step output", response.text)
                self.assertEqual(core_v1.read_namespaced_pod_log.await_args.kwargs["name"], "wf-step-1")

    def test_a_pod_outside_any_workflow_is_not_found_and_never_read(self, mock_core_v1_cls, _mock_api_client):
        for labels in (None, {}, {"app": "ark-api"}, {WORKFLOW_POD_LABEL: ""}):
            for route in (POD_LOG, POD_LOG_WINDOW):
                with self.subTest(labels=labels, route=route):
                    core_v1 = self._core_v1(mock_core_v1_cls, AsyncMock(return_value=pod("ark-api-123", labels)))

                    response = self.client.get(route.format(pod="ark-api-123"))

                    self.assertEqual(response.status_code, 404, response.text)
                    self.assertEqual(response.json()["detail"], "No workflow pod named ark-api-123 in namespace default")
                    core_v1.read_namespaced_pod_log.assert_not_awaited()

    def test_a_missing_pod_looks_the_same_as_a_pod_outside_any_workflow(self, mock_core_v1_cls, _mock_api_client):
        for route in (POD_LOG, POD_LOG_WINDOW):
            with self.subTest(route=route):
                core_v1 = self._core_v1(
                    mock_core_v1_cls, AsyncMock(side_effect=ApiException(status=404, reason="Not Found"))
                )

                response = self.client.get(route.format(pod="gone"))

                self.assertEqual(response.status_code, 404, response.text)
                self.assertEqual(response.json()["detail"], "No workflow pod named gone in namespace default")
                core_v1.read_namespaced_pod_log.assert_not_awaited()

    def test_a_forbidden_pod_read_stays_forbidden(self, mock_core_v1_cls, _mock_api_client):
        for route in (POD_LOG, POD_LOG_WINDOW):
            with self.subTest(route=route):
                core_v1 = self._core_v1(
                    mock_core_v1_cls, AsyncMock(side_effect=ApiException(status=403, reason="Forbidden"))
                )

                response = self.client.get(route.format(pod="wf-step-1"))

                self.assertEqual(response.status_code, 403, response.text)
                core_v1.read_namespaced_pod_log.assert_not_awaited()


@patch("ark_api.api.v1.client_utils.create_api_client")
@patch("ark_api.api.v1.resources.DynamicClient")
@patch("ark_api.api.v1.resources.CoreV1Api")
class TestNodeLogRoutesStayInsideTheWorkflow(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def _core_v1(self, mock_core_v1_cls, direct_pod, listed_pods):
        core_v1 = AsyncMock()
        if direct_pod is None:
            core_v1.read_namespaced_pod = AsyncMock(side_effect=ApiException(status=404, reason="Not Found"))
        else:
            core_v1.read_namespaced_pod = AsyncMock(return_value=direct_pod)
        core_v1.list_namespaced_pod = AsyncMock(return_value=Mock(items=listed_pods))
        core_v1.read_namespaced_pod_log = stream_reader("2024-01-01T00:00:00.000000000Z step output\n")
        mock_core_v1_cls.return_value = core_v1
        return core_v1

    def _workflow_without_the_node(self, mock_dynamic_client_cls):
        workflow = Mock()
        workflow.to_dict.return_value = {"status": {"nodes": {}}}
        workflow_resource = AsyncMock()
        workflow_resource.get = AsyncMock(return_value=workflow)
        dynamic_client = AsyncMock()
        dynamic_client.resources.get = AsyncMock(return_value=workflow_resource)

        async def construct(*_args, **_kwargs):
            return dynamic_client

        mock_dynamic_client_cls.side_effect = construct

    def _read_pod_names(self, core_v1):
        return [call.kwargs["name"] for call in core_v1.read_namespaced_pod_log.await_args_list]

    def test_a_node_id_naming_a_pod_of_the_workflow_is_read_directly(self, mock_core_v1_cls, _dyn, _api):
        for route in (NODE_LOG, NODE_LOG_WINDOW):
            with self.subTest(route=route):
                core_v1 = self._core_v1(mock_core_v1_cls, workflow_pod("wf-123", "wf"), [])

                response = self.client.get(route.format(workflow="wf", node="wf-123"))

                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(set(self._read_pod_names(core_v1)), {"wf-123"})
                core_v1.list_namespaced_pod.assert_not_awaited()

    def test_a_node_id_naming_a_pod_outside_the_workflow_is_never_read(self, mock_core_v1_cls, mock_dynamic_client_cls, _api):
        for labels in ({"app": "ark-api"}, None, {WORKFLOW_POD_LABEL: "other-wf"}):
            direct_pod = pod("ark-api-123", labels)
            for route in (NODE_LOG, NODE_LOG_WINDOW):
                with self.subTest(labels=labels, route=route):
                    self._workflow_without_the_node(mock_dynamic_client_cls)
                    core_v1 = self._core_v1(mock_core_v1_cls, direct_pod, [])

                    response = self.client.get(route.format(workflow="wf", node="ark-api-123"))

                    self.assertEqual(response.status_code, 404, response.text)
                    self.assertNotIn("step output", response.text)
                    self.assertEqual(self._read_pod_names(core_v1), [])
                    core_v1.list_namespaced_pod.assert_awaited_once_with(
                        namespace="default", label_selector=f"{WORKFLOW_POD_LABEL}=wf"
                    )

    def test_a_node_is_resolved_only_among_the_workflow_pods(self, mock_core_v1_cls, _dyn, _api):
        listed = [workflow_pod("other-wf-step-abc", "other-wf"), workflow_pod("wf-step-abc", "wf")]
        for route in (NODE_LOG, NODE_LOG_WINDOW):
            with self.subTest(route=route):
                core_v1 = self._core_v1(mock_core_v1_cls, None, listed)

                response = self.client.get(route.format(workflow="wf", node="wf-abc"))

                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(set(self._read_pod_names(core_v1)), {"wf-step-abc"})


if __name__ == "__main__":
    unittest.main()
