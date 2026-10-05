"""Generic resource writes run as the signed-in user whenever authentication is enabled.

Requests go through the real auth middleware, so the identity each test relies on
is the one a JWT or an API key actually produces, not a stubbed dependency.
"""
import base64
import os
import unittest
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, Mock, patch

from fastapi import FastAPI
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from kubernetes_asyncio.client.rest import ApiException
from starlette.requests import Request

from ark_api.api.v1.resources import router as resources_router
from ark_api.auth.generic_resources import (
    IMPERSONATION_DISABLED_DETAIL,
    NO_USER_IDENTITY_DETAIL,
    GenericResourceGuard,
    generic_write_identity_denial,
    require_generic_write_identity,
)
from ark_api.auth.middleware import AuthMiddleware

OIDC = {"OIDC_ISSUER_URL": "http://issuer", "OIDC_APPLICATION_ID": "app"}
OPEN = {"AUTH_MODE": "open"}
SSO_WITHOUT_IMPERSONATION = {"AUTH_MODE": "sso", **OIDC, "IMPERSONATION_ENABLED": "false"}
SSO_WITH_IMPERSONATION = {"AUTH_MODE": "sso", **OIDC, "IMPERSONATION_ENABLED": "true"}
HYBRID_WITHOUT_IMPERSONATION = {"AUTH_MODE": "hybrid", **OIDC, "IMPERSONATION_ENABLED": "false"}
HYBRID_WITH_IMPERSONATION = {"AUTH_MODE": "hybrid", **OIDC, "IMPERSONATION_ENABLED": "true"}
BASIC = {"AUTH_MODE": "basic", "IMPERSONATION_ENABLED": "false"}

CLAIMS_BY_TOKEN = {
    "alice": {"email": "alice@example.com", "groups": ["team-a"]},
    "blank": {"email": "   "},
    "no-email": {"sub": "123"},
}

API_KEY = {"public_key": "pk-ark-test", "secret_name": "ark-api-key-test", "created_by": "alice@example.com"}

WT = "/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate"
WF = "/v1/resources/apis/argoproj.io/v1alpha1/Workflow"
EE = "/v1/resources/apis/ark.mckinsey.com/v1prealpha1/ExecutionEngine"

TEMPLATE = {"apiVersion": "argoproj.io/v1alpha1", "kind": "WorkflowTemplate", "metadata": {"name": "t", "resourceVersion": "7"}}
RUN = {"apiVersion": "argoproj.io/v1alpha1", "kind": "Workflow", "metadata": {"name": "r"}}

WRITES = [
    ("POST", WT, TEMPLATE, 200),
    ("PUT", f"{WT}/t", TEMPLATE, 200),
    ("DELETE", f"{WT}/t", None, 204),
    ("POST", WF, RUN, 200),
    ("DELETE", f"{EE}/e", None, 204),
]

WRITE_VERBS = {"create", "update", "delete"}

READS = [
    ("GET", WT),
    ("GET", f"{WT}/t"),
    ("GET", WF),
    ("GET", f"{WF}/r"),
    ("GET", EE),
]

def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def basic_key() -> dict:
    encoded = base64.b64encode(b"pk-ark-test:sk-ark-test").decode()
    return {"Authorization": f"Basic {encoded}"}


class KubernetesSpy:
    """Records which identity each Kubernetes client was built for and serves canned results."""

    def __init__(self):
        self.identities = []
        self.result = Mock()
        self.result.to_dict.return_value = {"kind": "Thing", "metadata": {"name": "t"}}
        self.result.metadata.resourceVersion = "7"
        self.api_resource = AsyncMock()
        self.api_resource.get = AsyncMock(return_value=self.result)
        self.api_resource.create = AsyncMock(return_value=self.result)
        self.api_resource.replace = AsyncMock(return_value=self.result)
        self.api_resource.delete = AsyncMock(return_value=None)
        self.dynamic_client = AsyncMock()
        self.dynamic_client.resources.get = AsyncMock(return_value=self.api_resource)
        self.dynamic_client_cls = MagicMock(side_effect=self._construct)

    async def _construct(self, *_args, **_kwargs):
        return self.dynamic_client

    @asynccontextmanager
    async def client(self, impersonation=None):
        self.identities.append(impersonation)
        yield AsyncMock()

    def usernames(self):
        return [None if identity is None else identity.username for identity in self.identities]


