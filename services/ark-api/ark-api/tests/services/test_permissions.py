"""Tests for ark permission preflight (SelfSubjectRulesReview)."""

import os
import unittest
from unittest.mock import AsyncMock, Mock, patch

os.environ.setdefault("AUTH_MODE", "open")

from ark_sdk.impersonation import ImpersonationConfig

from ark_api.core.permissions import (
    UNAVAILABLE_REASON,
    build_ark_rules,
    can_edit_from_rules,
    get_ark_permissions,
    user_can_edit,
)


def _rule(api_groups, resources, verbs):
    rule = Mock()
    rule.api_groups = api_groups
    rule.resources = resources
    rule.verbs = verbs
    return rule


class TestBuildArkRules(unittest.TestCase):
    def test_namespaced_binding(self):
        rules = build_ark_rules(
            [_rule(["ark.mckinsey.com"], ["agents", "models"], ["get", "list"])]
        )
        self.assertEqual(rules, {"agents": ["get", "list"], "models": ["get", "list"]})

    def test_ignores_other_groups(self):
        rules = build_ark_rules([_rule([""], ["pods"], ["get"])])
        self.assertEqual(rules, {})

    def test_wildcard_group_and_resource(self):
        rules = build_ark_rules([_rule(["*"], ["*"], ["*"])])
        self.assertEqual(rules, {"*": ["*"]})

    def test_merges_and_dedupes_verbs(self):
        rules = build_ark_rules(
            [
                _rule(["ark.mckinsey.com"], ["queries"], ["get", "list"]),
                _rule(["ark.mckinsey.com"], ["queries"], ["list", "create"]),
            ]
        )
        self.assertEqual(rules, {"queries": ["create", "get", "list"]})

    def test_empty(self):
        self.assertEqual(build_ark_rules([]), {})
        self.assertEqual(build_ark_rules(None), {})


def _access_review(allowed_resources=(), verb="list", raises=None):
    """Build a create_self_subject_access_review mock.

    Returns allowed=True only when the submitted review names a resource in
    ``allowed_resources`` AND its verb equals ``verb``. Asserting the verb is
    deliberate: user_can_edit checks ``create`` while the permissions fallback
    checks ``list``, and that distinction is the whole point of the edit gate.
    """
    if raises is not None:
        return AsyncMock(side_effect=raises)

    def _call(body):
        attrs = body.spec.resource_attributes
        review = Mock()
        review.status.allowed = (
            attrs.resource in allowed_resources and attrs.verb == verb
        )
        return review

    return AsyncMock(side_effect=_call)


def _mock_helper(review=None, raises=None, access=None):
    """Patch get_impersonating_api_client to yield an AuthorizationV1Api mock."""
    api = AsyncMock()
    if raises is not None:
        api.create_self_subject_rules_review = AsyncMock(side_effect=raises)
    else:
        api.create_self_subject_rules_review = AsyncMock(return_value=review)
    api.create_self_subject_access_review = access or _access_review()
    cm = AsyncMock()
    cm.__aenter__.return_value = Mock()
    cm.__aexit__.return_value = False
    return api, cm


