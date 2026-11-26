import asyncio
import unittest
from unittest.mock import patch

import aiohttp
from kubernetes_asyncio.client.rest import ApiException

from src.ark_api.marketplace_install import install
from src.ark_api.marketplace_install.checks import ObjectRef

NAMESPACE = "team-a"
CONFIG_MAP = ObjectRef("v1", "ConfigMap", "demo", "configmaps", True)
DEPLOYMENT = ObjectRef("apps/v1", "Deployment", "demo", "deployments", True)
MODULE = "src.ark_api.marketplace_install.install"


def _job(conditions=(), sa="ark-marketplace-installer", deleting=False):
    meta = {"name": "marketplace-install-demo", "uid": "job-uid", "labels": {"ark.mckinsey.com/marketplace-install": "demo"}}
    if deleting:
        meta["deletionTimestamp"] = "2026-11-26T10:00:00Z"
    return {
        "metadata": meta,
        "spec": {"template": {"spec": {"serviceAccountName": sa}}},
        "status": {"conditions": [{"type": t, "status": "True"} for t in conditions]},
    }


class FakeApi:
    def __init__(self, objects=None, errors=None):
        self.objects = objects or {}
        self.errors = errors or {}
        self.calls = []

    async def call_api(self, path, method, path_params=None, **kwargs):
        assert method == "GET"
        resolved = path
        for key, value in (path_params or {}).items():
            resolved = resolved.replace("{" + key + "}", value)
        self.calls.append(resolved)
        if resolved in self.errors:
            raise self.errors[resolved]
        if resolved in self.objects:
            return self.objects[resolved]
        raise ApiException(status=404, reason="Not Found")

    def sanitize_for_serialization(self, obj):
        return obj


class TestConflicts(unittest.TestCase):
    def test_paths(self):
        self.assertEqual(install.object_path(CONFIG_MAP), "/api/v1/namespaces/{namespace}/{plural}/{name}")
        self.assertEqual(install.object_path(DEPLOYMENT), "/apis/apps/v1/namespaces/{namespace}/{plural}/{name}")

    def test_nothing_exists(self):
        api = FakeApi()
        self.assertIsNone(asyncio.run(install.existing_conflict(api, NAMESPACE, (CONFIG_MAP, DEPLOYMENT))))
        self.assertEqual(api.calls, ["/api/v1/namespaces/team-a/configmaps/demo", "/apis/apps/v1/namespaces/team-a/deployments/demo"])

    def test_an_object_appeared(self):
        api = FakeApi(objects={"/apis/apps/v1/namespaces/team-a/deployments/demo": {"kind": "Deployment"}})
        self.assertEqual(asyncio.run(install.existing_conflict(api, NAMESPACE, (CONFIG_MAP, DEPLOYMENT))), "Deployment demo now exists in the namespace")

    def test_unreadable_objects_count_as_conflicts(self):
        api = FakeApi(errors={"/api/v1/namespaces/team-a/configmaps/demo": ApiException(status=403, reason="Forbidden")})
        self.assertIn("403", asyncio.run(install.existing_conflict(api, NAMESPACE, (CONFIG_MAP,))))
        api = FakeApi(errors={"/api/v1/namespaces/team-a/configmaps/demo": aiohttp.ClientConnectionError()})
        self.assertIn("could not be reached", asyncio.run(install.existing_conflict(api, NAMESPACE, (CONFIG_MAP,))))

    def test_no_objects(self):
        self.assertIsNone(asyncio.run(install.existing_conflict(FakeApi(), NAMESPACE, ())))


class FakeBatch:
    def __init__(self, create_error=None, delete_error=None):
        self.create_error = create_error
        self.delete_error = delete_error
        self.calls = []

    async def create_namespaced_job(self, namespace, body):
        self.calls.append(("create", namespace, body))
        if self.create_error:
            raise self.create_error
        return {**body, "metadata": {**body["metadata"], "uid": "new-uid"}}

    async def delete_namespaced_job(self, name, namespace, propagation_policy=None):
        self.calls.append(("delete", name, namespace, propagation_policy))
        if self.delete_error:
            raise self.delete_error


JOB_URL = "/apis/batch/v1/namespaces/team-a/jobs/marketplace-install-demo"


