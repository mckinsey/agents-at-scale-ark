import unittest
from unittest.mock import AsyncMock, MagicMock

from ark_sdk import impersonation_patch as ip
from ark_sdk.impersonation import ImpersonationConfig
from ark_sdk.k8s import apply_impersonation_headers


def _collect(headers, name):
    """All values for `name` across a CIMultiDict / HTTPHeaderDict (repeated keys)."""
    return [v for k, v in headers.items() if k == name]


class TestGroupList(unittest.TestCase):
    def test_list_value(self):
        self.assertEqual(ip._group_list({ip._HEADER: ["a", "b"]}), ["a", "b"])

    def test_values_kept_intact(self):
        self.assertEqual(
            ip._group_list({ip._HEADER: ["a,system:masters", " team "]}),
            ["a,system:masters", " team "],
        )

    def test_no_list(self):
        self.assertIsNone(ip._group_list({ip._HEADER: "a,b"}))
        self.assertIsNone(ip._group_list({"Impersonate-User": "u"}))
        self.assertIsNone(ip._group_list(None))


class _SyncHarness:
    def __init__(self):
        from kubernetes.client import rest as srest

        self.srest = srest
        self.saved = srest.RESTClientObject.request
        self.captured = {}

        def fake(_self, *args, **kwargs):
            self.captured["headers"] = kwargs.get("headers")
            return "ok"

        srest.RESTClientObject.request = fake
        ip._patch_sync()

    def send(self, headers):
        return self.srest.RESTClientObject.request(object(), headers=headers)

    def restore(self):
        self.srest.RESTClientObject.request = self.saved


class _AsyncHarness:
    def __init__(self):
        from kubernetes_asyncio.client import rest as arest

        self.arest = arest
        self.saved = arest.RESTClientObject.request
        self.captured = {}

        async def fake(_self, *args, **kwargs):
            self.captured["headers"] = kwargs.get("headers")
            return "ok"

        arest.RESTClientObject.request = fake
        ip._patch_async()

    async def send(self, headers):
        return await self.arest.RESTClientObject.request(object(), headers=headers)

    def restore(self):
        self.arest.RESTClientObject.request = self.saved


class TestSyncPatch(unittest.TestCase):
    def setUp(self):
        self.h = _SyncHarness()
        self.addCleanup(self.h.restore)

    def test_one_header_per_group(self):
        result = self.h.send({"Impersonate-User": "jane@acme.com", ip._HEADER: ["team-a", "admins"]})
        self.assertEqual(result, "ok")
        hdr = self.h.captured["headers"]
        self.assertEqual(_collect(hdr, ip._HEADER), ["team-a", "admins"])
        self.assertEqual(_collect(hdr, "Impersonate-User"), ["jane@acme.com"])

    def test_single_group_list(self):
        self.h.send({"Impersonate-User": "u", ip._HEADER: ["solo"]})
        self.assertEqual(_collect(self.h.captured["headers"], ip._HEADER), ["solo"])

    def test_comma_in_group_is_not_split(self):
        self.h.send({"Impersonate-User": "u", ip._HEADER: ["a,system:masters"]})
        self.assertEqual(_collect(self.h.captured["headers"], ip._HEADER), ["a,system:masters"])

    def test_ldap_dn_stays_one_group(self):
        self.h.send({"Impersonate-User": "u", ip._HEADER: ["cn=devs,ou=groups,dc=corp", "oidc:team"]})
        self.assertEqual(
            _collect(self.h.captured["headers"], ip._HEADER),
            ["cn=devs,ou=groups,dc=corp", "oidc:team"],
        )

    def test_string_value_passes_through_untouched(self):
        original = {"Impersonate-User": "u", ip._HEADER: "a,b"}
        self.h.send(original)
        self.assertIs(self.h.captured["headers"], original)


