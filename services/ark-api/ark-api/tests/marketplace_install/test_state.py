import asyncio
import base64
import gzip
import json
import unittest
from unittest.mock import patch

from kubernetes_asyncio.client.rest import ApiException

from src.ark_api.marketplace_install import state
from src.ark_api.marketplace_install.releases import Revision

NAMESPACE = "team-a"
RELEASE = "demo"
JOB_NAME = "marketplace-install-demo"


def _job(conditions=(), sa="ark-marketplace-installer", release=RELEASE, name=JOB_NAME, deleting=False, uid="job-uid", **annotations):
    meta = {"name": name, "uid": uid, "labels": {"ark.mckinsey.com/marketplace-install": release}, "annotations": annotations}
    if deleting:
        meta["deletionTimestamp"] = "2026-11-25T10:00:00Z"
    return {
        "metadata": meta,
        "spec": {"template": {"spec": {"serviceAccountName": sa}}},
        "status": {
            "startTime": "2026-11-25T09:00:00Z",
            "conditions": [{"type": t, "status": "True", "reason": r} for t, r in conditions],
        },
    }


RUNNING = _job()
COMPLETE = _job([("Complete", "Completed")])
FAILED = _job([("Failed", "BackoffLimitExceeded")])
POD_FAILURE_POLICY = _job([("FailureTarget", "PodFailurePolicy"), ("Failed", "PodFailurePolicy")])
POD_FAILURE_TARGET_ONLY = _job([("FailureTarget", "PodFailurePolicy")])
DEADLINE = _job([("Failed", "DeadlineExceeded")])


def _rev(status, version=1):
    return Revision(RELEASE, version, status, f"sh.helm.release.v1.{RELEASE}.v{version}")


def _pod(phase, owner="job-uid", sa="ark-marketplace-installer"):
    return {"metadata": {"ownerReferences": [{"uid": owner}]}, "spec": {"serviceAccountName": sa}, "status": {"phase": phase}}


def _derive(job=None, revision=None, pods=(), description=None):
    return state.derive(state.Observed(RELEASE, job, list(pods), revision, description))


class TestMatrix(unittest.TestCase):
    def assertState(self, derived, expected, stage=None, failed_stage=None):
        self.assertEqual((derived.state, derived.stage, derived.failed_stage), (expected, stage, failed_stage))

    def test_row_1_platform_managed(self):
        self.assertState(_derive(COMPLETE, _rev("deployed", 2)), "platform-managed")
        self.assertState(_derive(RUNNING, _rev("failed", 3)), "platform-managed")
        for status in ("superseded", "uninstalling", "uninstalled", "pending-upgrade", "pending-rollback"):
            self.assertState(_derive(None, _rev(status)), "platform-managed")

    def test_row_2_deployed_without_job_or_with_complete_job(self):
        self.assertState(_derive(None, _rev("deployed")), "installed")
        self.assertState(_derive(COMPLETE, _rev("deployed")), "installed")

    def test_row_3_deployed_with_running_job(self):
        self.assertState(_derive(RUNNING, _rev("deployed")), "installing", stage="ready")

    def test_row_4_deployed_with_failed_job(self):
        self.assertState(_derive(FAILED, _rev("deployed")), "installed")
        self.assertState(_derive(POD_FAILURE_POLICY, _rev("deployed")), "installed")

    def test_row_5_timed_out(self):
        self.assertState(_derive(POD_FAILURE_POLICY), "timed-out", failed_stage="ready")
        self.assertState(_derive(POD_FAILURE_TARGET_ONLY), "timed-out", failed_stage="ready")
        self.assertState(_derive(DEADLINE, _rev("pending-install")), "timed-out", failed_stage="ready")
        for description in ("Release failed: context deadline exceeded", "context canceled"):
            self.assertState(_derive(FAILED, _rev("failed"), description=description), "timed-out", failed_stage="ready")
            self.assertState(_derive(None, _rev("failed"), description=description), "timed-out", failed_stage="ready")

    def test_row_6_failed(self):
        self.assertState(_derive(FAILED), "failed", failed_stage="resolve")
        self.assertState(_derive(FAILED, _rev("failed"), description="pre-install hook failed"), "failed", failed_stage="apply")
        self.assertState(_derive(FAILED, _rev("pending-install")), "failed", failed_stage="apply")

    def test_row_7_installing(self):
        self.assertState(_derive(RUNNING), "installing", stage="resolve")
        self.assertState(_derive(RUNNING, pods=[_pod("Pending")]), "installing", stage="resolve")
        self.assertState(_derive(RUNNING, pods=[_pod("Running")]), "installing", stage="apply")
        self.assertState(_derive(RUNNING, _rev("pending-install"), pods=[_pod("Running")]), "installing", stage="apply")

    def test_row_8_complete_job_without_release(self):
        self.assertState(_derive(COMPLETE), "installable")

    def test_row_9_failed_or_pending_release_without_job(self):
        self.assertState(_derive(None, _rev("failed"), description="forbidden"), "failed", failed_stage="apply")
        self.assertState(_derive(None, _rev("pending-install")), "failed", failed_stage="apply")

    def test_row_10_nothing(self):
        self.assertState(_derive(), "installable")

    def test_row_11_catch_all(self):
        with self.assertLogs("src.ark_api.marketplace_install.state", "WARNING"):
            self.assertState(_derive(COMPLETE, _rev("failed")), "failed", failed_stage="apply")
        with self.assertLogs("src.ark_api.marketplace_install.state", "WARNING"):
            self.assertState(_derive(None, _rev("unknown")), "failed", failed_stage="apply")


