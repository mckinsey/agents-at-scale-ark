import asyncio
from contextlib import asynccontextmanager
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from src.ark_api.api.v1.marketplace_installs import router
from src.ark_api.marketplace_install import catalog, helm, preview, preview_cache, state
from src.ark_api.marketplace_install.releases import Revision
from src.ark_api.marketplace_install.checks import ObjectRef
from src.ark_api.marketplace_install.errors import install_error
from src.ark_api.models.auth import UserIdentity

app = FastAPI()


@app.middleware("http")
async def _fake_auth(request: Request, call_next):
    user = request.headers.get("x-test-user")
    if user is not None:
        request.state.user_identity = UserIdentity(username=user, groups=["devs"])
    if request.headers.get("x-test-api-key") is not None:
        request.state.api_key = {"id": "key"}
    return await call_next(request)


app.include_router(router, prefix="/v1")
client = TestClient(app)

URL = "/v1/namespaces/team-a/marketplace-installs/phoenix/preview"
ROUTE = "src.ark_api.api.v1.marketplace_installs"
STATE = "src.ark_api.marketplace_install.state"
CAPABILITY = "src.ark_api.marketplace_install.capability"
GATE = "src.ark_api.marketplace_install.gate"
CATALOG = "src.ark_api.marketplace_install.catalog"
HELM = "src.ark_api.marketplace_install.helm"
PREVIEW = "src.ark_api.marketplace_install.preview"
OPEN = {"AUTH_MODE": "open"}
SSO = {"AUTH_MODE": "sso", "IMPERSONATION_ENABLED": "true"}
ALICE = {"x-test-user": "alice@example.com"}
DIGEST = "sha256:" + "a" * 64
CHART_REF = "oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts/phoenix"
RESOLVED = catalog.ResolvedItem(source="official", item="phoenix", chart_ref=CHART_REF, release="phoenix", plain_http=False)
CONFIG_MAP = ObjectRef("v1", "ConfigMap", "phoenix", "configmaps", True)


@asynccontextmanager
async def _no_api(namespace):
    yield object()


def _row(state="free", ref=CONFIG_MAP, **fields):
    return preview.Row(api_version="v1", kind="ConfigMap", name="phoenix", namespace=None, state=state, ref=ref, **fields)


class PreviewRouteTestCase(unittest.TestCase):
    def setUp(self):
        preview_cache.clear()
        self.addCleanup(preview_cache.clear)
        self.env = dict(OPEN)
        self.mocks = {
            f"{ROUTE}._installer_api": _no_api,
            f"{STATE}.load": AsyncMock(return_value=state.Observed("phoenix")),
            f"{CAPABILITY}.installer_enabled": AsyncMock(return_value=True),
            f"{CAPABILITY}.policy_in_place": AsyncMock(return_value=True),
            f"{GATE}.can_install": AsyncMock(return_value=True),
            f"{CATALOG}.resolve": AsyncMock(return_value=RESOLVED),
            f"{HELM}.pull": AsyncMock(return_value=helm.PulledChart(path=Path("/tmp/x.tgz"), digest=DIGEST, version="1.2.3")),
            f"{HELM}.template": AsyncMock(return_value=[{"apiVersion": "v1", "kind": "ConfigMap", "metadata": {"name": "phoenix"}}]),
            f"{PREVIEW}.check_objects": AsyncMock(return_value=[_row()]),
        }

    def post(self, body=None, headers=None, url=URL):
        with patch.dict(os.environ, self.env, clear=True):
            patchers = [patch(target, mock) for target, mock in self.mocks.items()]
            for patcher in patchers:
                patcher.start()
            try:
                return client.post(url, json=body if body is not None else {"source": "official"}, headers=headers or {})
            finally:
                for patcher in patchers:
                    patcher.stop()

    def mock(self, name):
        return self.mocks[name]

    def assert_error(self, response, status, code):
        self.assertEqual(response.status_code, status, response.text)
        self.assertEqual(response.json()["detail"]["code"], code)


def _job(conditions):
    return {
        "metadata": {"name": "marketplace-install-phoenix", "labels": {"ark.mckinsey.com/marketplace-install": "phoenix"}},
        "spec": {"template": {"spec": {"serviceAccountName": "ark-marketplace-installer"}}},
        "status": {"conditions": [{"type": t, "status": "True", "reason": r} for t, r in conditions]},
    }