class TestGetArkPermissions(unittest.IsolatedAsyncioTestCase):
    async def test_open_mode_no_impersonation_is_unrestricted(self):
        # Open mode performs no auth, so there is no identity to impersonate;
        # that is not an error — access is unrestricted.
        with patch.dict(os.environ, {"AUTH_MODE": "open"}):
            result = await get_ark_permissions(None, "default")
        self.assertEqual(result.status, "ok")
        self.assertEqual(result.rules, {"*": ["*"]})

    async def test_sso_mode_no_impersonation_unavailable(self):
        # Auth-enabled modes with no identity still cannot evaluate permissions.
        with patch.dict(os.environ, {"AUTH_MODE": "sso"}):
            result = await get_ark_permissions(None, "default")
        self.assertEqual(result.status, "unavailable")
        self.assertEqual(result.rules, {})

    async def test_ok_with_rules(self):
        review = Mock()
        review.status.incomplete = False
        review.status.evaluation_error = None
        review.status.resource_rules = [
            _rule(["ark.mckinsey.com"], ["agents"], ["get", "list"])
        ]
        api, cm = _mock_helper(review=review)
        with patch(
            "ark_api.api.v1.client_utils.get_impersonating_api_client", return_value=cm
        ), patch(
            "ark_api.core.permissions.client.AuthorizationV1Api", return_value=api
        ):
            result = await get_ark_permissions(
                ImpersonationConfig(username="u", groups=["g"]), "default"
            )
        self.assertEqual(result.status, "ok")
        self.assertEqual(result.rules, {"agents": ["get", "list"]})

    async def test_incomplete_falls_back_to_access_reviews(self):
        # An incomplete rules review (e.g. EKS webhook authorizer cannot resolve
        # user rules) falls back to concrete access reviews rather than reporting
        # the authorization service as unavailable.
        review = Mock()
        review.status.incomplete = True
        review.status.evaluation_error = (
            "webhook authorizer does not support user rule resolution"
        )
        review.status.resource_rules = []
        api, cm = _mock_helper(
            review=review,
            access=_access_review(allowed_resources={"agents", "models"}),
        )
        with patch(
            "ark_api.api.v1.client_utils.get_impersonating_api_client", return_value=cm
        ), patch(
            "ark_api.core.permissions.client.AuthorizationV1Api", return_value=api
        ):
            result = await get_ark_permissions(
                ImpersonationConfig(username="u", groups=["g"]), "default"
            )
        self.assertEqual(result.status, "ok")
        self.assertEqual(result.rules, {"agents": ["list"], "models": ["list"]})

    async def test_incomplete_access_reviews_all_denied(self):
        # Access reviews complete but grant nothing: this is a genuine "no access"
        # result (dashboard shows Access denied), not "unavailable".
        review = Mock()
        review.status.incomplete = True
        review.status.evaluation_error = "no rule resolution"
        review.status.resource_rules = []
        api, cm = _mock_helper(review=review, access=_access_review(allowed_resources=set()))
        with patch(
            "ark_api.api.v1.client_utils.get_impersonating_api_client", return_value=cm
        ), patch(
            "ark_api.core.permissions.client.AuthorizationV1Api", return_value=api
        ):
            result = await get_ark_permissions(
                ImpersonationConfig(username="u", groups=["g"]), "default"
            )
        self.assertEqual(result.status, "ok")
        self.assertEqual(result.rules, {})

    async def test_incomplete_access_reviews_fail_unavailable(self):
        # If the fallback access reviews themselves cannot be completed, that is a
        # genuine authorization failure and must stay unavailable.
        review = Mock()
        review.status.incomplete = True
        review.status.evaluation_error = "no rule resolution"
        review.status.resource_rules = []
        api, cm = _mock_helper(
            review=review, access=_access_review(raises=RuntimeError("boom"))
        )
        with patch(
            "ark_api.api.v1.client_utils.get_impersonating_api_client", return_value=cm
        ), patch(
            "ark_api.core.permissions.client.AuthorizationV1Api", return_value=api
        ):
            result = await get_ark_permissions(
                ImpersonationConfig(username="u", groups=["g"]), "default"
            )
        self.assertEqual(result.status, "unavailable")
        self.assertEqual(result.reason, UNAVAILABLE_REASON)
        self.assertNotIn("boom", result.reason or "")

    async def test_review_raises_returns_generic_reason(self):
        api, cm = _mock_helper(raises=RuntimeError("boom"))
        with patch(
            "ark_api.api.v1.client_utils.get_impersonating_api_client", return_value=cm
        ), patch(
            "ark_api.core.permissions.client.AuthorizationV1Api", return_value=api
        ):
            result = await get_ark_permissions(
                ImpersonationConfig(username="u", groups=["g"]), "default"
            )
        self.assertEqual(result.status, "unavailable")
        # Exception text must not leak to the client.
        self.assertEqual(result.reason, UNAVAILABLE_REASON)
        self.assertNotIn("boom", result.reason or "")