class TestMutationGaps(unittest.TestCase):
    def test_complete_job_with_a_stale_failure_target_and_no_release(self):
        job = _job([("FailureTarget", "PodFailurePolicy"), ("Complete", "Completed")])
        self.assertEqual(_derive(job).state, "installable")

    def test_deadline_text_counts_only_on_a_failed_release(self):
        derived = _derive(None, _rev("pending-install"), description="context deadline exceeded")
        self.assertEqual((derived.state, derived.failed_stage), ("failed", "apply"))

    def test_pod_without_a_phase_is_resolve(self):
        self.assertEqual(_derive(RUNNING, pods=[{"metadata": {}, "status": {}}]).stage, "resolve")

    def test_row_9_does_not_fall_to_the_catch_all(self):
        with self.assertNoLogs("src.ark_api.marketplace_install.state", "WARNING"):
            _derive(None, _rev("pending-install"))
            _derive(None, _rev("failed"))


class TestEdgeCases(unittest.TestCase):
    def test_evicted_pod_fails_the_job(self):
        self.assertEqual(_derive(_job([("Failed", "BackoffLimitExceeded")]), pods=[_pod("Failed")]).state, "failed")

    def test_sidecar_keeps_a_deployed_release_installed_or_installing(self):
        self.assertEqual(_derive(RUNNING, _rev("deployed"), pods=[_pod("Running")]).state, "installing")
        self.assertEqual(_derive(DEADLINE, _rev("deployed")).state, "installed")

    def test_complete_wins_over_a_stale_failure_target(self):
        job = _job([("FailureTarget", "PodFailurePolicy"), ("Complete", "Completed")])
        self.assertEqual(_derive(job, _rev("deployed")).state, "installed")

    def test_false_conditions_do_not_count(self):
        job = _job()
        job["status"]["conditions"] = [{"type": "Failed", "status": "False"}]
        self.assertEqual(_derive(job).state, "installing")

    def test_record_reads_the_job_annotations(self):
        job = _job(
            [("Complete", "Completed")],
            **{
                "ark.mckinsey.com/marketplace-install-source": "official",
                "ark.mckinsey.com/marketplace-install-item": "demo-item",
                "ark.mckinsey.com/marketplace-install-digest": "sha256:" + "a" * 64,
                "ark.mckinsey.com/marketplace-install-chart-version": "0.1.0",
                "ark.mckinsey.com/marketplace-install-installed-by": "alice",
            },
        )
        record = state.record(state.Observed(RELEASE, job, [], _rev("deployed")))
        self.assertEqual(
            (record.source, record.itemName, record.chartVersion, record.installedBy, record.state),
            ("official", "demo-item", "0.1.0", "alice", "installed"),
        )
        self.assertEqual(record.startedAt.isoformat(), "2026-11-25T09:00:00+00:00")

    def test_record_without_job(self):
        record = state.record(state.Observed("ark-tenant", None, [], _rev("deployed")))
        self.assertEqual((record.release, record.itemName, record.startedAt, record.state), ("ark-tenant", None, None, "installed"))


