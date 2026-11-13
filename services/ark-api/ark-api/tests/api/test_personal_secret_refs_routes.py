import os
import unittest
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

os.environ["AUTH_MODE"] = "open"

from fastapi.testclient import TestClient
from kubernetes_asyncio.client.rest import ApiException

from ark_sdk.impersonation import ImpersonationConfig
from ark_sdk.models.a2_a_server_v1prealpha1 import A2AServerV1prealpha1
from ark_sdk.models.agent_v1alpha1 import AgentV1alpha1
from ark_sdk.models.mcp_server_v1alpha1 import MCPServerV1alpha1
from ark_sdk.models.memory_v1alpha1 import MemoryV1alpha1
from ark_sdk.models.query_v1alpha1 import QueryV1alpha1
from ark_sdk.models.tool_v1alpha1 import ToolV1alpha1
from ark_sdk.secret_scope import SecretScope
from ark_api.auth.dependencies import get_impersonation_config
from ark_api.auth.secret_scope import get_secret_scope
from ark_api.services.personal_secret_refs import PERSONAL_SECRET_REF_ERROR, SECRET_REF_CHECK_ERROR

ALICE = SecretScope.for_user("alice@example.com")
BOB = SecretScope.for_user("bob@example.com")
ALICE_SECRET = ALICE.personal_name("mcp-token")
PROMOTED_SECRET = ALICE.personal_name("promoted")
LABELS = {
    ALICE_SECRET: ALICE.create_labels(personal=True),
    PROMOTED_SECRET: SecretScope().create_labels(),
}


def _ref(name):
    return {"valueFrom": {"secretKeyRef": {"name": name, "key": "token"}}}


def _headers(name):
    return [{"name": "Authorization", "value": _ref(name)}]


def _override(name):
    return {
        "resourceType": "mcpserver",
        "labelSelector": {"matchLabels": {"ark.mckinsey.com/name": "github"}},
        "headers": [{"name": "Authorization", "value": _ref(name)}],
    }


def _query(spec):
    return QueryV1alpha1(metadata={"name": "q", "namespace": "team-a"}, spec=spec)


def _ark_client_patch(module):
    patcher = patch(f"ark_api.api.v1.{module}.with_ark_client")
    with_ark_client = patcher.start()
    client = AsyncMock()
    with_ark_client.return_value.__aenter__.return_value = client
    return patcher, with_ark_client, client


class PersonalSecretRefRouteTest(unittest.TestCase):
    def setUp(self):
        from ark_api.main import app
        self.app = app
        self.client = TestClient(app)
        read_patcher = patch(
            "ark_api.services.personal_secret_refs.read_secret_labels",
            new=AsyncMock(side_effect=lambda namespace, name: LABELS.get(name)),
        )
        self.read = read_patcher.start()
        self.addCleanup(read_patcher.stop)
        self.addCleanup(self.app.dependency_overrides.pop, get_secret_scope, None)
        self.addCleanup(self.app.dependency_overrides.pop, get_impersonation_config, None)

    def _as(self, scope):
        self.app.dependency_overrides[get_secret_scope] = lambda: scope

    def _ark_client(self, module):
        patcher, with_ark_client, client = _ark_client_patch(module)
        self.addCleanup(patcher.stop)
        return with_ark_client, client

    def _assert_rejected(self, response):
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(response.json()["detail"], PERSONAL_SECRET_REF_ERROR)


