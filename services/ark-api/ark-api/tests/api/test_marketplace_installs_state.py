import asyncio
import os
import unittest
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from src.ark_api.api.v1.marketplace_installs import router
from src.ark_api.marketplace_install import catalog, events, state
from src.ark_api.marketplace_install.errors import install_error
from src.ark_api.marketplace_install.releases import Revision
from src.ark_api.models.auth import UserIdentity
from src.ark_api.models.marketplace_installs import MarketplaceInstallEvent

app = FastAPI()


@app.middleware("http")
async def _fake_auth(request: Request, call_next):
    user = request.headers.get("x-test-user")
    if user is not None:
        request.state.user_identity = UserIdentity(username=user, groups=["devs"])
    return await call_next(request)


app.include_router(router, prefix="/v1")
client = TestClient(app)

BASE = "/v1/namespaces/team-a/marketplace-installs"
ROUTE = "src.ark_api.api.v1.marketplace_installs"
CAPABILITY = "src.ark_api.marketplace_install.capability"
GATE = "src.ark_api.marketplace_install.gate"
STATE = "src.ark_api.marketplace_install.state"
OPEN = {"AUTH_MODE": "open"}
SSO = {"AUTH_MODE": "sso", "IMPERSONATION_ENABLED": "true"}
ALICE = {"x-test-user": "alice@example.com"}
INSTALLER = "system:serviceaccount:team-a:ark-marketplace-installer"
RESOLVED = catalog.ResolvedItem(source="official", item="phoenix", chart_ref="oci://r/charts/phoenix", release="phoenix", plain_http=False)


def _job(conditions=()):
    return {
        "metadata": {
            "name": "marketplace-install-phoenix",
            "uid": "uid",
            "labels": {"ark.mckinsey.com/marketplace-install": "phoenix"},
            "annotations": {
                "ark.mckinsey.com/marketplace-install-source": "official",
                "ark.mckinsey.com/marketplace-install-item": "phoenix",
            },
        },
        "spec": {"template": {"spec": {"serviceAccountName": "ark-marketplace-installer"}}},
        "status": {"conditions": [{"type": t, "status": "True", "reason": r} for t, r in conditions]},
    }


FAILED_JOB = _job([("Failed", "BackoffLimitExceeded")])
EVENT = MarketplaceInstallEvent(type="Warning", reason="BackOff", message="m", objectKind="Pod", objectName="p")


class StateRouteTestCase(unittest.TestCase):
    def setUp(self):
        self.env = dict(OPEN)
        self.identities = []

        @asynccontextmanager
        async def installer_api(impersonation):
            self.identities.append(impersonation.username if impersonation else None)
            yield object()

        self.mocks = {
            f"{ROUTE}.get_impersonating_api_client": installer_api,
            f"{CAPABILITY}.installer_enabled": AsyncMock(return_value=True),
            f"{CAPABILITY}.policy_in_place": AsyncMock(return_value=True),
            f"{GATE}.can_read": AsyncMock(return_value=True),
            f"{GATE}.can_read_logs": AsyncMock(return_value=True),
            f"{STATE}.load_all": AsyncMock(return_value=[]),
            f"{STATE}.item_job": AsyncMock(return_value=("phoenix", FAILED_JOB)),
            f"{STATE}.load": AsyncMock(return_value=state.Observed("phoenix", FAILED_JOB, [], None)),
            "src.ark_api.marketplace_install.catalog.resolve": AsyncMock(return_value=RESOLVED),
            "src.ark_api.marketplace_install.events.collect": AsyncMock(return_value=[EVENT]),
            "src.ark_api.marketplace_install.logs.job_log": AsyncMock(return_value="Error: boom"),
        }

    def get(self, url, headers=None):
        with patch.dict(os.environ, self.env, clear=True):
            patchers = [patch(target, mock) for target, mock in self.mocks.items()]
            for patcher in patchers:
                patcher.start()
            try:
                return client.get(url, headers=headers or {})
            finally:
                for patcher in patchers:
                    patcher.stop()

    def mock(self, name):
        return self.mocks[name]

    def assert_error(self, response, status, code):
        self.assertEqual(response.status_code, status, response.text)
        self.assertEqual(response.json()["detail"]["code"], code)