class TestOurJob(unittest.TestCase):
    def test_trusted_job(self):
        self.assertTrue(state.our_job(RUNNING, RELEASE))
        self.assertTrue(state.our_job(RUNNING))

    def test_untrusted_jobs(self):
        self.assertFalse(state.our_job(_job(sa="default"), RELEASE))
        self.assertFalse(state.our_job(_job(deleting=True), RELEASE))
        self.assertFalse(state.our_job(_job(release="other"), RELEASE))
        self.assertFalse(state.our_job(_job(release=""), None))
        self.assertFalse(state.our_job(None))
        job = _job()
        del job["metadata"]["labels"]
        self.assertFalse(state.our_job(job))


def _secret_item(release, version, status):
    return {"metadata": {"name": f"sh.helm.release.v1.{release}.v{version}", "labels": {"name": release, "version": str(version), "status": status}}}


class FakeApi:
    def __init__(self, jobs=(), pods=(), secrets=(), releases_data=None):
        self.jobs = {job["metadata"]["name"]: job for job in jobs}
        self.pods = list(pods)
        self.secrets = list(secrets)
        self.releases_data = releases_data or {}
        self.calls = []

    async def call_api(self, path, method, path_params=None, query_params=None, **kwargs):
        assert method == "GET", method
        self.calls.append((path, dict(query_params or [])))
        if path.endswith("/jobs/{name}"):
            if path_params["name"] not in self.jobs:
                raise ApiException(status=404, reason="Not Found")
            return self.jobs[path_params["name"]]
        if path.endswith("/jobs"):
            return {"items": list(self.jobs.values())}
        if path.endswith("/pods"):
            return {"items": self.pods}
        if path.endswith("/secrets"):
            return {"items": self.secrets}
        raise AssertionError(path)


class _Core:
    payloads = {}

    def __init__(self, api):
        pass

    async def read_namespaced_secret(self, name, namespace):
        from types import SimpleNamespace

        return SimpleNamespace(data={"release": _Core.payloads[name]})


def _payload(description):
    data = gzip.compress(json.dumps({"info": {"description": description}}).encode())
    return base64.b64encode(base64.b64encode(data)).decode()