class TestPreviewOfPresentItems(PreviewRouteTestCase):
    def test_present_items_get_the_record(self):
        cases = {
            "installed": state.Observed("phoenix", None, [], Revision("phoenix", 1, "deployed", "s")),
            "installing": state.Observed("phoenix", _job([]), [], None),
            "failed": state.Observed("phoenix", _job([("Failed", "BackoffLimitExceeded")]), [], None),
            "timed-out": state.Observed("phoenix", _job([("Failed", "DeadlineExceeded")]), [], None),
            "platform-managed": state.Observed("phoenix", None, [], Revision("phoenix", 2, "deployed", "s")),
        }
        for expected, observed in cases.items():
            with self.subTest(state=expected):
                self.mocks[f"{STATE}.load"] = AsyncMock(return_value=observed)
                self.mocks[f"{HELM}.pull"].reset_mock()
                response = self.post()
                self.assert_error(response, 409, "already-installed")
                record = response.json()["detail"]["record"]
                self.assertEqual((record["state"], record["release"], record["itemName"], record["source"]), (expected, "phoenix", "phoenix", "official"))
                self.mock(f"{HELM}.pull").assert_not_awaited()
                self.assertIsNone(preview_cache.get("team-a", "official", "phoenix", DIGEST))

    def test_conflict_response_is_documented(self):
        responses = app.openapi()["paths"][URL.replace("team-a", "{namespace}").replace("phoenix", "{item}")]["post"]["responses"]
        self.assertTrue(responses["409"]["content"]["application/json"]["schema"]["$ref"].endswith("/MarketplaceInstallError"))

    def test_state_is_read_for_the_catalogue_release(self):
        self.post()
        self.assertEqual(self.mock(f"{STATE}.load").await_args.args[1:], ("team-a", "phoenix"))


class TestPreviewSuccess(PreviewRouteTestCase):
    def test_returns_the_preview(self):
        response = self.post()
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(
            {k: body[k] for k in ("source", "itemName", "chartName", "chartRef", "chartVersion", "digest", "releaseName", "namespace", "blocked")},
            {
                "source": "official",
                "itemName": "phoenix",
                "chartName": "phoenix",
                "chartRef": CHART_REF,
                "chartVersion": "1.2.3",
                "digest": DIGEST,
                "releaseName": "phoenix",
                "namespace": "team-a",
                "blocked": False,
            },
        )
        self.assertEqual(body["resources"], [{"apiVersion": "v1", "kind": "ConfigMap", "name": "phoenix", "namespace": None, "state": "free", "ownedByRelease": None, "hook": False, "message": None}])
        self.assertIn("expiresAt", body)

    def test_renders_the_pulled_chart_as_the_release(self):
        self.post()
        self.mock(f"{HELM}.pull").assert_awaited_once()
        self.assertEqual(self.mock(f"{HELM}.pull").await_args.args[:2], (CHART_REF, False))
        chart, release, namespace, _ = self.mock(f"{HELM}.template").await_args.args
        self.assertEqual((chart, release, namespace), (Path("/tmp/x.tgz"), "phoenix", "team-a"))
        self.mock(f"{PREVIEW}.check_objects").assert_awaited_once_with("team-a", self.mock(f"{HELM}.template").return_value)

    def test_any_verdict_but_free_blocks(self):
        self.mocks[f"{PREVIEW}.check_objects"] = AsyncMock(
            return_value=[_row(), _row(state="psa-violation", message="would violate PodSecurity")]
        )
        body = self.post().json()
        self.assertTrue(body["blocked"])
        self.assertTrue(preview_cache.get("team-a", "official", "phoenix", DIGEST).blocked)

    def test_writes_the_cache_entry(self):
        self.mocks[f"{PREVIEW}.check_objects"] = AsyncMock(return_value=[_row(), _row(state="crd", ref=None)])
        self.post()
        entry = preview_cache.get("team-a", "official", "phoenix", DIGEST)
        self.assertEqual(
            (entry.release, entry.chart_ref, entry.chart_version, entry.digest, entry.blocked, entry.objects),
            ("phoenix", CHART_REF, "1.2.3", DIGEST, True, (CONFIG_MAP,)),
        )

    def test_chart_reference_in_the_body_is_ignored(self):
        self.post(body={"source": "official", "chartPath": "oci://evil.example/x", "release": "x"})
        self.mock(f"{CATALOG}.resolve").assert_awaited_once()
        self.assertEqual(self.mock(f"{CATALOG}.resolve").await_args.args[:3], ("team-a", "official", "phoenix"))
        self.assertEqual(self.mock(f"{HELM}.pull").await_args.args[0], CHART_REF)

    def test_signed_in_user_with_permission(self):
        self.env = dict(SSO)
        self.assertEqual(self.post(headers=ALICE).status_code, 200)
        impersonation = self.mock(f"{CATALOG}.resolve").await_args.args[3]
        self.assertEqual(impersonation.username, "alice@example.com")


