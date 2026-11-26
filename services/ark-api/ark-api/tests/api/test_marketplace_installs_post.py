import asyncio
import os
import time
import unittest
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import aiohttp
from fastapi import FastAPI, Request
from kubernetes_asyncio.client.rest import ApiException
from fastapi.testclient import TestClient

from src.ark_api.api.v1.marketplace_installs import router
from src.ark_api.marketplace_install import catalog, lock, preview_cache, state
from src.ark_api.marketplace_install.checks import ObjectRef
from src.ark_api.marketplace_install.releases import Revision
from src.ark_api.models.auth import UserIdentity

app = FastAPI()


@app.middleware("http")
async def _fake_auth(request: Request, call_next):
    user = request.headers.get("x-test-user")
    if user is not None:
        request.state.user_identity = UserIdentity(username=user, groups=["devs"])
    return await call_next(request)


app.include_router(router, prefix="/v1")
client = TestClient(app)

URL = "/v1/namespaces/team-a/marketplace-installs/phoenix"
ROUTE = "src.ark_api.api.v1.marketplace_installs"
CAPABILITY = "src.ark_api.marketplace_install.capability"
GATE = "src.ark_api.marketplace_install.gate"
STATE = "src.ark_api.marketplace_install.state"
LOCK = "src.ark_api.marketplace_install.lock"
INSTALL = "src.ark_api.marketplace_install.install"
OPEN = {"AUTH_MODE": "open", "MARKETPLACE_INSTALL_IMAGE": "ark-api:test"}
SSO = {"AUTH_MODE": "sso", "IMPERSONATION_ENABLED": "true", "MARKETPLACE_INSTALL_IMAGE": "ark-api:test"}
ALICE = {"x-test-user": "alice@example.com"}
INSTALLER = "system:serviceaccount:team-a:ark-marketplace-installer"
DIGEST = "sha256:" + "a" * 64
CHART_REF = "oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts/phoenix"
RESOLVED = catalog.ResolvedItem(source="official", item="phoenix", chart_ref=CHART_REF, release="phoenix", plain_http=False)
OBJECTS = (ObjectRef("v1", "ConfigMap", "phoenix", "configmaps", True),)
BODY = {"source": "official", "digest": DIGEST}


def _job(conditions=()):
    return {
        "metadata": {"name": "marketplace-install-phoenix", "uid": "uid", "labels": {"ark.mckinsey.com/marketplace-install": "phoenix"}},
        "spec": {"template": {"spec": {"serviceAccountName": "ark-marketplace-installer"}}},
        "status": {"conditions": [{"type": t, "status": "True", "reason": r} for t, r in conditions]},
    }


def _entry(**fields):
    values = dict(release="phoenix", chart_ref=CHART_REF, chart_version="1.2.3", digest=DIGEST, blocked=False, objects=OBJECTS, created_at=preview_cache.now())
    values.update(fields)
    return preview_cache.PreviewEntry(**values)


class PostRouteTestCase(unittest.TestCase):
    def setUp(self):
        preview_cache.clear()
        self.addCleanup(preview_cache.clear)
        self.env = dict(OPEN)
        self.identities = []
        self.order = []
        preview_cache.put("team-a", "official", "phoenix", _entry())

        @asynccontextmanager
        async def api_client(impersonation):
            name = impersonation.username if impersonation else None
            self.identities.append(name)
            yield f"client of {name or 'ark-api'}"

        def track(name, value=None):
            async def call(*args, **kwargs):
                self.order.append((name, args))
                return value

            return AsyncMock(side_effect=call)

        async def load(api, namespace, release):
            created = "create" in self.steps()
            self.order.append(("load", (api, namespace, release)))
            return state.Observed("phoenix", _job(), [], None) if created else state.Observed("phoenix")

        self.mocks = {
            f"{ROUTE}.get_impersonating_api_client": api_client,
            f"{CAPABILITY}.installer_enabled": AsyncMock(return_value=True),
            f"{CAPABILITY}.policy_in_place": AsyncMock(return_value=True),
            f"{GATE}.can_install": AsyncMock(return_value=True),
            "src.ark_api.marketplace_install.catalog.resolve": AsyncMock(return_value=RESOLVED),
            f"{STATE}.load": AsyncMock(side_effect=load),
            f"{LOCK}.acquire": track("acquire", lock.Acquired("7")),
            f"{LOCK}.release_if_ours": track("release"),
            f"{INSTALL}.remove_finished_job": track("cleanup"),
            f"{INSTALL}.existing_conflict": track("conflicts", None),
            f"{INSTALL}.create_job": track("create", ("created", _job())),
            f"{INSTALL}.started_event": track("event"),
        }

    def post(self, body=None, headers=None):
        self.order.clear()
        with patch.dict(os.environ, self.env, clear=True):
            patchers = [patch(target, mock) for target, mock in self.mocks.items()]
            for patcher in patchers:
                patcher.start()
            try:
                return client.post(URL, json=body if body is not None else BODY, headers=headers or {})
            finally:
                for patcher in patchers:
                    patcher.stop()

    def mock(self, name):
        return self.mocks[name]

    def steps(self):
        return [name for name, _ in self.order]

    def assert_error(self, response, status, code):
        self.assertEqual(response.status_code, status, response.text)
        self.assertEqual(response.json()["detail"]["code"], code)

    def assert_no_install(self):
        self.assertNotIn("acquire", self.steps())
        self.assertNotIn("create", self.steps())


