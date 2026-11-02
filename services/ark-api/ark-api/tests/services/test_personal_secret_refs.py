import os
import unittest
from unittest.mock import AsyncMock, patch

os.environ.setdefault("AUTH_MODE", "open")

from fastapi import HTTPException
from kubernetes_asyncio.client.rest import ApiException

from ark_sdk.secret_scope import RESOURCE_TYPE_LABEL, SCOPE_LABEL, SecretScope
from ark_api.services.personal_secret_refs import (
    PERSONAL_SECRET_REF_ERROR,
    SECRET_REF_CHECK_ERROR,
    enforce_personal_secret_refs,
    iter_secret_refs,
    no_personal_refs,
    query_override_header_allows,
)

ALICE = SecretScope.for_user("alice@example.com")
BOB = SecretScope.for_user("bob@example.com")
ALICE_SECRET = ALICE.personal_name("mcp-token")
BOB_SECRET = BOB.personal_name("mcp-token")
ALICE_LABELS = ALICE.create_labels(personal=True)
BOB_LABELS = BOB.create_labels(personal=True)
SHARED_LABELS = SecretScope().create_labels()

OVERRIDE_REF_PATH = ("overrides", 0, "headers", 0, "value", "valueFrom", "secretKeyRef")


def _ref(name, key="token"):
    return {"valueFrom": {"secretKeyRef": {"name": name, "key": key}}}


def _mcp_override(name, label_selector=None, resource_type="mcpserver"):
    override = {"resourceType": resource_type, "headers": [{"name": "Authorization", "value": _ref(name)}]}
    if label_selector is not None:
        override["labelSelector"] = label_selector
    return override


GITHUB_SELECTOR = {"matchLabels": {"ark.mckinsey.com/name": "github"}}


def _query_spec(name, label_selector=GITHUB_SELECTOR, resource_type="mcpserver"):
    return {"input": "hi", "overrides": [_mcp_override(name, label_selector, resource_type)]}


class TestIterSecretRefs(unittest.TestCase):
    def test_query_parameters_and_overrides(self):
        spec = {
            "parameters": [{"name": "p", "value": "x"}, {"name": "q", **_ref("param-secret")}],
            "overrides": [_mcp_override("override-secret", {"matchLabels": {"a": "b"}})],
        }
        self.assertEqual(list(iter_secret_refs(spec)), [
            (("parameters", 1, "valueFrom", "secretKeyRef"), "param-secret"),
            (OVERRIDE_REF_PATH, "override-secret"),
        ])

    def test_model_config_values_and_headers(self):
        spec = {"config": {"openai": {
            "apiKey": _ref("api-key"),
            "baseUrl": {"value": "https://example.com"},
            "headers": [{"name": "X-Org", "value": _ref("org-header")}],
        }}}
        self.assertEqual(list(iter_secret_refs(spec)), [
            (("config", "openai", "apiKey", "valueFrom", "secretKeyRef"), "api-key"),
            (("config", "openai", "headers", 0, "value", "valueFrom", "secretKeyRef"), "org-header"),
        ])

    def test_tool_headers_and_body_parameters(self):
        spec = {"http": {
            "headers": [{"name": "Authorization", "value": _ref("tool-header")}],
            "bodyParameters": [{"name": "token", **_ref("tool-body")}],
        }}
        self.assertEqual(list(iter_secret_refs(spec)), [
            (("http", "headers", 0, "value", "valueFrom", "secretKeyRef"), "tool-header"),
            (("http", "bodyParameters", 0, "valueFrom", "secretKeyRef"), "tool-body"),
        ])

    def test_ignores_config_map_refs_and_missing_names(self):
        spec = {
            "a": {"valueFrom": {"configMapKeyRef": {"name": "u-0123456789abcdef-cm", "key": "k"}}},
            "b": {"valueFrom": {"secretKeyRef": None}},
            "c": {"valueFrom": {"secretKeyRef": {"name": None, "key": "k"}}},
            "d": {"valueFrom": {"secretKeyRef": {"name": 7, "key": "k"}}},
            "e": None,
        }
        self.assertEqual(list(iter_secret_refs(spec)), [])

    def test_matches_secret_key_ref_and_name_in_any_case(self):
        spec = {
            "x": {"valueFrom": {"SecretKeyRef": {"NAME": "upper"}}},
            "y": [{"secretkeyref": {"name": "lower"}}],
            "z": {"\u017fecretKeyRef": {"name": "long-s"}},
        }
        self.assertEqual(list(iter_secret_refs(spec)), [
            (("x", "valueFrom", "SecretKeyRef"), "upper"),
            (("y", 0, "secretkeyref"), "lower"),
            (("z", "\u017fecretKeyRef"), "long-s"),
        ])


