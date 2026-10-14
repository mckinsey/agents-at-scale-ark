"""Tests for listing workflows through Argo Server."""
import os
import unittest
from unittest.mock import AsyncMock, Mock, patch

import httpx
from fastapi.testclient import TestClient

os.environ["AUTH_MODE"] = "open"

ARGO_URL = "http://argo-server.test:2746"
WORKFLOW_LIST_PATH = "/v1/resources/apis/argoproj.io/v1alpha1/Workflow"
REAL_ASYNC_CLIENT = httpx.AsyncClient


def workflow(name, started_at=None):
    return {"metadata": {"name": name, "namespace": "default"}, "status": {"startedAt": started_at}}


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


@patch.dict(os.environ, {"ARGO_SERVER_URL": ARGO_URL})
@patch('ark_api.api.v1.client_utils.create_api_client')
@patch('ark_api.api.v1.resources.get_context', return_value={"namespace": "default"})
class TestListWorkflowsFromArgoServer(unittest.TestCase):
    def setUp(self):
        from ark_api.main import app
        self.client = TestClient(app)
        self.requests = []

    def argo_handler(self, items, status_code=200, remaining=0):
        def handler(request):
            self.requests.append(request)
            metadata = {"remainingItemCount": str(remaining)} if remaining else {}
            return httpx.Response(status_code, json={"metadata": metadata, "items": items})
        return handler

    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.client.AuthorizationV1Api')
    def test_sorts_page_by_start_time_and_returns_next_offset(self, mock_auth_api_cls, mock_dynamic_client_cls, _ctx, _api):
        mock_auth_api_cls.return_value = access_review(True)
        items = [
            workflow("older", "2026-10-02T08:00:00Z"),
            workflow("newer", "2026-10-03T08:00:00Z"),
        ]
        handler = self.argo_handler(items, remaining=5)

        with patch('ark_api.api.v1.argo_server.httpx.AsyncClient', argo_client_factory(handler)):
            response = self.client.get(
                f"{WORKFLOW_LIST_PATH}?limit=2&continue=4&status=running"
                "&workflowTemplateName=tpl&workflowName=Demo"
            )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual([i["metadata"]["name"] for i in data["items"]], ["newer", "older"])
        self.assertEqual(data["metadata"]["continue"], "6")
        mock_dynamic_client_cls.assert_not_called()

        request = self.requests[0]
        self.assertEqual(request.url.path, "/api/v1/workflows/default")
        self.assertEqual(request.url.params["listOptions.limit"], "2")
        self.assertEqual(request.url.params["listOptions.continue"], "4")
        self.assertEqual(
            request.url.params["listOptions.labelSelector"],
            "workflows.argoproj.io/workflow-template=tpl,workflows.argoproj.io/phase=Running",
        )
        self.assertEqual(
            request.url.params["listOptions.fieldSelector"],
            "metadata.name=demo,ext.showRemainingItemCount=true",
        )
        self.assertEqual(request.url.params["nameFilter"], "Contains")

        review = mock_auth_api_cls.return_value.create_self_subject_access_review.call_args.args[0]
        attributes = review.spec.resource_attributes
        self.assertEqual(
            (attributes.namespace, attributes.group, attributes.resource, attributes.verb),
            ("default", "argoproj.io", "workflows", "list"),
        )

    @patch('ark_api.api.v1.resources.client.AuthorizationV1Api')
    def test_last_page_has_no_continue(self, mock_auth_api_cls, _ctx, _api):
        mock_auth_api_cls.return_value = access_review(True)

        handler = self.argo_handler([workflow("first"), workflow("second")])

        with patch('ark_api.api.v1.argo_server.httpx.AsyncClient', argo_client_factory(handler)):
            response = self.client.get(f"{WORKFLOW_LIST_PATH}?limit=2")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["metadata"], {})
        self.assertEqual(self.requests[0].url.params["listOptions.continue"], "0")

    @patch('ark_api.api.v1.resources.client.AuthorizationV1Api')
    def test_denied_access_review_returns_403_without_calling_argo(self, mock_auth_api_cls, _ctx, _api):
        mock_auth_api_cls.return_value = access_review(False)

        with patch('ark_api.api.v1.argo_server.httpx.AsyncClient', argo_client_factory(self.argo_handler([]))):
            response = self.client.get(f"{WORKFLOW_LIST_PATH}?limit=2")

        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.requests, [])

    @patch('ark_api.api.v1.resources.client.AuthorizationV1Api')
    def test_unsafe_name_filter_returns_no_items_without_calling_argo(self, mock_auth_api_cls, _ctx, _api):
        mock_auth_api_cls.return_value = access_review(True)

        with patch('ark_api.api.v1.argo_server.httpx.AsyncClient', argo_client_factory(self.argo_handler([workflow("x")]))):
            response = self.client.get(
                f"{WORKFLOW_LIST_PATH}?workflowName=a,metadata.namespace=other"
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["items"], [])
        self.assertEqual(self.requests, [])

    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.client.AuthorizationV1Api')
    def test_falls_back_to_kubernetes_when_argo_fails(self, mock_auth_api_cls, mock_dynamic_client_cls, _ctx, _api):
        mock_auth_api_cls.return_value = access_review(True)
        api_resource = self.kubernetes_list(mock_dynamic_client_cls, [workflow("from-k8s")])

        with patch('ark_api.api.v1.argo_server.httpx.AsyncClient', argo_client_factory(self.argo_handler([], status_code=503))):
            response = self.client.get(f"{WORKFLOW_LIST_PATH}?limit=2")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["items"][0]["metadata"]["name"], "from-k8s")
        api_resource.get.assert_called_once()

    @patch('ark_api.api.v1.resources.DynamicClient')
    @patch('ark_api.api.v1.resources.client.AuthorizationV1Api')
    def test_kubernetes_continue_token_uses_kubernetes(self, mock_auth_api_cls, mock_dynamic_client_cls, _ctx, _api):
        api_resource = self.kubernetes_list(mock_dynamic_client_cls, [workflow("from-k8s")])

        with patch('ark_api.api.v1.argo_server.httpx.AsyncClient', argo_client_factory(self.argo_handler([]))):
            response = self.client.get(f"{WORKFLOW_LIST_PATH}?limit=2&continue=eyJ2IjoxfQ")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.requests, [])
        mock_auth_api_cls.assert_not_called()
        self.assertEqual(api_resource.get.call_args.kwargs["_continue"], "eyJ2IjoxfQ")

    def kubernetes_list(self, mock_dynamic_client_cls, items):
        dynamic_client = AsyncMock()

        async def create_dynamic_client(*args, **kwargs):
            return dynamic_client

        mock_dynamic_client_cls.side_effect = create_dynamic_client
        api_resource = AsyncMock()
        resources = Mock()
        resources.to_dict.return_value = {"items": items}
        api_resource.get = AsyncMock(return_value=resources)
        dynamic_client.resources.get = AsyncMock(return_value=api_resource)
        return api_resource


class TestFilterItemsByName(unittest.TestCase):
    def test_keeps_partial_case_insensitive_matches(self):
        from ark_api.api.v1.resources import _filter_items_by_name
        resources = {"items": [workflow("Alpha-demo"), workflow("zeta-demo")]}

        _filter_items_by_name(resources, "ALPHA")

        self.assertEqual([i["metadata"]["name"] for i in resources["items"]], ["Alpha-demo"])

    def test_leaves_response_without_items_untouched(self):
        from ark_api.api.v1.resources import _filter_items_by_name
        resources = {"metadata": {}}

        _filter_items_by_name(resources, "alpha")

        self.assertEqual(resources, {"metadata": {}})


if __name__ == "__main__":
    unittest.main()