class TestStart(PostRouteTestCase):
    def test_starts_the_install(self):
        response = self.post()
        self.assertEqual(response.status_code, 202, response.text)
        body = response.json()
        self.assertEqual((body["state"], body["release"], body["itemName"], body["source"]), ("installing", "phoenix", "phoenix", "official"))
        self.assertEqual(self.steps(), ["load", "acquire", "cleanup", "conflicts", "create", "event", "load"])

    def test_identities(self):
        self.post()
        self.assertIn(None, self.identities)
        acquire_args = next(args for name, args in self.order if name == "acquire")
        create_args = next(args for name, args in self.order if name == "create")
        self.assertEqual(acquire_args[0].namespace, "team-a")
        self.assertEqual(create_args[0], f"client of {INSTALLER}")
        self.assertEqual(next(args for name, args in self.order if name == "conflicts")[0], f"client of {INSTALLER}")
        self.assertEqual(acquire_args[0].coordination.api_client, "client of ark-api")

    def test_job_body_comes_from_the_catalogue_and_the_preview(self):
        self.env = dict(SSO)
        self.post(headers=ALICE)
        _, namespace, release, body = next(args for name, args in self.order if name == "create")
        self.assertEqual((namespace, release), ("team-a", "phoenix"))
        command = body["spec"]["template"]["spec"]["containers"][0]["command"]
        self.assertIn(f"{CHART_REF}@{DIGEST}", command)
        self.assertEqual(command[-1], "installed-by=alice@example.com")
        self.assertEqual(body["metadata"]["annotations"]["ark.mckinsey.com/marketplace-install-chart-version"], "1.2.3")
        self.assertEqual(body["spec"]["template"]["spec"]["containers"][0]["image"], "ark-api:test")

    def test_open_mode_ignores_a_user_on_the_request(self):
        self.post(headers=ALICE)
        body = next(args for name, args in self.order if name == "create")[3]
        self.assertNotIn("--description", body["spec"]["template"]["spec"]["containers"][0]["command"])

    def test_open_mode_has_no_installer_identity(self):
        self.post()
        body = next(args for name, args in self.order if name == "create")[3]
        self.assertNotIn("--description", body["spec"]["template"]["spec"]["containers"][0]["command"])

    def test_digest_and_source_are_validated(self):
        self.assertEqual(self.post({"source": "official", "digest": "sha256:short"}).status_code, 422)
        self.assertEqual(self.post({"source": "a/b", "digest": DIGEST}).status_code, 422)
        self.assertEqual(self.post({"source": "official"}).status_code, 422)