class TestQueryRoutes(PersonalSecretRefRouteTest):
    def test_owner_creates_a_query_with_a_personal_mcp_override(self):
        self._as(ALICE)
        _, client = self._ark_client("queries")
        client.queries.a_create = AsyncMock(side_effect=lambda resource: resource)

        response = self.client.post(
            "/v1/queries?namespace=team-a", json={"name": "q", "input": "hi", "overrides": [_override(ALICE_SECRET)]}
        )

        self.assertEqual(response.status_code, 200, response.text)
        written = client.queries.a_create.await_args.args[0].to_dict()["spec"]
        self.assertEqual(written["overrides"], [_override(ALICE_SECRET)])
        self.read.assert_awaited_once_with("team-a", ALICE_SECRET)

    def test_another_user_cannot_create_a_query_with_it(self):
        self._as(BOB)
        _, client = self._ark_client("queries")

        response = self.client.post(
            "/v1/queries?namespace=team-a", json={"name": "q", "input": "hi", "overrides": [_override(ALICE_SECRET)]}
        )

        self._assert_rejected(response)
        client.queries.a_create.assert_not_awaited()

    def test_personal_secret_in_query_parameters_is_rejected(self):
        self._as(ALICE)
        _, client = self._ark_client("queries")

        response = self.client.post(
            "/v1/queries?namespace=team-a",
            json={"name": "q", "input": "hi", "parameters": [{"name": "p", **_ref(ALICE_SECRET)}]},
        )

        self._assert_rejected(response)
        client.queries.a_create.assert_not_awaited()

    def test_update_checks_the_full_spec_it_writes(self):
        existing = {"input": "old", "overrides": [_override(ALICE_SECRET)]}
        for scope, status in ((ALICE, 200), (BOB, 422)):
            with self.subTest(owner=scope is ALICE):
                self._as(scope)
                _, client = self._ark_client("queries")
                client.queries.a_get = AsyncMock(return_value=_query(existing))
                client.queries.a_update = AsyncMock(side_effect=lambda resource: resource)

                response = self.client.put("/v1/queries/q?namespace=team-a", json={"input": "new"})

                self.assertEqual(response.status_code, status, response.text)
                if status == 200:
                    written = client.queries.a_update.await_args.args[0].to_dict()["spec"]
                    self.assertEqual((written["input"], written["overrides"]), ("new", [_override(ALICE_SECRET)]))
                else:
                    self.assertEqual(response.json()["detail"], PERSONAL_SECRET_REF_ERROR)
                    client.queries.a_update.assert_not_awaited()

    def test_label_read_uses_the_namespace_the_write_defaults_to(self):
        self._as(ALICE)
        _, client = self._ark_client("queries")
        client.queries.a_create = AsyncMock(side_effect=lambda resource: _query(resource.to_dict()["spec"]))

        with patch("ark_api.services.personal_secret_refs.get_context", return_value={"namespace": "ctx-ns"}):
            response = self.client.post("/v1/queries", json={"name": "q", "input": "hi", "overrides": [_override(ALICE_SECRET)]})

        self.assertEqual(response.status_code, 200, response.text)
        self.read.assert_awaited_once_with("ctx-ns", ALICE_SECRET)

    def test_service_account_403_is_a_500_and_never_falls_back(self):
        self._as(ALICE)
        self.app.dependency_overrides[get_impersonation_config] = lambda: ImpersonationConfig(
            username="alice@example.com", groups=[]
        )
        with_ark_client, client = self._ark_client("queries")
        self.read.side_effect = ApiException(status=403, reason="Forbidden")

        with patch.dict(os.environ, {"IMPERSONATION_FALLBACK": "true"}):
            response = self.client.post(
                "/v1/queries?namespace=team-a", json={"name": "q", "input": "hi", "overrides": [_override(ALICE_SECRET)]}
            )

        self.assertEqual(response.status_code, 500, response.text)
        self.assertEqual(response.json()["detail"], SECRET_REF_CHECK_ERROR)
        self.assertNotIn("X-Ark-Impersonation-Fallback", response.headers)
        self.assertEqual(with_ark_client.call_count, 1)
        client.queries.a_create.assert_not_awaited()


