import asyncio
import unittest
from unittest.mock import patch

from src.ark_api.marketplace_install import events, logs

NAMESPACE = "team-a"
RELEASE = "demo"
JOB = {"metadata": {"name": "marketplace-install-demo", "uid": "job-uid"}}


def _pod(name, uid, created="2026-11-25T09:00:00Z", owner="job-uid", sa="ark-marketplace-installer"):
    return {
        "metadata": {"name": name, "uid": uid, "creationTimestamp": created, "ownerReferences": [{"uid": owner}]},
        "spec": {"serviceAccountName": sa},
    }


def _event(uid, reason, seen, kind="Pod", message="msg", count=None):
    event = {"type": "Warning", "reason": reason, "message": message, "involvedObject": {"uid": uid, "kind": kind, "name": f"{kind}-{uid}"}, "lastTimestamp": seen}
    if count is not None:
        event["count"] = count
    return event


class FakeApi:
    def __init__(self, pods=(), deployments=(), replica_sets=(), event_list=(), fail=None):
        self.lists = {
            "/api/v1/namespaces/{namespace}/pods": list(pods),
            "/apis/apps/v1/namespaces/{namespace}/deployments": list(deployments),
            "/apis/apps/v1/namespaces/{namespace}/replicasets": list(replica_sets),
            "/api/v1/namespaces/{namespace}/events": list(event_list),
        }
        self.fail = fail
        self.paths = []
        self.selectors = []

    async def call_api(self, path, method, query_params=None, **kwargs):
        assert method == "GET", method
        self.paths.append(path)
        if self.fail and path.endswith(self.fail):
            raise RuntimeError("down")
        query = dict(query_params or [])
        if "fieldSelector" in query:
            self.selectors.append(query["fieldSelector"])
            uid = query["fieldSelector"].split("=", 1)[1]
            return {"items": [e for e in self.lists[path] if e["involvedObject"]["uid"] == uid]}
        return {"items": self.lists[path]}


class TestEvents(unittest.TestCase):
    def test_keeps_job_pod_and_release_replica_set_events(self):
        deployment = {"metadata": {"uid": "dep", "annotations": {"meta.helm.sh/release-name": RELEASE}}}
        other_deployment = {"metadata": {"uid": "dep2", "annotations": {"meta.helm.sh/release-name": "other"}}}
        api = FakeApi(
            pods=[_pod("p1", "pod-uid"), _pod("stray", "stray-uid", owner="else")],
            deployments=[deployment, other_deployment],
            replica_sets=[{"metadata": {"uid": "rs", "ownerReferences": [{"uid": "dep"}]}}, {"metadata": {"uid": "rs2", "ownerReferences": [{"uid": "dep2"}]}}],
            event_list=[
                _event("job-uid", "Created", "2026-11-25T09:00:01Z", kind="Job"),
                _event("pod-uid", "Pulled", "2026-11-25T09:00:03Z"),
                _event("rs", "FailedCreate", "2026-11-25T09:00:05Z", kind="ReplicaSet", message="exceeded quota"),
                _event("rs2", "FailedCreate", "2026-11-25T09:00:06Z", kind="ReplicaSet"),
                _event("stray-uid", "Forged", "2026-11-25T09:00:07Z"),
                _event("unrelated", "Other", "2026-11-25T09:00:08Z"),
            ],
        )
        found = asyncio.run(events.collect(api, NAMESPACE, RELEASE, JOB))
        self.assertEqual([e.reason for e in found], ["FailedCreate", "Pulled", "Created"])
        self.assertEqual(sorted(api.selectors), ["involvedObject.uid=job-uid", "involvedObject.uid=pod-uid", "involvedObject.uid=rs"])
        self.assertEqual((found[0].objectKind, found[0].message, found[0].count), ("ReplicaSet", "exceeded quota", 1))

    def test_release_without_job(self):
        deployment = {"metadata": {"uid": "dep", "annotations": {"meta.helm.sh/release-name": RELEASE}}}
        api = FakeApi(deployments=[deployment], replica_sets=[{"metadata": {"uid": "rs", "ownerReferences": [{"uid": "dep"}]}}], event_list=[_event("rs", "FailedCreate", "2026-11-25T09:00:05Z")])
        self.assertEqual([e.reason for e in asyncio.run(events.collect(api, NAMESPACE, RELEASE, None))], ["FailedCreate"])

    def test_nothing_to_match_skips_the_event_list(self):
        api = FakeApi()
        self.assertEqual(asyncio.run(events.collect(api, NAMESPACE, RELEASE, None)), [])
        self.assertNotIn("/api/v1/namespaces/{namespace}/events", api.paths)

    def test_caps_and_cleans(self):
        many = [_event("job-uid", f"R{i:02d}", f"2026-11-25T09:00:{i:02d}Z", kind="Job", message="\x1b[31mred\x1b[0m" + "x" * 900, count=3) for i in range(30)]
        found = asyncio.run(events.collect(FakeApi(event_list=many), NAMESPACE, RELEASE, JOB))
        self.assertEqual(len(found), events.MAX_EVENTS)
        self.assertEqual(found[0].reason, "R29")
        self.assertTrue(found[0].message.startswith("red"))
        self.assertEqual(len(found[0].message), events.MAX_MESSAGE_CHARS)
        self.assertEqual(found[0].count, 3)
        self.assertEqual(found[0].lastSeen.isoformat(), "2026-11-25T09:00:29+00:00")

    def test_a_selector_ignored_by_the_server_still_filters(self):
        class IgnoringSelector(FakeApi):
            async def call_api(self, path, method, query_params=None, **kwargs):
                return {"items": self.lists[path]}

        api = IgnoringSelector(event_list=[_event("job-uid", "Created", "2026-11-25T09:00:01Z", kind="Job"), _event("x", "Other", "2026-11-25T09:00:02Z")])
        self.assertEqual([e.reason for e in asyncio.run(events.collect(api, NAMESPACE, RELEASE, JOB))], ["Created"])

    def test_messages_are_redacted(self):
        found = asyncio.run(events.collect(FakeApi(event_list=[_event("job-uid", "R", "2026-11-25T09:00:01Z", kind="Job", message="pull failed: password=hunter2")]), NAMESPACE, RELEASE, JOB))
        self.assertNotIn("hunter2", found[0].message)

    def test_unparseable_time_is_dropped(self):
        found = asyncio.run(events.collect(FakeApi(event_list=[_event("job-uid", "R", "yesterday", kind="Job")]), NAMESPACE, RELEASE, JOB))
        self.assertIsNone(found[0].lastSeen)

    def test_errors_give_no_events(self):
        api = FakeApi(fail="/events", event_list=[_event("job-uid", "Created", "2026-11-25T09:00:01Z")])
        with self.assertLogs("src.ark_api.marketplace_install.events", "WARNING"):
            self.assertEqual(asyncio.run(events.collect(api, NAMESPACE, RELEASE, JOB)), [])


