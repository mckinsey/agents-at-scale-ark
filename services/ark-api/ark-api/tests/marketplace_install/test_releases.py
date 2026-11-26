import asyncio
import base64
import gzip
import json
import time
import tracemalloc
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from src.ark_api.marketplace_install import releases

MODULE = "src.ark_api.marketplace_install.releases"
NAMESPACE = "team-a"


def _item(release, version, status, name=None, resource_version="1"):
    return {
        "metadata": {
            "name": name or f"sh.helm.release.v1.{release}.v{version}",
            "resourceVersion": resource_version,
            "labels": {"owner": "helm", "name": release, "version": str(version), "status": status},
        }
    }


def _encode(payload: bytes) -> str:
    return base64.b64encode(base64.b64encode(payload)).decode()


def _sized(size: int) -> bytes:
    return b'{"a":"' + b"x" * (size - 8) + b'"}'


def _release(description="Release failed", compress=True) -> str:
    data = json.dumps({"name": "demo", "info": {"status": "failed", "description": description}}).encode()
    return _encode(gzip.compress(data) if compress else data)


class FakeApi:
    def __init__(self, items):
        self.items = items
        self.calls = []

    async def call_api(self, path, method, **kwargs):
        self.calls.append((path, method, kwargs))
        return {"kind": "PartialObjectMetadataList", "items": self.items}


class TestRevisions(unittest.TestCase):
    def test_metadata_only_list_with_the_release_selector(self):
        api = FakeApi([_item("demo", 1, "deployed")])
        asyncio.run(releases.latest(api, NAMESPACE, "demo"))
        path, method, kwargs = api.calls[0]
        self.assertEqual(method, "GET")
        self.assertEqual(path, "/api/v1/namespaces/{namespace}/secrets")
        self.assertEqual(kwargs["path_params"], {"namespace": NAMESPACE})
        self.assertEqual(kwargs["query_params"], [("labelSelector", "owner=helm,name=demo")])
        self.assertIn("as=PartialObjectMetadataList", kwargs["header_params"]["Accept"])

    def test_versions_compare_as_numbers(self):
        api = FakeApi([_item("demo", 9, "superseded"), _item("demo", 10, "deployed"), _item("demo", 2, "superseded")])
        revision = asyncio.run(releases.latest(api, NAMESPACE, "demo"))
        self.assertEqual((revision.version, revision.status), (10, "deployed"))

    def test_no_revisions(self):
        self.assertIsNone(asyncio.run(releases.latest(FakeApi([]), NAMESPACE, "demo")))

    def test_malformed_labels_are_ignored(self):
        broken = [
            {"metadata": {"name": "x", "labels": {"name": "demo", "version": "v1", "status": "deployed"}}},
            {"metadata": {"name": "y", "labels": {"name": "demo", "status": "deployed"}}},
            {"metadata": {"labels": {"name": "demo", "version": "3", "status": "deployed"}}},
            {"metadata": "nope"},
            "nope",
            _item("demo", 1, "failed"),
        ]
        revision = asyncio.run(releases.latest(FakeApi(broken), NAMESPACE, "demo"))
        self.assertEqual((revision.version, revision.status), (1, "failed"))

    def test_non_list_response(self):
        api = FakeApi(None)
        self.assertEqual(asyncio.run(releases.latest_all(api, NAMESPACE)), {})

    def test_keeps_the_resource_version(self):
        revision = asyncio.run(releases.latest(FakeApi([_item("demo", 1, "failed", resource_version="42")]), NAMESPACE, "demo"))
        self.assertEqual(revision.resource_version, "42")

    def test_latest_all_groups_by_release(self):
        api = FakeApi([_item("a", 1, "superseded"), _item("a", 2, "deployed"), _item("b", 1, "failed")])
        latest = asyncio.run(releases.latest_all(api, NAMESPACE))
        self.assertEqual({name: r.version for name, r in latest.items()}, {"a": 2, "b": 1})
        self.assertEqual(api.calls[0][2]["query_params"], [("labelSelector", "owner=helm")])


class TestDecode(unittest.TestCase):
    def test_gzip_release(self):
        self.assertEqual(releases.decode_release(_release("boom"))["info"]["description"], "boom")

    def test_plain_release(self):
        self.assertEqual(releases.decode_release(_release("plain", compress=False))["info"]["description"], "plain")

    def test_gzip_bomb_is_refused_quickly(self):
        bomb = gzip.compress(b"{" + b" " * (16 * 1024 * 1024))
        self.assertLess(len(bomb), 32 * 1024)
        started = time.monotonic()
        self.assertIsNone(releases.decode_release(_encode(bomb)))
        self.assertLess(time.monotonic() - started, 1.0)

    def test_cap_is_four_mebibytes(self):
        self.assertEqual(releases.MAX_RELEASE_BYTES, 4 * 1024 * 1024)

    def test_cap_boundaries(self):
        cap = releases.MAX_RELEASE_BYTES
        self.assertIsNotNone(releases.decode_release(_encode(gzip.compress(_sized(cap)))))
        self.assertIsNone(releases.decode_release(_encode(gzip.compress(_sized(cap + 1)))))
        self.assertIsNotNone(releases.decode_release(_encode(_sized(cap))))
        self.assertIsNone(releases.decode_release(_encode(_sized(cap + 1))))

    def test_bomb_memory_stays_bounded(self):
        bomb = _encode(gzip.compress(b"{" + b" " * (64 * 1024 * 1024)))
        tracemalloc.start()
        try:
            self.assertIsNone(releases.decode_release(bomb))
            peak = tracemalloc.get_traced_memory()[1]
        finally:
            tracemalloc.stop()
        self.assertLess(peak, 3 * releases.MAX_RELEASE_BYTES)

    def test_deep_nesting_is_refused(self):
        self.assertIsNone(releases.decode_release(_encode(gzip.compress(b"[" * 3_000_000))))

    def test_broken_payloads(self):
        for encoded in ("not base64!", _encode(b"\x1f\x8b\x08broken"), _encode(b"[1, 2]"), _encode(b"\xff\xfe")):
            self.assertIsNone(releases.decode_release(encoded), encoded)