class TestAgentRoutes(PersonalSecretRefRouteTest):
    def _existing(self):
        return AgentV1alpha1(
            metadata={"name": "a", "namespace": "team-a"},
            spec={"prompt": "p", "overrides": [_override(ALICE_SECRET)]},
        )

    def test_create_with_a_personal_override_is_rejected(self):
        self._as(ALICE)
        _, client = self._ark_client("agents")

        response = self.client.post(
            "/v1/agents?namespace=team-a", json={"name": "a", "prompt": "p", "overrides": [_override(ALICE_SECRET)]}
        )

        self._assert_rejected(response)
        client.agents.a_create.assert_not_awaited()

    def test_delete_is_never_blocked(self):
        self._as(BOB)
        _, client = self._ark_client("agents")

        response = self.client.delete("/v1/agents/a?namespace=team-a")

        self.assertEqual(response.status_code, 204, response.text)
        client.agents.a_delete.assert_awaited_once_with("a")
        self.read.assert_not_awaited()

    def test_clearing_overrides_with_null_passes(self):
        self._as(BOB)
        _, client = self._ark_client("agents")
        client.agents.a_get = AsyncMock(return_value=self._existing())
        client.agents.a_update = AsyncMock(side_effect=lambda resource: resource)

        response = self.client.put("/v1/agents/a?namespace=team-a", json={"overrides": None})

        self.assertEqual(response.status_code, 200, response.text)
        self.assertNotIn("overrides", client.agents.a_update.await_args.args[0].to_dict()["spec"])
        self.read.assert_not_awaited()

    def test_owner_cannot_keep_a_personal_secret_on_an_agent(self):
        self._as(ALICE)
        _, client = self._ark_client("agents")
        client.agents.a_get = AsyncMock(return_value=self._existing())

        response = self.client.put("/v1/agents/a?namespace=team-a", json={"prompt": "new"})

        self._assert_rejected(response)
        client.agents.a_update.assert_not_awaited()


class TestModelRoutes(PersonalSecretRefRouteTest):
    def setUp(self):
        super().setUp()
        self.custom_api = MagicMock()
        self.custom_api.create_namespaced_custom_object = AsyncMock(side_effect=lambda **kwargs: kwargs["body"])
        self.custom_api.replace_namespaced_custom_object = AsyncMock(side_effect=lambda **kwargs: kwargs["body"])
        api_patcher = patch("ark_api.api.v1.models.CustomObjectsApi", return_value=self.custom_api)
        api_patcher.start()
        self.addCleanup(api_patcher.stop)

        @asynccontextmanager
        async def api_client(impersonation):
            yield MagicMock()

        client_patcher = patch("ark_api.api.v1.models.get_impersonating_api_client", side_effect=api_client)
        self.api_client = client_patcher.start()
        self.addCleanup(client_patcher.stop)

    def _create(self, secret_name):
        return self.client.post("/v1/models?namespace=team-a", json={
            "name": "m",
            "provider": "openai",
            "model": "gpt-4o",
            "config": {"openai": {"apiKey": _ref(secret_name), "baseUrl": "https://api.example.com"}},
        })

    def test_personal_secret_is_rejected_before_any_write(self):
        self._as(ALICE)

        self._assert_rejected(self._create(ALICE_SECRET))

        self.api_client.assert_not_called()
        self.custom_api.create_namespaced_custom_object.assert_not_awaited()

    def test_update_checks_the_existing_config(self):
        self._as(ALICE)
        self.custom_api.get_namespaced_custom_object = AsyncMock(return_value={
            "metadata": {"name": "m", "namespace": "team-a"},
            "spec": {"provider": "openai", "model": {"value": "gpt-4o"}, "config": {"openai": {
                "apiKey": _ref(ALICE_SECRET), "baseUrl": {"value": "https://api.example.com"},
            }}},
        })

        response = self.client.put("/v1/models/m?namespace=team-a", json={"model": "gpt-4o-mini"})

        self._assert_rejected(response)
        self.custom_api.replace_namespaced_custom_object.assert_not_awaited()

    def test_promoted_secret_is_accepted(self):
        self._as(BOB)

        response = self._create(PROMOTED_SECRET)

        self.assertEqual(response.status_code, 200, response.text)
        spec = self.custom_api.create_namespaced_custom_object.await_args.kwargs["body"]["spec"]
        self.assertEqual(spec["config"]["openai"]["apiKey"], _ref(PROMOTED_SECRET))