class TestQueryOverrideHeaderAllows(unittest.TestCase):
    def test_mcpserver_override_with_match_labels(self):
        self.assertTrue(query_override_header_allows(OVERRIDE_REF_PATH, _query_spec("s")))

    def test_mcpserver_override_with_match_expressions(self):
        selector = {"matchExpressions": [{"key": "ark.mckinsey.com/name", "operator": "In", "values": ["github"]}]}
        self.assertTrue(query_override_header_allows(OVERRIDE_REF_PATH, _query_spec("s", selector)))

    def test_model_override_is_not_allowed(self):
        self.assertFalse(query_override_header_allows(OVERRIDE_REF_PATH, _query_spec("s", resource_type="model")))

    def test_empty_selectors_are_not_allowed(self):
        for selector in (None, {}, {"matchLabels": {}}, {"matchLabels": None, "matchExpressions": None}, {"matchExpressions": []}):
            with self.subTest(selector=selector):
                spec = _query_spec("s", label_selector=None)
                spec["overrides"][0]["labelSelector"] = selector
                self.assertFalse(query_override_header_allows(OVERRIDE_REF_PATH, spec))

    def test_missing_selector_is_not_allowed(self):
        self.assertFalse(query_override_header_allows(OVERRIDE_REF_PATH, _query_spec("s", label_selector=None)))

    def test_parameters_are_not_allowed(self):
        spec = {"parameters": [{"name": "p", **_ref("s")}], **_query_spec("s")}
        self.assertFalse(query_override_header_allows(("parameters", 0, "valueFrom", "secretKeyRef"), spec))

    def test_other_positions_in_an_allowed_override_are_not_allowed(self):
        spec = _query_spec("s")
        for path in (
            ("overrides", 0, "headers", 0, "valueFrom", "secretKeyRef"),
            ("overrides", 0, "labelSelector", "secretKeyRef"),
            ("overrides", "0", "headers", 0, "value", "valueFrom", "secretKeyRef"),
            ("overrides", 1, "headers", 0, "value", "valueFrom", "secretKeyRef"),
            ("overrides", 0, "headers", 0, "value", "valueFrom", "SecretKeyRef"),
            ("overrides", 0, "extra", 0, "value", "valueFrom", "secretKeyRef"),
            ("parameters", 0, "headers", 0, "value", "valueFrom", "secretKeyRef"),
        ):
            with self.subTest(path=path):
                self.assertFalse(query_override_header_allows(path, spec))

    def test_each_override_is_judged_on_its_own(self):
        for invalid in (_mcp_override("s", resource_type="model"), _mcp_override("s")):
            for spec, invalid_index in (
                ({"overrides": [_mcp_override("s", GITHUB_SELECTOR), invalid]}, 1),
                ({"overrides": [invalid, _mcp_override("s", GITHUB_SELECTOR)]}, 0),
            ):
                with self.subTest(invalid=invalid, invalid_index=invalid_index):
                    path = ("overrides", invalid_index) + OVERRIDE_REF_PATH[2:]
                    self.assertFalse(query_override_header_allows(path, spec))
                    self.assertTrue(query_override_header_allows(("overrides", 1 - invalid_index) + OVERRIDE_REF_PATH[2:], spec))

    def test_no_personal_refs_allows_nothing(self):
        self.assertFalse(no_personal_refs(OVERRIDE_REF_PATH, _query_spec("s")))


