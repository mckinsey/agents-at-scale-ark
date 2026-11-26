import asyncio
import os
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

import aiohttp
from kubernetes_asyncio.client.rest import ApiException

from src.ark_api.marketplace_install import lock

NOW = datetime(2026, 11, 26, 10, 0, tzinfo=timezone.utc)
RUNNING = {"status": {"conditions": []}}
COMPLETE = {"status": {"conditions": [{"type": "Complete", "status": "True"}]}}
FAILED = {"status": {"conditions": [{"type": "Failed", "status": "True"}]}}


class FakeLeases:
    def __init__(self, holder=None, age=0):
        self.version = 0
        self.lease = None
        self.calls = []
        if holder is not None:
            self._put(holder, NOW - timedelta(seconds=age))

    def _put(self, holder, created):
        self.version += 1
        self.lease = lock.Lease(holder, str(self.version), created)

    async def create(self, holder):
        self.calls.append(("create", holder))
        await asyncio.sleep(0)
        if self.lease is not None:
            return None
        self._put(holder, NOW)
        return self.lease.resource_version

    async def read(self):
        self.calls.append(("read",))
        await asyncio.sleep(0)
        return self.lease

    async def delete(self, resource_version):
        self.calls.append(("delete", resource_version))
        await asyncio.sleep(0)
        if self.lease is None or self.lease.resource_version != resource_version:
            return False
        self.lease = None
        return True


def _jobs(**by_holder):
    async def job_of(holder):
        return by_holder.get(holder)

    return job_of


def _acquire(leases, release="demo", job_of=None):
    return asyncio.run(lock.acquire(leases, release, job_of or _jobs(), now=NOW))


