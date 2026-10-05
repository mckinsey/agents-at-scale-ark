"""The generic resource routes only serve allowlisted (group, version, Kind, verb) tuples."""
import os
import unittest
from unittest.mock import AsyncMock, Mock, patch

from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

os.environ["AUTH_MODE"] = "open"

from ark_api.auth.generic_resources import (  # noqa: E402
    ALLOWED_GENERIC_RESOURCES,
    CORE_GROUP,
    DENIED_DETAIL,
    GenericResourceGuard,
)
from ark_api.main import app  # noqa: E402

SENSITIVE_CORE_KINDS = {"Secret", "ConfigMap", "ServiceAccount"}

SECRET_BODY = {
    "apiVersion": "v1",
    "kind": "Secret",
    "metadata": {"name": "leak"},
    "data": {"token": "c2VjcmV0"},
}


def _base(group: str, version: str, kind: str) -> str:
    if group == CORE_GROUP:
        return f"/v1/resources/api/{version}/{kind}"
    return f"/v1/resources/apis/{group}/{version}/{kind}"


def _request_for(verb: str, group: str, version: str, kind: str) -> tuple[str, str, dict | None]:
    base = _base(group, version, kind)
    body = {"apiVersion": f"{group}/{version}".lstrip("/"), "kind": kind, "metadata": {"name": "x"}}
    return {
        "list": ("GET", base, None),
        "get": ("GET", f"{base}/x", None),
        "create": ("POST", base, body),
        "update": ("PUT", f"{base}/x", body),
        "delete": ("DELETE", f"{base}/x", None),
    }[verb]


def _expected_verb(method: str, path: str) -> str:
    if method == "GET":
        return "get" if path.endswith("{resource_name}") else "list"
    return {"POST": "create", "PUT": "update", "DELETE": "delete"}[method]


def _kind_routes() -> list[APIRoute]:
    return [
        route
        for route in app.routes
        if isinstance(route, APIRoute) and route.path.startswith("/v1/resources/") and "{kind}" in route.path
    ]


def _guards(route: APIRoute) -> list[GenericResourceGuard]:
    return [dep.call for dep in route.dependant.dependencies if isinstance(dep.call, GenericResourceGuard)]


DENIED_REQUESTS = [
    ("GET", "/v1/resources/api/v1/Secret", None),
    ("GET", "/v1/resources/api/v1/SecretList", None),
    ("GET", "/v1/resources/api/v1/secret", None),
    ("GET", "/v1/resources/api/v1/ConfigMap", None),
    ("GET", "/v1/resources/api/v1/ServiceAccount", None),
    ("GET", "/v1/resources/api/v1/Pod", None),
    ("GET", "/v1/resources/api/v1/Event", None),
    ("GET", "/v1/resources/apis/core/v1/Secret", None),
    ("GET", "/v1/resources/apis/v1/Secret/x", None),
    ("POST", "/v1/resources/apis/core/v1/Secret", SECRET_BODY),
    ("PUT", "/v1/resources/apis/core/v1/Secret/leak", SECRET_BODY),
    ("DELETE", "/v1/resources/apis/core/v1/Secret/leak", None),
    ("GET", "/v1/resources/apis/apps/v1/Deployment", None),
    ("POST", "/v1/resources/apis/apps/v1/Deployment", {"kind": "Deployment"}),
    ("GET", "/v1/resources/apis/rbac.authorization.k8s.io/v1/Role", None),
    ("POST", "/v1/resources/apis/ark.mckinsey.com/v1alpha1/Query", {"kind": "Query"}),
    ("POST", "/v1/resources/apis/ark.mckinsey.com/v1alpha1/Agent", {"kind": "Agent"}),
    ("PUT", "/v1/resources/apis/ark.mckinsey.com/v1alpha1/Agent/x", {"kind": "Agent"}),
    ("DELETE", "/v1/resources/apis/ark.mckinsey.com/v1alpha1/Agent/x", None),
    ("GET", "/v1/resources/apis/ark.mckinsey.com/v1alpha1/Agent", None),
    ("GET", "/v1/resources/apis/ark.mckinsey.com/v1alpha1/Team", None),
    ("GET", "/v1/resources/apis/ark.mckinsey.com/v1alpha1/Model/x", None),
    ("GET", "/v1/resources/apis/ark.mckinsey.com/v1alpha1/Tool/x", None),
    ("PUT", "/v1/resources/apis/ark.mckinsey.com/v1alpha1/ArkConfig/default", {"kind": "ArkConfig"}),
    ("GET", "/v1/resources/apis/ark.mckinsey.com/v1alpha1/ExecutionEngine", None),
    ("POST", "/v1/resources/apis/ark.mckinsey.com/v1prealpha1/ExecutionEngine", {"kind": "ExecutionEngine"}),
    ("PUT", "/v1/resources/apis/ark.mckinsey.com/v1prealpha1/ExecutionEngine/x", {"kind": "ExecutionEngine"}),
    ("PUT", "/v1/resources/apis/argoproj.io/v1alpha1/Workflow/x", {"kind": "Workflow"}),
    ("DELETE", "/v1/resources/apis/argoproj.io/v1alpha1/Workflow/x", None),
    ("GET", "/v1/resources/apis/argoproj.io/v1/Workflow", None),
    ("GET", "/v1/resources/apis/argoproj.io/v1alpha1/workflowtemplate", None),
    ("POST", "/v1/resources/apis/argoproj.io/v1alpha1/CronWorkflow", {"kind": "CronWorkflow"}),
]