class TestLoad(unittest.TestCase):
    def test_load_reads_job_pods_and_release(self):
        api = FakeApi(jobs=[RUNNING], pods=[_pod("Running"), _pod("Running", owner="someone-else")], secrets=[_secret_item(RELEASE, 1, "pending-install")])
        observed = asyncio.run(state.load(api, NAMESPACE, RELEASE))
        self.assertIs(observed.job, RUNNING)
        self.assertEqual(len(observed.pods), 1)
        self.assertEqual(state.derive(observed).stage, "apply")
        self.assertIn(("/api/v1/namespaces/{namespace}/pods", {"labelSelector": "batch.kubernetes.io/job-name=marketplace-install-demo"}), api.calls)

    def test_pods_need_the_installer_account_and_a_job_uid(self):
        forged = _pod("Running", sa="default")
        api = FakeApi(pods=[forged, _pod("Pending")])
        self.assertEqual([p["status"]["phase"] for p in asyncio.run(state.job_pods(api, NAMESPACE, RUNNING))], ["Pending"])
        orphan = {"metadata": {"ownerReferences": [{"kind": "Job"}]}, "spec": {"serviceAccountName": "ark-marketplace-installer"}}
        self.assertEqual(asyncio.run(state.job_pods(FakeApi(pods=[orphan]), NAMESPACE, _job(uid=None))), [])

    def test_later_revisions_are_not_decoded(self):
        reads = []

        class Counting(_Core):
            async def read_namespaced_secret(self, name, namespace):
                reads.append(name)
                return await super().read_namespaced_secret(name, namespace)

        api = FakeApi(secrets=[_secret_item(RELEASE, 2, "failed")])
        with patch("src.ark_api.marketplace_install.releases.client.CoreV1Api", Counting):
            asyncio.run(state.load(api, NAMESPACE, RELEASE))
            asyncio.run(state.load_all(api, NAMESPACE))
        self.assertEqual(reads, [])

    def test_load_all_skips_pods_of_finished_jobs(self):
        api = FakeApi(jobs=[COMPLETE], secrets=[_secret_item(RELEASE, 1, "deployed")])
        asyncio.run(state.load_all(api, NAMESPACE))
        self.assertFalse(any(path.endswith("/pods") for path, _ in api.calls))

    def test_foreign_job_with_our_name_is_ignored(self):
        api = FakeApi(jobs=[_job(sa="default")])
        observed = asyncio.run(state.load(api, NAMESPACE, RELEASE))
        self.assertIsNone(observed.job)
        self.assertEqual(state.derive(observed).state, "installable")

    def test_finished_job_skips_the_pods(self):
        api = FakeApi(jobs=[COMPLETE], secrets=[_secret_item(RELEASE, 1, "deployed")])
        asyncio.run(state.load(api, NAMESPACE, RELEASE))
        self.assertFalse(any(path.endswith("/pods") for path, _ in api.calls))

    def test_failed_release_reads_the_description(self):
        _Core.payloads = {"sh.helm.release.v1.demo.v1": _payload("context deadline exceeded")}
        api = FakeApi(secrets=[_secret_item(RELEASE, 1, "failed")])
        with patch("src.ark_api.marketplace_install.releases.client.CoreV1Api", _Core):
            observed = asyncio.run(state.load(api, NAMESPACE, RELEASE))
        self.assertEqual(state.derive(observed).state, "timed-out")

    def test_load_all_joins_jobs_and_releases(self):
        other = _job(release="other", name="marketplace-install-other", uid="other-uid")
        fake = _job(release="fake", name="marketplace-install-fake", sa="default")
        misnamed = _job(release="misnamed", name="something-else")
        api = FakeApi(
            jobs=[COMPLETE, other, fake, misnamed],
            secrets=[_secret_item(RELEASE, 1, "deployed"), _secret_item("ark-tenant", 3, "deployed"), _secret_item("ark-tenant", 2, "superseded")],
        )
        observed = asyncio.run(state.load_all(api, NAMESPACE))
        derived = {o.release: state.derive(o).state for o in observed}
        self.assertEqual(derived, {RELEASE: "installed", "other": "installing", "ark-tenant": "platform-managed"})
        self.assertIn(("/apis/batch/v1/namespaces/{namespace}/jobs", {"labelSelector": "ark.mckinsey.com/marketplace-install"}), api.calls)

    def test_load_all_caps_the_release_payload_reads(self):
        secrets = [_secret_item(f"v{i}", 2, "failed") for i in range(5)]
        secrets += [_secret_item(f"r{i}", 1, "failed") for i in range(state.MAX_DESCRIPTIONS + 5)]
        _Core.payloads = {s["metadata"]["name"]: _payload("boom") for s in secrets}
        reads = []

        class Counting(_Core):
            async def read_namespaced_secret(self, name, namespace):
                reads.append(name)
                return await super().read_namespaced_secret(name, namespace)

        with patch("src.ark_api.marketplace_install.releases.client.CoreV1Api", Counting):
            observed = asyncio.run(state.load_all(FakeApi(secrets=secrets), NAMESPACE))
        self.assertEqual(len(observed), state.MAX_DESCRIPTIONS + 10)
        self.assertEqual(len(reads), state.MAX_DESCRIPTIONS)


if __name__ == "__main__":
    unittest.main()
