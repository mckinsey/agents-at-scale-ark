"""Tests for the multi-group impersonation patch.

ark_sdk/ark-api set Impersonate-Group as a single comma-joined header, which
Kubernetes reads as one bogus group — breaking RBAC for users in >1 group. The
patch splits that comma-joined header into one repeated header per group on both
the sync (kubernetes) and async (kubernetes_asyncio) rest clients.
"""
import asyncio
import unittest

from kubernetes.client import rest as sync_rest
from kubernetes_asyncio.client import rest as async_rest

from ark_api import impersonation_groups_patch as patch


class TestSyncGroupSplit(unittest.TestCase):
    def setUp(self):
        self._orig = sync_rest.RESTClientObject.request
        self.captured = {}

        def fake_request(_self, *args, **kwargs):
            self.captured["headers"] = kwargs.get("headers")
            return "ok"

        sync_rest.RESTClientObject.request = fake_request
        patch._patch_sync()  # wraps fake_request

    def tearDown(self):
        sync_rest.RESTClientObject.request = self._orig

    def _call(self, headers):
        inst = sync_rest.RESTClientObject.__new__(sync_rest.RESTClientObject)
        sync_rest.RESTClientObject.request(inst, "GET", "https://x", headers=headers)
        return self.captured["headers"]

    def test_comma_joined_groups_are_split(self):
        out = self._call(
            {
                "Impersonate-User": "jane@acme.com",
                "Impersonate-Group": "All Firm Users,Admins for ARK",
                "Content-Type": "application/json",
            }
        )
        self.assertEqual(
            out.getlist("Impersonate-Group"),
            ["All Firm Users", "Admins for ARK"],
        )
        self.assertEqual(out["Impersonate-User"], "jane@acme.com")

    def test_single_group_is_left_untouched(self):
        out = self._call(
            {"Impersonate-User": "j", "Impersonate-Group": "Admins for ARK"}
        )
        # no comma -> patch is a no-op, original dict passed through
        self.assertEqual(out["Impersonate-Group"], "Admins for ARK")

    def test_no_impersonation_header_is_noop(self):
        out = self._call({"Content-Type": "application/json"})
        self.assertEqual(out, {"Content-Type": "application/json"})


class TestAsyncGroupSplit(unittest.TestCase):
    def setUp(self):
        self._orig = async_rest.RESTClientObject.request
        self.captured = {}

        async def fake_request(_self, *args, **kwargs):
            self.captured["headers"] = kwargs.get("headers")
            return "ok"

        async_rest.RESTClientObject.request = fake_request
        patch._patch_async()

    def tearDown(self):
        async_rest.RESTClientObject.request = self._orig

    def test_comma_joined_groups_are_split(self):
        inst = async_rest.RESTClientObject.__new__(async_rest.RESTClientObject)
        asyncio.run(
            async_rest.RESTClientObject.request(
                inst,
                "POST",
                "https://x",
                headers={
                    "Impersonate-User": "jane@acme.com",
                    "Impersonate-Group": "team-a,team-b,team-c",
                },
            )
        )
        out = self.captured["headers"]
        self.assertEqual(
            out.getall("Impersonate-Group"), ["team-a", "team-b", "team-c"]
        )


class TestApplyIsIdempotent(unittest.TestCase):
    def test_apply_twice_does_not_double_wrap(self):
        patch.apply()
        first = sync_rest.RESTClientObject.request
        patch.apply()
        self.assertIs(sync_rest.RESTClientObject.request, first)


if __name__ == "__main__":
    unittest.main()