class IdentityGateTestCase(unittest.TestCase):
    def setUp(self):
        self.k8s = KubernetesSpy()
        for target, value in (
            ("ark_api.api.v1.resources.get_impersonating_api_client", self.k8s.client),
            ("ark_api.api.v1.resources.DynamicClient", self.k8s.dynamic_client_cls),
            ("ark_api.api.v1.resources.get_context", Mock(return_value={"namespace": "default"})),
        ):
            patcher = patch(target, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def client_for(self, env: dict) -> TestClient:
        env_patch = patch.dict(os.environ, env)
        env_patch.start()
        self.addCleanup(env_patch.stop)
        for name in ("IMPERSONATION_FALLBACK", "IMPERSONATION_PREFIX"):
            if name not in env:
                os.environ.pop(name, None)

        validator = MagicMock()
        validator.validate_token.side_effect = lambda token: CLAIMS_BY_TOKEN[token]
        api_keys = MagicMock()
        api_keys.namespace = "default"
        api_keys.verify_api_key = AsyncMock(return_value=API_KEY)
        for target, value in (
            ("ark_api.auth.middleware.TokenValidator", MagicMock(return_value=validator)),
            ("ark_api.auth.middleware.APIKeyService", MagicMock(return_value=api_keys)),
        ):
            patcher = patch(target, value)
            patcher.start()
            self.addCleanup(patcher.stop)

        app = FastAPI()
        app.add_middleware(AuthMiddleware)
        app.include_router(resources_router, prefix="/v1")
        return TestClient(app)

    def assert_denied_before_kubernetes(self, response, detail):
        self.assertEqual(response.status_code, 403, response.text)
        self.assertEqual(response.json(), {"detail": detail})
        self.assertEqual(self.k8s.identities, [])
        self.k8s.dynamic_client_cls.assert_not_called()


class TestSignedInWritesNeedImpersonation(IdentityGateTestCase):
    def test_writes_without_impersonation_are_refused_before_kubernetes(self):
        for env in (SSO_WITHOUT_IMPERSONATION, HYBRID_WITHOUT_IMPERSONATION):
            for method, path, body, _ in WRITES:
                with self.subTest(mode=env["AUTH_MODE"], method=method, path=path):
                    self.setUp()
                    client = self.client_for(env)

                    response = client.request(method, path, json=body, headers=bearer("alice"))

                    self.assert_denied_before_kubernetes(response, IMPERSONATION_DISABLED_DETAIL)

    def test_a_token_without_the_username_claim_is_still_a_signed_in_user(self):
        client = self.client_for(SSO_WITHOUT_IMPERSONATION)

        response = client.post(WF, json=RUN, headers=bearer("no-email"))

        self.assert_denied_before_kubernetes(response, IMPERSONATION_DISABLED_DETAIL)

    def test_a_blank_username_is_not_an_identity(self):
        client = self.client_for(SSO_WITH_IMPERSONATION)

        response = client.post(WF, json=RUN, headers=bearer("blank"))

        self.assert_denied_before_kubernetes(response, NO_USER_IDENTITY_DETAIL)

    def test_writes_with_impersonation_reach_kubernetes_as_the_user(self):
        for env in (SSO_WITH_IMPERSONATION, HYBRID_WITH_IMPERSONATION):
            for method, path, body, status in WRITES:
                with self.subTest(mode=env["AUTH_MODE"], method=method, path=path):
                    self.setUp()
                    client = self.client_for(env)

                    response = client.request(method, path, json=body, headers=bearer("alice"))

                    self.assertEqual(response.status_code, status, response.text)
                    self.assertEqual(self.k8s.usernames(), ["alice@example.com"])

    def test_reads_are_not_gated(self):
        for method, path in READS:
            with self.subTest(method=method, path=path):
                self.setUp()
                client = self.client_for(SSO_WITHOUT_IMPERSONATION)

                response = client.request(method, path, headers=bearer("alice"))

                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(self.k8s.usernames(), [None])

    def test_denied_write_is_logged_as_warning(self):
        client = self.client_for(SSO_WITHOUT_IMPERSONATION)

        with self.assertLogs("ark_api.auth.generic_resources", level="WARNING") as logs:
            response = client.post(f"{WF}?namespace=default", json=RUN, headers=bearer("alice"))

        self.assertEqual(response.status_code, 403)
        self.assertIn("kind='Workflow'", logs.output[0])
        self.assertIn("namespace='default'", logs.output[0])


class TestServiceAccountCallersAreUnchanged(IdentityGateTestCase):
    def test_open_mode_writes_run_as_the_service_account(self):
        for method, path, body, status in WRITES:
            with self.subTest(method=method, path=path):
                self.setUp()
                client = self.client_for(OPEN)

                response = client.request(method, path, json=body)

                self.assertEqual(response.status_code, status, response.text)
                self.assertEqual(self.k8s.usernames(), [None])

    def test_api_key_writes_run_as_the_service_account(self):
        for env in (HYBRID_WITH_IMPERSONATION, HYBRID_WITHOUT_IMPERSONATION, BASIC):
            for method, path, body, status in WRITES:
                with self.subTest(mode=env["AUTH_MODE"], method=method, path=path):
                    self.setUp()
                    client = self.client_for(env)

                    response = client.request(method, path, json=body, headers=basic_key())

                    self.assertEqual(response.status_code, status, response.text)
                    self.assertEqual(self.k8s.usernames(), [None])

    def test_the_allowlist_is_checked_before_identity(self):
        client = self.client_for(SSO_WITHOUT_IMPERSONATION)

        response = client.post("/v1/resources/apis/argoproj.io/v1alpha1/CronWorkflow", json={}, headers=bearer("alice"))

        self.assertEqual(response.status_code, 403)
        self.assertNotEqual(response.json()["detail"], IMPERSONATION_DISABLED_DETAIL)


class TestWritesNeverFallBackToTheServiceAccount(IdentityGateTestCase):
    def test_a_denied_write_is_not_retried_as_the_service_account(self):
        forbidden = ApiException(status=403, reason="Forbidden")
        for method, path, body, _ in WRITES:
            with self.subTest(method=method, path=path):
                self.setUp()
                client = self.client_for({**SSO_WITH_IMPERSONATION, "IMPERSONATION_FALLBACK": "true"})
                for operation in ("create", "replace", "delete"):
                    getattr(self.k8s.api_resource, operation).side_effect = forbidden

                response = client.request(method, path, json=body, headers=bearer("alice"))

                self.assertEqual(response.status_code, 403, response.text)
                self.assertEqual(response.json()["error"], "impersonation_forbidden")
                self.assertNotIn("X-Ark-Impersonation-Fallback", response.headers)
                self.assertEqual(self.k8s.usernames(), ["alice@example.com"])

    def test_reads_keep_the_documented_fallback(self):
        client = self.client_for({**SSO_WITH_IMPERSONATION, "IMPERSONATION_FALLBACK": "true"})

        async def get_as_service_account_only(*_args, **_kwargs):
            if self.k8s.identities[-1] is not None:
                raise ApiException(status=403, reason="Forbidden")
            return self.k8s.result

        self.k8s.api_resource.get.side_effect = get_as_service_account_only

        response = client.get(f"{WT}/t", headers=bearer("alice"))

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers["X-Ark-Impersonation-Fallback"], "true")
        self.assertEqual(self.k8s.usernames(), ["alice@example.com", None])