UNROUTED_REQUESTS = [
    ("GET", "/v1/resources/apis//v1/Secret", None),
    ("GET", "/v1/resources/api/v1/Secret/leak", None),
    ("GET", "/v1/resources/api/v1/Service/x", None),
    ("POST", "/v1/resources/api/v1/Secret", SECRET_BODY),
    ("POST", "/v1/resources/api/v1/Service", {"kind": "Service"}),
    ("PUT", "/v1/resources/api/v1/Secret/leak", SECRET_BODY),
    ("PUT", "/v1/resources/api/v1/ConfigMap/x", {"kind": "ConfigMap"}),
    ("DELETE", "/v1/resources/api/v1/Secret/leak", None),
    ("DELETE", "/v1/resources/api/v1/Service/x", None),
]


@patch("ark_api.api.v1.client_utils.create_api_client")
@patch("ark_api.api.v1.resources.DynamicClient")
@patch("ark_api.api.v1.resources.get_context", Mock(return_value={"namespace": "default"}))
class TestGenericResourcesAllowlist(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def _wire_dynamic_client(self, mock_dynamic_client_cls, payload):
        resource = Mock()
        resource.to_dict.return_value = payload
        resource.metadata.resourceVersion = "1"
        api_resource = AsyncMock()
        api_resource.get = AsyncMock(return_value=resource)
        api_resource.create = AsyncMock(return_value=resource)
        api_resource.replace = AsyncMock(return_value=resource)
        api_resource.delete = AsyncMock(return_value=None)
        dynamic_client = AsyncMock()
        dynamic_client.resources.get = AsyncMock(return_value=api_resource)

        async def _construct(*args, **kwargs):
            return dynamic_client

        mock_dynamic_client_cls.side_effect = _construct
        return dynamic_client

    def test_allowed_tuples_reach_kubernetes(self, mock_dynamic_client_cls, _mock_api_client):
        for (group, version, kind), verbs in ALLOWED_GENERIC_RESOURCES.items():
            for verb in sorted(verbs):
                method, path, body = _request_for(verb, group, version, kind)
                with self.subTest(method=method, path=path):
                    mock_dynamic_client_cls.reset_mock()
                    dynamic_client = self._wire_dynamic_client(mock_dynamic_client_cls, {"kind": kind})

                    response = self.client.request(method, path, json=body)

                    self.assertEqual(response.status_code, 204 if verb == "delete" else 200, response.text)
                    dynamic_client.resources.get.assert_awaited_once_with(
                        api_version=f"{group}/{version}" if group else version, kind=kind
                    )

    def test_denied_requests_never_reach_kubernetes(self, mock_dynamic_client_cls, _mock_api_client):
        for method, path, body in DENIED_REQUESTS:
            with self.subTest(method=method, path=path):
                mock_dynamic_client_cls.reset_mock()
                self._wire_dynamic_client(mock_dynamic_client_cls, SECRET_BODY)

                response = self.client.request(method, path, json=body)

                self.assertEqual(response.status_code, 403, response.text)
                self.assertEqual(response.json(), {"detail": DENIED_DETAIL})
                self.assertNotIn("data", response.json())
                mock_dynamic_client_cls.assert_not_called()

    def test_unrouted_requests_never_reach_kubernetes(self, mock_dynamic_client_cls, _mock_api_client):
        for method, path, body in UNROUTED_REQUESTS:
            with self.subTest(method=method, path=path):
                mock_dynamic_client_cls.reset_mock()
                self._wire_dynamic_client(mock_dynamic_client_cls, SECRET_BODY)

                response = self.client.request(method, path, json=body)

                self.assertIn(response.status_code, (403, 404, 405), response.text)
                self.assertNotIn("c2VjcmV0", response.text)
                mock_dynamic_client_cls.assert_not_called()

    def test_denied_request_is_logged_as_warning(self, mock_dynamic_client_cls, _mock_api_client):
        with self.assertLogs("ark_api.auth.generic_resources", level="WARNING") as logs:
            response = self.client.get("/v1/resources/api/v1/Secret?namespace=default")

        self.assertEqual(response.status_code, 403)
        self.assertIn("kind='Secret'", logs.output[0])
        mock_dynamic_client_cls.assert_not_called()


class TestGenericResourcesAllowlistCoverage(unittest.TestCase):
    def test_every_kind_route_declares_the_guard_for_its_verb(self):
        routes = _kind_routes()
        self.assertTrue(routes)
        for route in routes:
            for method in route.methods - {"HEAD"}:
                with self.subTest(method=method, path=route.path):
                    guards = _guards(route)
                    self.assertEqual(len(guards), 1, "generic route without GenericResourceGuard")
                    self.assertEqual(guards[0].verb, _expected_verb(method, route.path))

    def test_core_path_only_serves_list(self):
        core_routes = {
            (method, route.path)
            for route in _kind_routes()
            if route.path.startswith("/v1/resources/api/")
            for method in route.methods - {"HEAD"}
        }
        self.assertEqual(core_routes, {("GET", "/v1/resources/api/{version}/{kind}")})

    def test_sensitive_core_kinds_are_never_allowlisted(self):
        for group, version, kind in ALLOWED_GENERIC_RESOURCES:
            with self.subTest(group=group, version=version, kind=kind):
                self.assertFalse(
                    group == CORE_GROUP and any(kind.startswith(sensitive) for sensitive in SENSITIVE_CORE_KINDS)
                )

    def test_core_allowlist_has_no_write_verbs(self):
        for (group, _version, _kind), verbs in ALLOWED_GENERIC_RESOURCES.items():
            if group == CORE_GROUP:
                self.assertLessEqual(verbs, {"list"})


if __name__ == "__main__":
    unittest.main()