class TestGateAndCapability(PostRouteTestCase):
    def test_a_cached_preview_does_not_let_another_user_install(self):
        self.env = dict(SSO)
        self.mocks[f"{GATE}.can_install"] = AsyncMock(return_value=False)
        self.assert_error(self.post(headers=ALICE), 403, "not-permitted")
        self.mock("src.ark_api.marketplace_install.catalog.resolve").assert_not_awaited()
        self.assert_no_install()

    def test_capability_is_checked_again_before_the_job(self):
        self.mocks[f"{CAPABILITY}.installer_enabled"] = AsyncMock(return_value=False)
        self.assert_error(self.post(), 409, "namespace-not-enabled")
        self.assert_no_install()
        self.mocks[f"{CAPABILITY}.installer_enabled"] = AsyncMock(return_value=True)
        self.mocks[f"{CAPABILITY}.policy_in_place"] = AsyncMock(return_value=False)
        self.assert_error(self.post(), 409, "policy-missing")
        self.assert_no_install()


class TestStateAndCache(PostRouteTestCase):
    def test_same_item_installing_is_202_even_without_a_cache_entry(self):
        preview_cache.clear()
        self.mocks[f"{STATE}.load"] = AsyncMock(return_value=state.Observed("phoenix", _job(), [], None))
        response = self.post()
        self.assertEqual(response.status_code, 202, response.text)
        self.assertEqual(response.json()["state"], "installing")
        self.assert_no_install()

    def test_present_item_is_refused_with_the_record(self):
        self.mocks[f"{STATE}.load"] = AsyncMock(return_value=state.Observed("phoenix", None, [], Revision("phoenix", 1, "deployed", "s")))
        response = self.post()
        self.assert_error(response, 409, "already-installed")
        self.assertEqual(response.json()["detail"]["record"]["state"], "installed")
        self.assert_no_install()

    def test_missing_or_expired_preview(self):
        preview_cache.clear()
        self.assert_error(self.post(), 409, "preview-expired")
        preview_cache.put("team-a", "official", "phoenix", _entry(created_at=preview_cache.now() - 601))
        self.assert_error(self.post(), 409, "preview-expired")
        self.assert_no_install()

    def test_preview_of_another_digest(self):
        preview_cache.clear()
        preview_cache.put("team-a", "official", "phoenix", _entry(digest="sha256:" + "b" * 64))
        self.assert_error(self.post(), 409, "preview-expired")

    def test_catalogue_changed_since_the_preview(self):
        for changed in ({"chart_ref": CHART_REF + "-other"}, {"release": "other"}):
            with self.subTest(changed=changed):
                preview_cache.clear()
                preview_cache.put("team-a", "official", "phoenix", _entry(**changed))
                self.assert_error(self.post(), 409, "preview-expired")
                self.assert_no_install()

    def test_blocked_preview(self):
        preview_cache.clear()
        preview_cache.put("team-a", "official", "phoenix", _entry(blocked=True))
        self.assert_error(self.post(), 422, "preview-blocked")
        self.assert_no_install()

    def test_cache_is_checked_before_the_image(self):
        preview_cache.clear()
        self.env = {"AUTH_MODE": "open"}
        self.assert_error(self.post(), 409, "preview-expired")

    def test_missing_image(self):
        self.env = {"AUTH_MODE": "open"}
        self.assert_error(self.post(), 500, "install-misconfigured")
        self.assert_no_install()