class TestEnforcePersonalSecretRefs(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        patcher = patch("ark_api.services.personal_secret_refs.read_secret_labels", new_callable=AsyncMock)
        self.read = patcher.start()
        self.addCleanup(patcher.stop)

    def _labels(self, by_name):
        self.read.side_effect = lambda namespace, name: by_name.get(name)

    async def _enforce(self, spec, caller_scope=ALICE, allow=query_override_header_allows):
        await enforce_personal_secret_refs(spec, namespace="team-a", caller_scope=caller_scope, allow=allow)

    async def _assert_rejected(self, spec, caller_scope=ALICE, allow=query_override_header_allows):
        with self.assertRaises(HTTPException) as ctx:
            await self._enforce(spec, caller_scope, allow)
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(ctx.exception.detail, PERSONAL_SECRET_REF_ERROR)
        return ctx.exception

    async def test_unreserved_names_are_never_read(self):
        await self._enforce({"config": {"openai": {"apiKey": _ref("openai-key")}}}, allow=no_personal_refs)
        self.read.assert_not_awaited()

    async def test_shared_ark_secret_is_allowed_anywhere(self):
        self._labels({ALICE_SECRET: SHARED_LABELS})
        await self._enforce({"config": {"openai": {"apiKey": _ref(ALICE_SECRET)}}}, caller_scope=BOB, allow=no_personal_refs)
        self.read.assert_awaited_once_with("team-a", ALICE_SECRET)

    async def test_shared_scope_without_resource_type_is_rejected(self):
        self._labels({ALICE_SECRET: {SCOPE_LABEL: "shared"}})
        await self._assert_rejected({"config": {"openai": {"apiKey": _ref(ALICE_SECRET)}}}, allow=no_personal_refs)

    async def test_wrong_resource_type_is_rejected(self):
        self._labels({ALICE_SECRET: {RESOURCE_TYPE_LABEL: "api-key", SCOPE_LABEL: "shared"}})
        await self._assert_rejected({"config": {"openai": {"apiKey": _ref(ALICE_SECRET)}}}, allow=no_personal_refs)

    async def test_own_scope_without_resource_type_is_rejected(self):
        self._labels({ALICE_SECRET: {SCOPE_LABEL: ALICE.personal_scope()}})
        await self._assert_rejected(_query_spec(ALICE_SECRET))

    async def test_reserved_name_without_labels_is_rejected(self):
        self._labels({ALICE_SECRET: {}})
        await self._assert_rejected(_query_spec(ALICE_SECRET))

    async def test_a_valid_override_does_not_unlock_another_one(self):
        self._labels({ALICE_SECRET: ALICE_LABELS})
        spec = {"overrides": [_mcp_override(ALICE_SECRET, GITHUB_SELECTOR), _mcp_override(ALICE_SECRET, resource_type="model")]}
        await self._assert_rejected(spec)

    async def test_own_personal_secret_in_an_allowed_field(self):
        self._labels({ALICE_SECRET: ALICE_LABELS})
        await self._enforce(_query_spec(ALICE_SECRET))

    async def test_own_personal_secret_in_a_parameter_is_rejected(self):
        self._labels({ALICE_SECRET: ALICE_LABELS})
        await self._assert_rejected({"parameters": [{"name": "p", **_ref(ALICE_SECRET)}]})

    async def test_own_personal_secret_without_a_selector_is_rejected(self):
        self._labels({ALICE_SECRET: ALICE_LABELS})
        await self._assert_rejected(_query_spec(ALICE_SECRET, label_selector=None))

    async def test_own_personal_secret_in_a_model_override_is_rejected(self):
        self._labels({ALICE_SECRET: ALICE_LABELS})
        await self._assert_rejected(_query_spec(ALICE_SECRET, resource_type="model"))

    async def test_own_personal_secret_outside_queries_is_rejected(self):
        self._labels({ALICE_SECRET: ALICE_LABELS})
        await self._assert_rejected(_query_spec(ALICE_SECRET), allow=no_personal_refs)

    async def test_someone_elses_personal_secret_is_rejected(self):
        self._labels({BOB_SECRET: BOB_LABELS})
        await self._assert_rejected(_query_spec(BOB_SECRET))

    async def test_missing_secret_is_rejected(self):
        self._labels({})
        await self._assert_rejected(_query_spec(ALICE_SECRET))

    async def test_caller_without_identity_is_rejected(self):
        self._labels({ALICE_SECRET: ALICE_LABELS})
        await self._assert_rejected(_query_spec(ALICE_SECRET), caller_scope=SecretScope())

    async def test_one_bad_ref_rejects_the_whole_spec(self):
        self._labels({ALICE_SECRET: ALICE_LABELS})
        spec = _query_spec(ALICE_SECRET)
        spec["parameters"] = [{"name": "p", **_ref(ALICE_SECRET)}]
        await self._assert_rejected(spec)

    async def test_each_name_is_read_once(self):
        self._labels({ALICE_SECRET: ALICE_LABELS})
        spec = _query_spec(ALICE_SECRET)
        spec["overrides"][0]["headers"].append({"name": "X-Token", "value": _ref(ALICE_SECRET, key="other")})
        await self._enforce(spec)
        self.read.assert_awaited_once_with("team-a", ALICE_SECRET)

    async def test_rejections_do_not_tell_missing_from_someone_elses(self):
        self._labels({BOB_SECRET: BOB_LABELS})
        missing = await self._assert_rejected(_query_spec(ALICE.personal_name("absent")))
        elses = await self._assert_rejected(_query_spec(BOB_SECRET))
        self._labels({ALICE_SECRET: {SCOPE_LABEL: "shared"}})
        unlabelled_shared = await self._assert_rejected(_query_spec(ALICE_SECRET), allow=no_personal_refs)
        self.assertEqual({missing.detail, elses.detail, unlabelled_shared.detail}, {PERSONAL_SECRET_REF_ERROR})

    async def test_read_errors_become_a_500_without_the_kubernetes_status(self):
        for status in (403, 500):
            with self.subTest(status=status):
                self.read.side_effect = ApiException(status=status, reason="boom")
                with self.assertRaises(HTTPException) as ctx:
                    await self._enforce(_query_spec(ALICE_SECRET))
                self.assertEqual(ctx.exception.status_code, 500)
                self.assertEqual(ctx.exception.detail, SECRET_REF_CHECK_ERROR)
                self.assertIsNone(ctx.exception.__cause__)

    async def test_namespace_defaults_to_the_current_context(self):
        self._labels({ALICE_SECRET: ALICE_LABELS})
        with patch("ark_api.services.personal_secret_refs.get_context", return_value={"namespace": "ctx-ns"}):
            await enforce_personal_secret_refs(
                _query_spec(ALICE_SECRET), namespace=None, caller_scope=ALICE, allow=query_override_header_allows
            )
        self.read.assert_awaited_once_with("ctx-ns", ALICE_SECRET)


if __name__ == "__main__":
    unittest.main()
