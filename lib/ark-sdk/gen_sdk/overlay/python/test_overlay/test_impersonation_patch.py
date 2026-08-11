import unittest

from ark_sdk import impersonation_patch as ip


def _collect(headers, name):
    """All values for `name` across a CIMultiDict / HTTPHeaderDict (repeated keys)."""
    return [v for k, v in headers.items() if k == name]


class TestSplitHelpers(unittest.TestCase):
    def test_split_basic(self):
        self.assertEqual(ip._split("team-a,admins"), ["team-a", "admins"])

    def test_split_strips_whitespace_and_drops_empties(self):
        self.assertEqual(ip._split(" team-a , , admins "), ["team-a", "admins"])

    def test_needs_split_only_when_comma_present(self):
        self.assertTrue(ip._needs_split({ip._HEADER: "a,b"}))
        self.assertFalse(ip._needs_split({ip._HEADER: "a"}))
        self.assertFalse(ip._needs_split({"Impersonate-User": "u"}))
        self.assertFalse(ip._needs_split(None))


class TestSyncPatch(unittest.TestCase):
    def test_comma_joined_group_becomes_repeated_headers(self):
        from kubernetes.client import rest as srest

        saved = srest.RESTClientObject.request
        captured = {}

        def fake(self, *args, **kwargs):
            captured["headers"] = kwargs.get("headers")
            return "ok"

        srest.RESTClientObject.request = fake
        try:
            ip._patch_sync()
            result = srest.RESTClientObject.request(
                object(),
                headers={
                    "Impersonate-User": "jane@acme.com",
                    ip._HEADER: "team-a,admins",
                },
            )
            self.assertEqual(result, "ok")
            hdr = captured["headers"]
            self.assertEqual(_collect(hdr, ip._HEADER), ["team-a", "admins"])
            self.assertEqual(_collect(hdr, "Impersonate-User"), ["jane@acme.com"])
        finally:
            srest.RESTClientObject.request = saved

    def test_no_comma_passes_through_untouched(self):
        from kubernetes.client import rest as srest

        saved = srest.RESTClientObject.request
        captured = {}

        def fake(self, *args, **kwargs):
            captured["headers"] = kwargs.get("headers")
            return "ok"

        srest.RESTClientObject.request = fake
        try:
            ip._patch_sync()
            original = {"Impersonate-User": "u", ip._HEADER: "solo"}
            srest.RESTClientObject.request(object(), headers=original)
            # Single group: header dict is handed through unchanged.
            self.assertIs(captured["headers"], original)
        finally:
            srest.RESTClientObject.request = saved


class TestAsyncPatch(unittest.IsolatedAsyncioTestCase):
    async def test_comma_joined_group_becomes_repeated_headers(self):
        from kubernetes_asyncio.client import rest as arest

        saved = arest.RESTClientObject.request
        captured = {}

        async def fake(self, *args, **kwargs):
            captured["headers"] = kwargs.get("headers")
            return "ok"

        arest.RESTClientObject.request = fake
        try:
            ip._patch_async()
            result = await arest.RESTClientObject.request(
                object(),
                headers={
                    "Impersonate-User": "jane@acme.com",
                    ip._HEADER: "team-a,admins",
                },
            )
            self.assertEqual(result, "ok")
            hdr = captured["headers"]
            self.assertEqual(_collect(hdr, ip._HEADER), ["team-a", "admins"])
            self.assertEqual(_collect(hdr, "Impersonate-User"), ["jane@acme.com"])
        finally:
            arest.RESTClientObject.request = saved


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