class TestMCPServerRoutes(PersonalSecretRefRouteTest):
    def test_create_with_a_personal_header_is_rejected(self):
        self._as(ALICE)
        _, client = self._ark_client("mcp_servers")

        response = self.client.post("/v1/mcp-servers?namespace=team-a", json={"name": "github", "namespace": "team-a", "spec": {
            "transport": "http", "address": {"value": "http://github-mcp"}, "headers": _headers(ALICE_SECRET),
        }})

        self._assert_rejected(response)
        client.mcpservers.a_create.assert_not_awaited()

    def test_update_with_a_personal_header_is_rejected(self):
        self._as(ALICE)
        _, client = self._ark_client("mcp_servers")
        client.mcpservers.a_get = AsyncMock(return_value=MCPServerV1alpha1(
            metadata={"name": "github", "namespace": "team-a"},
            spec={"transport": "http", "address": {"value": "http://github-mcp"}},
        ))

        response = self.client.put("/v1/mcp-servers/github?namespace=team-a", json={"spec": {
            "transport": "http",
            "address": {"value": "http://github-mcp"},
            "headers": [{"name": "Authorization", "value": _ref(ALICE_SECRET)}],
        }})

        self._assert_rejected(response)
        client.mcpservers.a_update.assert_not_awaited()


class TestA2AServerRoutes(PersonalSecretRefRouteTest):
    def test_create_with_a_personal_header_or_address_is_rejected(self):
        self._as(ALICE)
        for spec in (
            {"address": {"value": "http://agent"}, "headers": _headers(ALICE_SECRET)},
            {"address": _ref(ALICE_SECRET)},
        ):
            with self.subTest(spec=spec):
                _, client = self._ark_client("a2a_servers")

                response = self.client.post("/v1/a2a-servers?namespace=team-a", json={"name": "agent", "namespace": "team-a", "spec": spec})

                self._assert_rejected(response)
                client.a2aservers.a_create.assert_not_awaited()

    def test_update_with_a_personal_header_is_rejected(self):
        self._as(ALICE)
        _, client = self._ark_client("a2a_servers")
        client.a2aservers.a_get = AsyncMock(return_value=A2AServerV1prealpha1(
            metadata={"name": "agent", "namespace": "team-a"}, spec={"address": {"value": "http://agent"}},
        ))

        response = self.client.put("/v1/a2a-servers/agent?namespace=team-a", json={"spec": {
            "address": {"value": "http://agent"}, "headers": _headers(ALICE_SECRET),
        }})

        self._assert_rejected(response)
        client.a2aservers.a_update.assert_not_awaited()


class TestToolRoutes(PersonalSecretRefRouteTest):
    def _spec(self, headers=None):
        http = {"url": "http://tool"}
        if headers:
            http["headers"] = headers
        return {"type": "http", "description": "d", "http": http}

    def test_create_with_a_personal_header_is_rejected(self):
        self._as(ALICE)
        _, client = self._ark_client("tools")

        response = self.client.post("/v1/tools?namespace=team-a", json={
            "name": "t", "namespace": "team-a", "spec": self._spec(_headers(ALICE_SECRET)),
        })

        self._assert_rejected(response)
        client.tools.a_create.assert_not_awaited()

    def test_update_with_a_personal_header_is_rejected(self):
        self._as(ALICE)
        _, client = self._ark_client("tools")
        client.tools.a_get = AsyncMock(return_value=ToolV1alpha1(metadata={"name": "t", "namespace": "team-a"}, spec=self._spec()))

        response = self.client.put("/v1/tools/t?namespace=team-a", json={"spec": self._spec(_headers(ALICE_SECRET))})

        self._assert_rejected(response)
        client.tools.a_update.assert_not_awaited()


class TestMemoryRoutes(PersonalSecretRefRouteTest):
    def test_update_checks_the_existing_spec(self):
        self._as(ALICE)
        _, client = self._ark_client("memories")
        client.memories.a_get = AsyncMock(return_value=MemoryV1alpha1(
            metadata={"name": "m", "namespace": "team-a"},
            spec={"address": {"value": "http://memory"}, "headers": _headers(ALICE_SECRET)},
        ))

        response = self.client.put("/v1/memories/m?namespace=team-a", json={"description": "new"})

        self._assert_rejected(response)
        client.memories.a_update.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