class TestPreviewRefusals(PreviewRouteTestCase):
    def assert_nothing_resolved(self):
        self.mock(f"{CATALOG}.resolve").assert_not_awaited()
        self.mock(f"{HELM}.pull").assert_not_awaited()

    def test_user_without_permission(self):
        self.env = dict(SSO)
        self.mocks[f"{GATE}.can_install"] = AsyncMock(return_value=False)
        self.assert_error(self.post(headers=ALICE), 403, "not-permitted")
        self.assert_nothing_resolved()
        self.mock(f"{CAPABILITY}.installer_enabled").assert_not_awaited()

    def test_api_keys(self):
        self.env = {"AUTH_MODE": "hybrid", "IMPERSONATION_ENABLED": "true"}
        self.assert_error(self.post(headers={"x-test-api-key": "1"}), 403, "api-key-not-supported")
        self.assert_nothing_resolved()

    def test_impersonation_disabled(self):
        self.env = {"AUTH_MODE": "sso"}
        self.assert_error(self.post(headers=ALICE), 403, "impersonation-disabled")
        self.assert_nothing_resolved()

    def test_namespace_not_enabled(self):
        self.mocks[f"{CAPABILITY}.installer_enabled"] = AsyncMock(return_value=False)
        self.assert_error(self.post(), 409, "namespace-not-enabled")
        self.assert_nothing_resolved()

    def test_policy_missing(self):
        self.mocks[f"{CAPABILITY}.policy_in_place"] = AsyncMock(return_value=False)
        self.assert_error(self.post(), 409, "policy-missing")
        self.assert_nothing_resolved()

    def test_catalogue_errors_pass_through(self):
        for status, code in ((404, "source-not-found"), (404, "item-not-found"), (502, "catalog-unavailable"), (422, "not-installable"), (422, "registry-not-allowed")):
            with self.subTest(code=code):
                self.mocks[f"{CATALOG}.resolve"] = AsyncMock(side_effect=install_error(status, code, "x"))
                self.assert_error(self.post(), status, code)

    def test_helm_errors_map_to_statuses(self):
        self.mocks[f"{HELM}.pull"] = AsyncMock(side_effect=helm.HelmError(helm.CHART_UNAVAILABLE, "Could not pull the chart from ghcr.io: x"))
        response = self.post()
        self.assert_error(response, 502, "chart-unavailable")
        self.assertIn("ghcr.io", response.json()["detail"]["message"])
        self.mocks[f"{HELM}.pull"] = AsyncMock(return_value=helm.PulledChart(path=Path("/tmp/x.tgz"), digest=DIGEST, version="1"))
        self.mocks[f"{HELM}.template"] = AsyncMock(side_effect=helm.HelmError(helm.RENDER_FAILED, "bad"))
        self.assert_error(self.post(), 422, "render-failed")
        self.assertIsNone(preview_cache.get("team-a", "official", "phoenix", DIGEST))

    def test_invalid_names(self):
        for url in (
            "/v1/namespaces/Team_A/marketplace-installs/phoenix/preview",
            "/v1/namespaces/team-a/marketplace-installs/-phoenix/preview",
            "/v1/namespaces/team-a/marketplace-installs/" + "a" * 300 + "/preview",
        ):
            with self.subTest(url=url):
                self.assertEqual(self.post(url=url).status_code, 422)
        self.assertEqual(self.post(body={"source": "../x"}).status_code, 422)
        self.assertEqual(self.post(body={}).status_code, 422)
        self.assert_nothing_resolved()


class TestPreviewDeadline(PreviewRouteTestCase):
    def test_slow_preview_times_out(self):
        async def slow(namespace, objects):
            await asyncio.sleep(10)

        self.env = {**OPEN, "MARKETPLACE_INSTALL_PREVIEW_TIMEOUT_SECONDS": "0.3"}
        self.mocks[f"{PREVIEW}.check_objects"] = AsyncMock(side_effect=slow)
        started = time.monotonic()
        response = self.post()
        self.assertLess(time.monotonic() - started, 5)
        self.assert_error(response, 504, "preview-timeout")
        self.assertIn("0.3 seconds", response.json()["detail"]["message"])
        self.assertIsNone(preview_cache.get("team-a", "official", "phoenix", DIGEST))

    def test_timeout_kills_helm(self):
        scratch = Path(tempfile.mkdtemp(prefix="fake-helm-"))
        pid_file = scratch / "pid"
        script = scratch / "helm"
        script.write_text(f"#!/bin/sh\necho $$ > {pid_file}\nexec sleep 60\n")
        script.chmod(0o755)
        del self.mocks[f"{HELM}.pull"]
        self.env = {**OPEN, "MARKETPLACE_INSTALL_PREVIEW_TIMEOUT_SECONDS": "3"}
        with patch.object(helm, "HELM_BINARY", str(script)), patch.object(helm, "_SEMAPHORE", asyncio.Semaphore(2)):
            response = self.post()
        self.assert_error(response, 504, "preview-timeout")
        pid = int(pid_file.read_text())
        with self.assertRaises(ProcessLookupError):
            os.kill(pid, 0)

    def test_default_and_invalid_timeouts(self):
        from src.ark_api.api.v1 import marketplace_installs

        for value, expected in (("", 25.0), ("x", 25.0), ("0", 25.0), ("-1", 25.0), ("40", 40.0)):
            with self.subTest(value=value), patch.dict(os.environ, {"MARKETPLACE_INSTALL_PREVIEW_TIMEOUT_SECONDS": value}):
                self.assertEqual(marketplace_installs._preview_timeout(), expected)


if __name__ == "__main__":
    unittest.main()