class TestAcquire(unittest.TestCase):
    def setUp(self):
        patcher = patch.dict(os.environ, {}, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_free_lock(self):
        leases = FakeLeases()
        self.assertEqual(_acquire(leases), lock.Acquired("1"))
        self.assertEqual(leases.lease.holder, "demo")

    def test_other_item_with_an_active_job(self):
        leases = FakeLeases("other", age=300)
        self.assertEqual(_acquire(leases, job_of=_jobs(other=RUNNING)), lock.Held("other"))
        self.assertEqual(leases.lease.holder, "other")

    def test_other_item_without_job_and_a_young_lease(self):
        leases = FakeLeases("other", age=29)
        self.assertEqual(_acquire(leases), lock.Held("other"))

    def test_other_item_without_job_and_a_stale_lease(self):
        leases = FakeLeases("other", age=31)
        self.assertEqual(_acquire(leases), lock.Acquired("2"))
        self.assertEqual(leases.lease.holder, "demo")

    def test_stale_threshold_from_env(self):
        with patch.dict(os.environ, {lock.LOCK_STALE_ENV: "5"}):
            self.assertEqual(_acquire(FakeLeases("other", age=6)), lock.Acquired("2"))
        with patch.dict(os.environ, {lock.LOCK_STALE_ENV: "nope"}):
            self.assertEqual(_acquire(FakeLeases("other", age=29)), lock.Held("other"))

    def test_other_item_whose_job_finished(self):
        for job in (COMPLETE, FAILED):
            with self.subTest(job=job):
                leases = FakeLeases("other", age=1)
                self.assertEqual(_acquire(leases, job_of=_jobs(other=job)), lock.Acquired("2"))

    def test_same_item_with_an_active_job_resumes(self):
        leases = FakeLeases("demo")
        self.assertEqual(_acquire(leases, job_of=_jobs(demo=RUNNING)), lock.Resumed(RUNNING))
        self.assertNotIn("delete", [c[0] for c in leases.calls])

    def test_same_item_without_job_renews_its_lease(self):
        leases = FakeLeases("demo", age=300)
        self.assertEqual(_acquire(leases), lock.Acquired("2"))
        self.assertEqual(leases.lease.created, NOW)
        self.assertIn(("delete", "1"), leases.calls)

    def test_lease_vanished_and_the_retry_lost(self):
        leases = FakeLeases("other")

        async def none(*args):
            return None

        leases.create = none
        leases.read = none
        self.assertEqual(_acquire(leases), lock.Held(""))

    def test_stale_boundary(self):
        self.assertEqual(_acquire(FakeLeases("other", age=30)), lock.Held("other"))

    def test_non_positive_stale_env_falls_back(self):
        for value in ("0", "-3"):
            with patch.dict(os.environ, {lock.LOCK_STALE_ENV: value}, clear=True):
                self.assertEqual(_acquire(FakeLeases("other", age=29)), lock.Held("other"))

    def test_same_item_with_a_finished_job_takes_over(self):
        leases = FakeLeases("demo", age=1)
        self.assertEqual(_acquire(leases, job_of=_jobs(demo=COMPLETE)), lock.Acquired("2"))

    def test_lease_without_creation_time_is_never_stale(self):
        leases = FakeLeases()
        leases.lease = lock.Lease("other", "7", None)
        self.assertEqual(_acquire(leases), lock.Held("other"))

    def test_lease_gone_between_create_and_read(self):
        leases = FakeLeases("other")

        async def vanish():
            leases.calls.append(("read",))
            leases.lease = None
            return None

        leases.read = vanish
        self.assertEqual(_acquire(leases), lock.Acquired("2"))

    def test_takeover_is_tried_once(self):
        leases = FakeLeases("other", age=60)

        async def lose(resource_version):
            leases.calls.append(("delete", resource_version))
            return False

        leases.delete = lose
        self.assertEqual(_acquire(leases), lock.Held("other"))
        self.assertEqual([c[0] for c in leases.calls].count("create"), 1)

    def test_lost_create_after_takeover(self):
        leases = FakeLeases("other", age=60)
        original = leases.delete

        async def delete_then_lose(resource_version):
            result = await original(resource_version)
            leases._put("third", NOW)
            return result

        leases.delete = delete_then_lose
        self.assertEqual(_acquire(leases), lock.Held("other"))


class TestConcurrency(unittest.TestCase):
    def setUp(self):
        patcher = patch.dict(os.environ, {}, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_concurrent_creates_have_one_winner(self):
        leases = FakeLeases()

        async def both():
            return await asyncio.gather(
                lock.acquire(leases, "first", _jobs(), now=NOW),
                lock.acquire(leases, "second", _jobs(), now=NOW),
            )

        outcomes = asyncio.run(both())
        self.assertEqual(sum(isinstance(o, lock.Acquired) for o in outcomes), 1)
        self.assertEqual(sum(isinstance(o, lock.Held) for o in outcomes), 1)
        winner = "first" if isinstance(outcomes[0], lock.Acquired) else "second"
        self.assertEqual(leases.lease.holder, winner)

    def test_a_retried_item_cannot_share_its_stale_lease(self):
        leases = FakeLeases("first", age=120)

        async def both():
            return await asyncio.gather(
                lock.acquire(leases, "first", _jobs(), now=NOW),
                lock.acquire(leases, "second", _jobs(), now=NOW),
            )

        outcomes = asyncio.run(both())
        self.assertEqual(sum(isinstance(o, lock.Acquired) for o in outcomes), 1, outcomes)

    def test_concurrent_takeovers_of_a_stale_lease_have_one_winner(self):
        leases = FakeLeases("old", age=120)

        async def both():
            return await asyncio.gather(
                lock.acquire(leases, "first", _jobs(), now=NOW),
                lock.acquire(leases, "second", _jobs(), now=NOW),
            )

        outcomes = asyncio.run(both())
        self.assertEqual(sum(isinstance(o, lock.Acquired) for o in outcomes), 1)
        self.assertIn(leases.lease.holder, ("first", "second"))


class FakeCoordination:
    def __init__(self, create_error=None, read=None, read_error=None, delete_error=None):
        self.create_error, self.read_result, self.read_error, self.delete_error = create_error, read, read_error, delete_error
        self.calls = []

    async def create_namespaced_lease(self, namespace, body):
        self.calls.append(("create", namespace, body))
        if self.create_error:
            raise self.create_error
        return SimpleNamespace(metadata=SimpleNamespace(resource_version="5"))

    async def read_namespaced_lease(self, name, namespace):
        self.calls.append(("read", name, namespace))
        if self.read_error:
            raise self.read_error
        return self.read_result

    async def delete_namespaced_lease(self, name, namespace, body=None):
        self.calls.append(("delete", name, namespace, body))
        if self.delete_error:
            raise self.delete_error


class TestLeasesAdapter(unittest.TestCase):
    def _leases(self, fake):
        with patch("src.ark_api.marketplace_install.lock.client.CoordinationV1Api", lambda api: fake):
            return lock.Leases(object(), "team-a")

    def test_create_names_the_lock_and_the_holder(self):
        fake = FakeCoordination()
        self.assertEqual(asyncio.run(self._leases(fake).create("demo")), "5")
        _, namespace, body = fake.calls[0]
        self.assertEqual((namespace, body.metadata.name, body.spec.holder_identity), ("team-a", "marketplace-install-lock", "demo"))

    def test_create_conflict_and_other_errors(self):
        self.assertIsNone(asyncio.run(self._leases(FakeCoordination(create_error=ApiException(status=409))).create("demo")))
        with self.assertRaises(ApiException):
            asyncio.run(self._leases(FakeCoordination(create_error=ApiException(status=403))).create("demo"))

    def test_read_and_delete_errors_propagate(self):
        with self.assertRaises(ApiException):
            asyncio.run(self._leases(FakeCoordination(read_error=ApiException(status=403))).read())
        with self.assertRaises(ApiException):
            asyncio.run(self._leases(FakeCoordination(delete_error=ApiException(status=500))).delete("9"))

    def test_read_without_spec(self):
        found = SimpleNamespace(spec=None, metadata=SimpleNamespace(resource_version="9", creation_timestamp=None))
        self.assertEqual(asyncio.run(self._leases(FakeCoordination(read=found)).read()).holder, "")

    def test_read(self):
        created = NOW - timedelta(seconds=3)
        found = SimpleNamespace(spec=SimpleNamespace(holder_identity="demo"), metadata=SimpleNamespace(resource_version="9", creation_timestamp=created))
        self.assertEqual(asyncio.run(self._leases(FakeCoordination(read=found)).read()), lock.Lease("demo", "9", created))
        self.assertIsNone(asyncio.run(self._leases(FakeCoordination(read_error=ApiException(status=404))).read()))

    def test_delete_uses_the_resource_version_precondition(self):
        fake = FakeCoordination()
        self.assertTrue(asyncio.run(self._leases(fake).delete("9")))
        _, name, namespace, body = fake.calls[0]
        self.assertEqual((name, namespace, body.preconditions.resource_version), ("marketplace-install-lock", "team-a", "9"))
        for status in (404, 409):
            self.assertFalse(asyncio.run(self._leases(FakeCoordination(delete_error=ApiException(status=status))).delete("9")))

    def test_release_ignores_errors(self):
        asyncio.run(lock.release_if_ours(self._leases(FakeCoordination(delete_error=ApiException(status=500))), "9"))
        asyncio.run(lock.release_if_ours(self._leases(FakeCoordination(delete_error=aiohttp.ClientConnectionError())), "9"))


if __name__ == "__main__":
    unittest.main()