def _request_with_state(state: dict) -> Request:
    return Request({"type": "http", "method": "POST", "path": "/", "query_string": b"", "headers": [], "state": state})


class TestIdentityRule(unittest.TestCase):
    def test_an_unset_auth_mode_is_open(self):
        with patch.dict(os.environ, {"IMPERSONATION_ENABLED": "false"}):
            os.environ.pop("AUTH_MODE", None)
            self.assertIsNone(generic_write_identity_denial(_request_with_state({})))

    def test_a_request_without_identity_or_key_is_refused_when_authentication_is_on(self):
        with patch.dict(os.environ, SSO_WITH_IMPERSONATION):
            self.assertEqual(generic_write_identity_denial(_request_with_state({})), NO_USER_IDENTITY_DETAIL)

    def test_a_non_string_username_is_refused(self):
        with patch.dict(os.environ, SSO_WITH_IMPERSONATION):
            identity = Mock(username=None)
            self.assertEqual(
                generic_write_identity_denial(_request_with_state({"user_identity": identity})),
                NO_USER_IDENTITY_DETAIL,
            )


class TestIdentityRuleCoverage(unittest.TestCase):
    def _generic_routes(self):
        return [
            route
            for route in resources_router.routes
            if isinstance(route, APIRoute) and any(isinstance(dep.call, GenericResourceGuard) for dep in route.dependant.dependencies)
        ]

    def test_every_generic_write_route_requires_the_identity_and_reads_do_not(self):
        routes = self._generic_routes()
        self.assertTrue(routes)
        for route in routes:
            calls = [dep.call for dep in route.dependant.dependencies]
            guard = next(call for call in calls if isinstance(call, GenericResourceGuard))
            with self.subTest(path=route.path, methods=sorted(route.methods)):
                self.assertEqual(require_generic_write_identity in calls, guard.verb in WRITE_VERBS)



if __name__ == "__main__":
    unittest.main()