class TestLockAndJob(PostRouteTestCase):
    def test_another_item_holds_the_lock(self):
        self.mocks[f"{LOCK}.acquire"] = AsyncMock(return_value=lock.Held("other-release"))
        response = self.post()
        self.assert_error(response, 409, "another-install-active")
        self.assertIn("other-release", response.json()["detail"]["message"])
        self.assertNotIn("create", self.steps())

    def test_resumed_install_returns_the_record(self):
        self.mocks[f"{LOCK}.acquire"] = AsyncMock(return_value=lock.Resumed(_job()))
        response = self.post()
        self.assertEqual(response.status_code, 202, response.text)
        self.assertNotIn("create", self.steps())

    def test_new_conflict_releases_the_lock(self):
        self.mocks[f"{INSTALL}.existing_conflict"] = AsyncMock(return_value="ConfigMap phoenix now exists in the namespace")
        response = self.post()
        self.assert_error(response, 409, "conflicts-changed")
        self.assertIn("ConfigMap phoenix", response.json()["detail"]["message"])
        release = next(args for name, args in self.order if name == "release")
        self.assertEqual(release[1], "7")
        self.assertNotIn("create", self.steps())

    def test_cleanup_comes_before_the_conflict_check_and_the_job(self):
        self.post()
        steps = self.steps()
        self.assertLess(steps.index("cleanup"), steps.index("conflicts"))
        self.assertLess(steps.index("conflicts"), steps.index("create"))

    def test_existing_job_outcomes(self):
        cases = {"ours": (202, None, False), "foreign": (409, "foreign-job", True), "deleting": (503, "busy", True)}
        for result, (status, code, released) in cases.items():
            with self.subTest(result=result):
                self.mocks[f"{INSTALL}.create_job"] = AsyncMock(return_value=(result, _job()))
                response = self.post()
                self.assertEqual(response.status_code, status, response.text)
                if code:
                    self.assertEqual(response.json()["detail"]["code"], code)
                self.assertNotIn("event", self.steps())
                self.assertEqual("release" in self.steps(), released)

    def test_api_errors_before_the_job_release_the_lock(self):
        for target in ("remove_finished_job", "existing_conflict", "create_job"):
            with self.subTest(target=target):
                self.mocks[f"{INSTALL}.{target}"] = AsyncMock(side_effect=ApiException(status=403, reason="Forbidden"))
                response = self.post()
                self.assert_error(response, 502, "cluster-error")
                self.assertIn("403 Forbidden", response.json()["detail"]["message"])
                self.assertEqual(next(args for name, args in self.order if name == "release")[1], "7")
                self.setUp()

    def test_a_connection_error_on_create_keeps_the_lock(self):
        self.mocks[f"{INSTALL}.create_job"] = AsyncMock(side_effect=aiohttp.ClientConnectionError())
        self.assert_error(self.post(), 502, "cluster-error")
        self.assertNotIn("release", self.steps())

    def test_lock_errors_are_cluster_errors(self):
        self.mocks[f"{LOCK}.acquire"] = AsyncMock(side_effect=ApiException(status=403, reason="Forbidden"))
        self.assert_error(self.post(), 502, "cluster-error")
        self.assertNotIn("release", self.steps())
        self.assertNotIn("create", self.steps())

    def test_lock_and_cleanup_read_jobs_as_the_installer(self):
        read_job = AsyncMock(return_value=None)
        self.mocks[f"{STATE}.read_job"] = read_job

        async def acquire(leases, release, job_of):
            self.order.append(("acquire", (leases, release, job_of)))
            await job_of("other")
            return lock.Acquired("7")

        self.mocks[f"{LOCK}.acquire"] = AsyncMock(side_effect=acquire)
        self.post()
        read_job.assert_awaited_with(f"client of {INSTALLER}", "team-a", "other")
        self.assertEqual(next(args for name, args in self.order if name == "cleanup")[0], f"client of {INSTALLER}")

    def test_resumed_returns_the_fresh_record(self):
        loads = iter([state.Observed("phoenix"), state.Observed("phoenix", _job(), [], None)])
        self.mocks[f"{STATE}.load"] = AsyncMock(side_effect=lambda *args: next(loads))
        self.mocks[f"{LOCK}.acquire"] = AsyncMock(return_value=lock.Resumed(_job()))
        self.assertEqual(self.post().json()["state"], "installing")

    def test_event_message(self):
        self.env = dict(SSO)
        self.post(headers=ALICE)
        self.assertEqual(next(args for name, args in self.order if name == "event")[3], "alice@example.com started installing phoenix from official")

    def test_default_deadline_is_20_seconds(self):
        with patch(f"{ROUTE}.asyncio.timeout", side_effect=asyncio.timeout) as timeout:
            self.post()
        timeout.assert_called_once_with(20.0)

    def test_deadline_gives_busy(self):
        async def slow(*args, **kwargs):
            await asyncio.sleep(5)

        self.env["MARKETPLACE_INSTALL_POST_TIMEOUT_SECONDS"] = "0.3"
        self.mocks[f"{LOCK}.acquire"] = AsyncMock(side_effect=slow)
        started = time.monotonic()
        response = self.post()
        self.assert_error(response, 503, "busy")
        self.assertLess(time.monotonic() - started, 3)
        self.assertNotIn("create", self.steps())


if __name__ == "__main__":
    unittest.main()
