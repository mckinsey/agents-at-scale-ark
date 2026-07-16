"""Tests for ark permission preflight (SelfSubjectRulesReview)."""

import os
import unittest
from unittest.mock import AsyncMock, Mock, patch

os.environ.setdefault("AUTH_MODE", "open")

from ark_sdk.impersonation import ImpersonationConfig

from ark_api.core.permissions import (
    UNAVAILABLE_REASON,
    build_ark_rules,
    get_ark_permissions,
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


def _access_review(allowed_resources=(), raises=None):
    """Build a create_self_subject_access_review mock.

    Returns allowed=True for resources in ``allowed_resources``, based on the
    resource read back from the submitted V1SelfSubjectAccessReview spec.
    """
    if raises is not None:
        return AsyncMock(side_effect=raises)

    def _call(body):
        resource = body.spec.resource_attributes.resource
        review = Mock()
        review.status.allowed = resource in allowed_resources
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


if __name__ == "__main__":
    unittest.main()