class TestCleanup(unittest.TestCase):
    def _run(self, job):
        batch = FakeBatch()
        api = FakeApi(objects={JOB_URL: job} if job else {})
        with patch(f"{MODULE}.client.BatchV1Api", lambda a: batch):
            asyncio.run(install.remove_finished_job(api, NAMESPACE, "demo"))
        return batch.calls

    def test_complete_job_is_deleted_in_the_background(self):
        self.assertEqual(self._run(_job(["Complete"])), [("delete", "marketplace-install-demo", NAMESPACE, "Background")])

    def test_a_job_already_gone_is_fine_but_other_errors_raise(self):
        api = FakeApi(objects={JOB_URL: _job(["Complete"])})
        for error, raises in ((ApiException(status=404), False), (ApiException(status=403), True)):
            batch = FakeBatch(delete_error=error)
            with patch(f"{MODULE}.client.BatchV1Api", lambda a: batch):
                if raises:
                    with self.assertRaises(ApiException):
                        asyncio.run(install.remove_finished_job(api, NAMESPACE, "demo"))
                else:
                    asyncio.run(install.remove_finished_job(api, NAMESPACE, "demo"))

    def test_other_jobs_are_left_alone(self):
        for job in (None, _job(), _job(["Failed"]), _job(["Complete"], sa="default")):
            with self.subTest(job=job):
                self.assertEqual(self._run(job), [])


class TestCreateJob(unittest.TestCase):
    BODY = {"metadata": {"name": "marketplace-install-demo", "labels": {"ark.mckinsey.com/marketplace-install": "demo"}}}

    def _run(self, existing=None, error=ApiException(status=409, reason="Conflict")):
        batch = FakeBatch(create_error=error)
        api = FakeApi(objects={JOB_URL: existing} if existing else {})
        with patch(f"{MODULE}.client.BatchV1Api", lambda a: batch):
            return asyncio.run(install.create_job(api, NAMESPACE, "demo", self.BODY))

    def test_created(self):
        result, job = self._run(error=None)
        self.assertEqual((result, job["metadata"]["uid"]), ("created", "new-uid"))

    def test_existing_ours(self):
        self.assertEqual(self._run(_job())[0], "ours")

    def test_existing_foreign(self):
        self.assertEqual(self._run(_job(sa="default"))[0], "foreign")

    def test_existing_job_of_another_release(self):
        other = _job()
        other["metadata"]["labels"] = {"ark.mckinsey.com/marketplace-install": "other"}
        self.assertEqual(self._run(other)[0], "foreign")

    def test_existing_being_deleted_or_gone(self):
        self.assertEqual(self._run(_job(deleting=True))[0], "deleting")
        self.assertEqual(self._run(None)[0], "deleting")

    def test_other_errors_propagate(self):
        with self.assertRaises(ApiException):
            self._run(error=ApiException(status=403, reason="Forbidden"))


class TestStartedEvent(unittest.TestCase):
    def test_event_on_the_job(self):
        calls = []

        class Core:
            def __init__(self, api):
                pass

            async def create_namespaced_event(self, namespace, body):
                calls.append((namespace, body))

        with patch(f"{MODULE}.client.CoreV1Api", Core):
            asyncio.run(install.started_event(object(), NAMESPACE, _job(), "alice started installing demo from official"))
        namespace, body = calls[0]
        self.assertEqual(namespace, NAMESPACE)
        self.assertEqual(body["involvedObject"], {"apiVersion": "batch/v1", "kind": "Job", "name": "marketplace-install-demo", "namespace": NAMESPACE, "uid": "job-uid"})
        self.assertEqual((body["reason"], body["type"], body["source"]), ("MarketplaceInstallStarted", "Normal", {"component": "ark-api"}))
        self.assertEqual(body["metadata"], {"generateName": "marketplace-install-demo.", "namespace": NAMESPACE})

    def test_connection_errors_are_only_logged(self):
        class Core:
            def __init__(self, api):
                pass

            async def create_namespaced_event(self, namespace, body):
                raise aiohttp.ClientConnectionError()

        with patch(f"{MODULE}.client.CoreV1Api", Core), self.assertLogs(MODULE, "WARNING"):
            asyncio.run(install.started_event(object(), NAMESPACE, _job(), "m"))

    def test_failure_is_only_logged(self):
        class Core:
            def __init__(self, api):
                pass

            async def create_namespaced_event(self, namespace, body):
                raise ApiException(status=403, reason="Forbidden")

        with patch(f"{MODULE}.client.CoreV1Api", Core), self.assertLogs(MODULE, "WARNING"):
            asyncio.run(install.started_event(object(), NAMESPACE, _job(), "m"))


if __name__ == "__main__":
    unittest.main()