class TestFailureDescription(unittest.TestCase):
    def setUp(self):
        releases.clear_cache()
        self.addCleanup(releases.clear_cache)

    def _read(self, secret=None, error=None):
        calls = []

        class Core:
            def __init__(self, api):
                pass

            async def read_namespaced_secret(self, name, namespace):
                calls.append((name, namespace))
                if error:
                    raise error
                return secret

        return Core, calls

    def test_reads_the_description_of_the_revision(self):
        core, calls = self._read(SimpleNamespace(data={"release": _release("context deadline exceeded")}))
        revision = releases.Revision("demo", 1, "failed", "sh.helm.release.v1.demo.v1")
        with patch(f"{MODULE}.client.CoreV1Api", core):
            description = asyncio.run(releases.failure_description(object(), NAMESPACE, revision))
        self.assertEqual(description, "context deadline exceeded")
        self.assertEqual(calls, [("sh.helm.release.v1.demo.v1", NAMESPACE)])

    def test_unreadable_or_undecodable_release(self):
        revision = releases.Revision("demo", 1, "failed", "s")
        for core, _ in (self._read(error=RuntimeError("down")), self._read(SimpleNamespace(data={})), self._read(SimpleNamespace(data={"release": "!!"}))):
            with patch(f"{MODULE}.client.CoreV1Api", core):
                self.assertIsNone(asyncio.run(releases.failure_description(object(), NAMESPACE, revision)))

    def test_decodes_each_resource_version_once(self):
        core, calls = self._read(SimpleNamespace(data={"release": _release("boom")}))
        first = releases.Revision("demo", 1, "failed", "s", "7")
        with patch(f"{MODULE}.client.CoreV1Api", core):
            for _ in range(3):
                self.assertEqual(asyncio.run(releases.failure_description(object(), NAMESPACE, first)), "boom")
            asyncio.run(releases.failure_description(object(), NAMESPACE, releases.Revision("demo", 1, "failed", "s", "8")))
            asyncio.run(releases.failure_description(object(), "other", first))
        self.assertEqual(len(calls), 3)

    def test_undecodable_payloads_are_remembered_but_read_errors_are_not(self):
        core, calls = self._read(SimpleNamespace(data={"release": "!!"}))
        revision = releases.Revision("demo", 1, "failed", "s", "7")
        with patch(f"{MODULE}.client.CoreV1Api", core):
            asyncio.run(releases.failure_description(object(), NAMESPACE, revision))
            asyncio.run(releases.failure_description(object(), NAMESPACE, revision))
        self.assertEqual(len(calls), 1)
        failing, failing_calls = self._read(error=RuntimeError("down"))
        with patch(f"{MODULE}.client.CoreV1Api", failing):
            asyncio.run(releases.failure_description(object(), NAMESPACE, releases.Revision("demo", 1, "failed", "t", "9")))
            asyncio.run(releases.failure_description(object(), NAMESPACE, releases.Revision("demo", 1, "failed", "t", "9")))
        self.assertEqual(len(failing_calls), 2)

    def test_without_a_resource_version_nothing_is_cached(self):
        core, calls = self._read(SimpleNamespace(data={"release": _release("boom")}))
        revision = releases.Revision("demo", 1, "failed", "s")
        with patch(f"{MODULE}.client.CoreV1Api", core):
            asyncio.run(releases.failure_description(object(), NAMESPACE, revision))
            asyncio.run(releases.failure_description(object(), NAMESPACE, revision))
        self.assertEqual(len(calls), 2)

    def test_cache_is_bounded(self):
        core, _ = self._read(SimpleNamespace(data={"release": _release("boom")}))
        with patch(f"{MODULE}.client.CoreV1Api", core):
            for i in range(releases.MAX_CACHED_DESCRIPTIONS + 10):
                asyncio.run(releases.failure_description(object(), NAMESPACE, releases.Revision("demo", 1, "failed", f"s{i}", "1")))
        self.assertEqual(len(releases._descriptions), releases.MAX_CACHED_DESCRIPTIONS)

    def test_never_uses_the_secret_client(self):
        core, _ = self._read(SimpleNamespace(data={"release": _release()}))
        revision = releases.Revision("demo", 1, "failed", "s")
        with patch(f"{MODULE}.client.CoreV1Api", core), patch("ark_sdk.k8s.SecretClient", side_effect=AssertionError("SecretClient")):
            asyncio.run(releases.failure_description(object(), NAMESPACE, revision))


if __name__ == "__main__":
    unittest.main()