class TestCanEditFromRules(unittest.TestCase):
    """can_edit_from_rules derives the edit decision from a fetched rule map."""

    def test_wildcard_verb_is_editable(self):
        self.assertTrue(can_edit_from_rules({"*": ["*"]}))

    def test_wildcard_resource_with_create_is_editable(self):
        self.assertTrue(can_edit_from_rules({"*": ["create"]}))

    def test_create_on_editable_resource_is_editable(self):
        self.assertTrue(
            can_edit_from_rules({"agents": ["get", "list", "create"]})
        )

    def test_create_on_queries_only_is_not_editable(self):
        # Chat creates a Query, so create-on-queries must NOT count as editing;
        # queries is excluded from EDITABLE_RESOURCES.
        self.assertFalse(
            can_edit_from_rules({"queries": ["get", "list", "create"]})
        )

    def test_reader_rules_are_not_editable(self):
        # Authoritative rules (verbs beyond list) with no create -> read-only.
        self.assertFalse(
            can_edit_from_rules(
                {"agents": ["get", "list", "watch"], "models": ["get"]}
            )
        )

    def test_list_only_rules_are_inconclusive(self):
        # The access-review fallback yields list-only rules, which cannot answer
        # create -> None signals the caller to issue explicit access reviews.
        self.assertIsNone(can_edit_from_rules({"agents": ["list"]}))

    def test_empty_rules_are_inconclusive(self):
        self.assertIsNone(can_edit_from_rules({}))


class TestUserCanEdit(unittest.IsolatedAsyncioTestCase):
    """user_can_edit drives the dashboard's per-user read-only gate."""

    async def _run(self, access):
        api, cm = _mock_helper(access=access)
        with patch(
            "ark_api.api.v1.client_utils.get_impersonating_api_client", return_value=cm
        ), patch(
            "ark_api.core.permissions.client.AuthorizationV1Api", return_value=api
        ):
            return await user_can_edit(
                ImpersonationConfig(username="u", groups=["g"]), "default"
            )

    async def test_true_when_user_can_create_a_resource(self):
        # Admin: create allowed on at least one editable resource -> can edit.
        self.assertTrue(
            await self._run(_access_review(allowed_resources={"agents"}, verb="create"))
        )

    async def test_false_when_no_create_allowed(self):
        # Reader: no create anywhere -> read-only.
        self.assertFalse(
            await self._run(_access_review(allowed_resources=set(), verb="create"))
        )

    async def test_create_on_queries_only_is_read_only(self):
        # A "viewer who can chat" can create Queries but nothing else; that must
        # NOT make the dashboard editable (queries is not an editable resource).
        self.assertFalse(
            await self._run(_access_review(allowed_resources={"queries"}, verb="create"))
        )

    async def test_fails_open_on_error(self):
        # If the check errors, do NOT falsely lock out (API still enforces RBAC).
        self.assertTrue(await self._run(_access_review(raises=RuntimeError("boom"))))

    async def test_rules_fast_path_skips_access_reviews(self):
        # When authoritative rules already carry create, decide from them without
        # issuing any access reviews (the SSAR mock would raise if called).
        access = _access_review(raises=RuntimeError("should not be called"))
        api, cm = _mock_helper(access=access)
        with patch(
            "ark_api.api.v1.client_utils.get_impersonating_api_client", return_value=cm
        ), patch(
            "ark_api.core.permissions.client.AuthorizationV1Api", return_value=api
        ):
            result = await user_can_edit(
                ImpersonationConfig(username="u", groups=["g"]),
                "default",
                {"agents": ["get", "list", "create"]},
            )
        self.assertTrue(result)
        access.assert_not_called()

    async def test_list_only_rules_fall_back_to_access_reviews(self):
        # list-only rules can't answer create, so the create access reviews run.
        result = await self._run_with_rules(
            {"agents": ["list"]},
            _access_review(allowed_resources={"models"}, verb="create"),
        )
        self.assertTrue(result)

    async def _run_with_rules(self, rules, access):
        api, cm = _mock_helper(access=access)
        with patch(
            "ark_api.api.v1.client_utils.get_impersonating_api_client", return_value=cm
        ), patch(
            "ark_api.core.permissions.client.AuthorizationV1Api", return_value=api
        ):
            return await user_can_edit(
                ImpersonationConfig(username="u", groups=["g"]), "default", rules
            )


if __name__ == "__main__":
    unittest.main()