class TestList(StateRouteTestCase):
    def test_lists_records_as_the_installer(self):
        self.mocks[f"{STATE}.load_all"] = AsyncMock(
            return_value=[
                state.Observed("ark-tenant", None, [], Revision("ark-tenant", 3, "deployed", "s")),
                state.Observed("phoenix", FAILED_JOB, [], None),
            ]
        )
        response = self.get(BASE)
        self.assertEqual(response.status_code, 200, response.text)
        items = response.json()["items"]
        self.assertEqual([(i["release"], i["state"], i["itemName"]) for i in items], [("ark-tenant", "platform-managed", None), ("phoenix", "failed", "phoenix")])
        self.assertTrue(all(i["log"] is None and i["events"] == [] for i in items))
        self.assertEqual(self.identities, [INSTALLER])
        self.mock("src.ark_api.marketplace_install.logs.job_log").assert_not_awaited()

    def test_read_gate_comes_first(self):
        self.env = dict(SSO)
        self.mocks[f"{GATE}.can_read"] = AsyncMock(return_value=False)
        self.assert_error(self.get(BASE, ALICE), 403, "not-permitted")
        self.mock(f"{STATE}.load_all").assert_not_awaited()
        self.mock(f"{CAPABILITY}.installer_enabled").assert_not_awaited()

    def test_impersonation_disabled(self):
        self.env = {"AUTH_MODE": "sso"}
        self.assert_error(self.get(BASE, ALICE), 403, "impersonation-disabled")

    def test_namespace_not_enabled(self):
        self.mocks[f"{CAPABILITY}.installer_enabled"] = AsyncMock(return_value=False)
        self.assert_error(self.get(BASE), 409, "namespace-not-enabled")
        self.mock(f"{STATE}.load_all").assert_not_awaited()


    def test_policy_missing(self):
        self.mocks[f"{CAPABILITY}.policy_in_place"] = AsyncMock(return_value=False)
        self.assert_error(self.get(BASE), 409, "policy-missing")
        self.mock(f"{STATE}.load_all").assert_not_awaited()