class FakeCore:
    calls = []
    text = ""
    error = None

    def __init__(self, api):
        pass

    async def read_namespaced_pod_log(self, name, namespace, **kwargs):
        FakeCore.calls.append((name, namespace, kwargs))
        if FakeCore.error:
            raise FakeCore.error
        return FakeCore.text


class TestLogs(unittest.TestCase):
    def setUp(self):
        FakeCore.calls, FakeCore.text, FakeCore.error = [], "", None
        patcher = patch("src.ark_api.marketplace_install.logs.client.CoreV1Api", FakeCore)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_reads_the_newest_pod_with_the_caps(self):
        FakeCore.text = "ok\n"
        api = FakeApi(pods=[_pod("old", "a", "2026-11-25T09:00:00Z"), _pod("new", "b", "2026-11-25T09:05:00Z")])
        self.assertEqual(asyncio.run(logs.job_log(api, NAMESPACE, JOB)), "ok\n")
        self.assertEqual(FakeCore.calls, [("new", NAMESPACE, {"container": "helm", "tail_lines": 100, "limit_bytes": 16384})])

    def test_strips_control_sequences_and_redacts(self):
        FakeCore.text = "\x1b[1mError:\x1b[0m failed\r\n\tAuthorization: Bearer abc.def.ghi\x07\npassword=hunter2\n"
        text = asyncio.run(logs.job_log(FakeApi(pods=[_pod("p", "a")]), NAMESPACE, JOB))
        self.assertNotIn("\x1b", text)
        self.assertNotIn("\x07", text)
        self.assertNotIn("\r", text)
        self.assertIn("\tAuthorization", text)
        self.assertNotIn("abc.def.ghi", text)
        self.assertNotIn("hunter2", text)
        self.assertTrue(text.startswith("Error: failed\n"))

    def test_pods_without_the_installer_account_are_not_read(self):
        FakeCore.text = "forged"
        api = FakeApi(pods=[_pod("real", "a", "2026-11-25T09:00:00Z"), _pod("forged", "b", "2026-11-25T09:05:00Z", sa="default")])
        asyncio.run(logs.job_log(api, NAMESPACE, JOB))
        self.assertEqual([call[0] for call in FakeCore.calls], ["real"])

    def test_no_pod_or_errors_give_no_log(self):
        self.assertIsNone(asyncio.run(logs.job_log(FakeApi(), NAMESPACE, JOB)))
        FakeCore.error = RuntimeError("gone")
        with self.assertLogs("src.ark_api.marketplace_install.logs", "WARNING"):
            self.assertIsNone(asyncio.run(logs.job_log(FakeApi(pods=[_pod("p", "a")]), NAMESPACE, JOB)))


if __name__ == "__main__":
    unittest.main()