class TestAsyncPatch(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.h = _AsyncHarness()
        self.addCleanup(self.h.restore)

    async def test_one_header_per_group(self):
        result = await self.h.send({"Impersonate-User": "jane@acme.com", ip._HEADER: ["team-a", "admins"]})
        self.assertEqual(result, "ok")
        hdr = self.h.captured["headers"]
        self.assertEqual(_collect(hdr, ip._HEADER), ["team-a", "admins"])
        self.assertEqual(_collect(hdr, "Impersonate-User"), ["jane@acme.com"])

    async def test_comma_in_group_is_not_split(self):
        await self.h.send({"Impersonate-User": "u", ip._HEADER: ["a,system:masters"]})
        self.assertEqual(_collect(self.h.captured["headers"], ip._HEADER), ["a,system:masters"])

    async def test_ldap_dn_stays_one_group(self):
        await self.h.send({"Impersonate-User": "u", ip._HEADER: ["cn=devs,ou=groups,dc=corp", "oidc:team"]})
        self.assertEqual(
            _collect(self.h.captured["headers"], ip._HEADER),
            ["cn=devs,ou=groups,dc=corp", "oidc:team"],
        )

    async def test_string_value_passes_through_untouched(self):
        original = {"Impersonate-User": "u", ip._HEADER: "a,b"}
        await self.h.send(original)
        self.assertIs(self.h.captured["headers"], original)


_GROUPS = ["team-a", "a,system:masters", "cn=devs,ou=groups,dc=corp"]


class TestSyncApiClientEndToEnd(unittest.TestCase):
    def test_groups_reach_transport_as_separate_headers(self):
        from kubernetes import client as kclient

        ip.apply()
        api = kclient.ApiClient(kclient.Configuration(host="http://k8s.invalid"))
        self.addCleanup(api.close)
        pool = MagicMock()
        pool.request.return_value = MagicMock(status=200)
        api.rest_client.pool_manager = pool

        apply_impersonation_headers(api, ImpersonationConfig(username="jane@acme.com", groups=_GROUPS))
        api.call_api("/api/v1/namespaces", "GET", _preload_content=False)

        headers = pool.request.call_args.kwargs["headers"]
        self.assertEqual(_collect(headers, ip._HEADER), _GROUPS)
        self.assertEqual(_collect(headers, "Impersonate-User"), ["jane@acme.com"])


class TestAsyncApiClientEndToEnd(unittest.IsolatedAsyncioTestCase):
    async def test_groups_reach_transport_as_separate_headers(self):
        from kubernetes_asyncio import client as kclient

        ip.apply()
        api = kclient.ApiClient(kclient.Configuration(host="http://k8s.invalid"))
        self.addAsyncCleanup(api.close)
        pool = MagicMock()
        pool.request = AsyncMock(return_value=MagicMock(status=200))
        pool.close = AsyncMock()
        original_pool = api.rest_client.pool_manager
        self.addAsyncCleanup(original_pool.close)
        api.rest_client.pool_manager = pool

        apply_impersonation_headers(api, ImpersonationConfig(username="jane@acme.com", groups=_GROUPS))
        await api.call_api("/api/v1/namespaces", "GET", _preload_content=False)

        headers = pool.request.call_args.kwargs["headers"]
        self.assertEqual(_collect(headers, ip._HEADER), _GROUPS)
        self.assertEqual(_collect(headers, "Impersonate-User"), ["jane@acme.com"])


class TestApplyIdempotent(unittest.TestCase):
    def test_apply_is_idempotent(self):
        from kubernetes.client import rest as srest
        from kubernetes_asyncio.client import rest as arest

        # k8s.py already applied on import; a second apply must not re-wrap.
        ip.apply()
        sync_first = srest.RESTClientObject.request
        async_first = arest.RESTClientObject.request
        ip.apply()
        self.assertIs(srest.RESTClientObject.request, sync_first)
        self.assertIs(arest.RESTClientObject.request, async_first)
        self.assertTrue(
            getattr(srest.RESTClientObject.request, "_ark_group_patch", False)
        )
        self.assertTrue(
            getattr(arest.RESTClientObject.request, "_ark_group_patch", False)
        )


if __name__ == "__main__":
    unittest.main()