class TestItem(StateRouteTestCase):
    def test_item_read_gate_comes_first(self):
        self.env = dict(SSO)
        self.mocks[f"{GATE}.can_read"] = AsyncMock(return_value=False)
        self.assert_error(self.get(f"{BASE}/phoenix?source=official", ALICE), 403, "not-permitted")
        for name in (f"{CAPABILITY}.installer_enabled", f"{STATE}.item_job", f"{STATE}.load", "src.ark_api.marketplace_install.catalog.resolve"):
            self.mock(name).assert_not_awaited()

    def test_item_needs_the_policy(self):
        self.mocks[f"{CAPABILITY}.policy_in_place"] = AsyncMock(return_value=False)
        self.assert_error(self.get(f"{BASE}/phoenix?source=official"), 409, "policy-missing")
        self.mock(f"{STATE}.item_job").assert_not_awaited()

    def test_log_for_every_state_that_has_one(self):
        for job in (_job([("Failed", "DeadlineExceeded")]), _job()):
            with self.subTest(job=job["status"]["conditions"]):
                self.mocks[f"{STATE}.load"] = AsyncMock(return_value=state.Observed("phoenix", job, [], None))
                self.assertEqual(self.get(f"{BASE}/phoenix?source=official").json()["log"], "Error: boom")

    def test_no_log_without_a_job(self):
        self.mocks[f"{STATE}.item_job"] = AsyncMock(return_value=None)
        self.mocks[f"{STATE}.load"] = AsyncMock(return_value=state.Observed("phoenix", None, [], Revision("phoenix", 1, "failed", "s")))
        body = self.get(f"{BASE}/phoenix?source=official").json()
        self.assertEqual((body["state"], body["log"]), ("failed", None))
        self.mock("src.ark_api.marketplace_install.logs.job_log").assert_not_awaited()

    def test_full_record_with_events_and_log(self):
        response = self.get(f"{BASE}/phoenix?source=official")
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual((body["state"], body["failedStage"], body["log"]), ("failed", "resolve", "Error: boom"))
        self.assertEqual(body["events"][0]["reason"], "BackOff")
        self.mock("src.ark_api.marketplace_install.catalog.resolve").assert_not_awaited()
        self.mock(f"{STATE}.load").assert_awaited_once()
        self.assertEqual(self.mock(f"{STATE}.load").await_args.args[1:], ("team-a", "phoenix"))

    def test_log_needs_pod_log_access(self):
        self.env = dict(SSO)
        self.mocks[f"{GATE}.can_read_logs"] = AsyncMock(return_value=False)
        body = self.get(f"{BASE}/phoenix?source=official", ALICE).json()
        self.assertEqual(body["state"], "failed")
        self.assertIsNone(body["log"])
        self.mock("src.ark_api.marketplace_install.logs.job_log").assert_not_awaited()

    def test_no_log_for_installed_items(self):
        self.mocks[f"{STATE}.load"] = AsyncMock(
            return_value=state.Observed("phoenix", _job([("Complete", "Completed")]), [], Revision("phoenix", 1, "deployed", "s"))
        )
        body = self.get(f"{BASE}/phoenix?source=official").json()
        self.assertEqual(body["state"], "installed")
        self.assertIsNone(body["log"])
        self.mock("src.ark_api.marketplace_install.logs.job_log").assert_not_awaited()

    def test_without_a_job_the_catalogue_gives_the_release(self):
        self.mocks[f"{STATE}.item_job"] = AsyncMock(return_value=None)
        self.mocks[f"{STATE}.load"] = AsyncMock(return_value=state.Observed("phoenix", None, [], None))
        body = self.get(f"{BASE}/phoenix?source=official").json()
        self.assertEqual((body["state"], body["source"], body["itemName"]), ("installable", "official", "phoenix"))
        self.mock("src.ark_api.marketplace_install.catalog.resolve").assert_awaited_once()

    def test_catalogue_errors_propagate(self):
        self.mocks[f"{STATE}.item_job"] = AsyncMock(return_value=None)
        self.mocks["src.ark_api.marketplace_install.catalog.resolve"] = AsyncMock(side_effect=install_error(422, "not-installable", "no"))
        self.assert_error(self.get(f"{BASE}/phoenix?source=official"), 422, "not-installable")

    def test_source_is_required_and_validated(self):
        self.assertEqual(self.get(f"{BASE}/phoenix").status_code, 422)
        self.assertEqual(self.get(f"{BASE}/phoenix?source=a/b").status_code, 422)

    def test_capability_route_is_not_an_item(self):
        with patch(f"{ROUTE}._first_reason", AsyncMock(return_value=None)):
            response = self.get(f"{BASE}/capability")
        self.assertEqual(response.json(), {"enabled": True, "reason": None})


class TestItemJob(unittest.TestCase):
    def test_matches_source_and_item(self):
        other = _job()
        other["metadata"]["annotations"]["ark.mckinsey.com/marketplace-install-item"] = "other"
        with patch(f"{STATE}.our_jobs", AsyncMock(return_value={"other": other, "phoenix": _job()})):
            self.assertEqual(asyncio.run(state.item_job(object(), "team-a", "official", "phoenix"))[0], "phoenix")
            self.assertIsNone(asyncio.run(state.item_job(object(), "team-a", "elsewhere", "phoenix")))


class ReadOnlyApi:
    async def call_api(self, path, method, **kwargs):
        if method != "GET":
            raise AssertionError(f"write {method} {path}")
        if path.endswith("/jobs/{name}"):
            return FAILED_JOB
        return {"items": []}


class TestNoWrites(unittest.TestCase):
    def test_loaders_only_read(self):
        api = ReadOnlyApi()
        asyncio.run(state.load_all(api, "team-a"))
        asyncio.run(state.item_job(api, "team-a", "official", "phoenix"))
        observed = asyncio.run(state.load(api, "team-a", "phoenix"))
        self.assertEqual(asyncio.run(events.collect(api, "team-a", "phoenix", observed.job)), [])


if __name__ == "__main__":
    unittest.main()
