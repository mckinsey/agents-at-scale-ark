"""Tests for ark permission preflight (SelfSubjectRulesReview)."""

import os
import unittest
from unittest.mock import AsyncMock, Mock, patch

os.environ.setdefault("AUTH_MODE", "open")

from ark_sdk.impersonation import ImpersonationConfig

from ark_api.core.permissions import build_ark_rules, get_ark_permissions


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


class TestGetArkPermissions(unittest.IsolatedAsyncioTestCase):
    async def test_no_impersonation_unavailable(self):
        result = await get_ark_permissions(None, "default")
        self.assertEqual(result.status, "unavailable")
        self.assertEqual(result.rules, {})

    @patch("ark_api.core.permissions._impersonating_api_client")
    async def test_ok_with_rules(self, mock_client):
        review = Mock()
        review.status.incomplete = False
        review.status.evaluation_error = None
        review.status.resource_rules = [
            _rule(["ark.mckinsey.com"], ["agents"], ["get", "list"])
        ]
        api = AsyncMock()
        api.create_self_subject_rules_review = AsyncMock(return_value=review)
        mock_client.return_value.__aenter__.return_value = Mock()
        with patch(
            "ark_api.core.permissions.client.AuthorizationV1Api", return_value=api
        ):
            result = await get_ark_permissions(
                ImpersonationConfig(username="u", groups=["g"]), "default"
            )
        self.assertEqual(result.status, "ok")
        self.assertEqual(result.rules, {"agents": ["get", "list"]})

    @patch("ark_api.core.permissions._impersonating_api_client")
    async def test_incomplete_unavailable(self, mock_client):
        review = Mock()
        review.status.incomplete = True
        review.status.evaluation_error = "webhook authorizer unavailable"
        review.status.resource_rules = []
        api = AsyncMock()
        api.create_self_subject_rules_review = AsyncMock(return_value=review)
        mock_client.return_value.__aenter__.return_value = Mock()
        with patch(
            "ark_api.core.permissions.client.AuthorizationV1Api", return_value=api
        ):
            result = await get_ark_permissions(
                ImpersonationConfig(username="u", groups=["g"]), "default"
            )
        self.assertEqual(result.status, "unavailable")
        self.assertIn("webhook", result.reason)

    @patch("ark_api.core.permissions._impersonating_api_client")
    async def test_review_raises_unavailable(self, mock_client):
        mock_client.return_value.__aenter__.side_effect = RuntimeError("boom")
        result = await get_ark_permissions(
            ImpersonationConfig(username="u", groups=["g"]), "default"
        )
        self.assertEqual(result.status, "unavailable")
        self.assertIn("boom", result.reason)


if __name__ == "__main__":
    unittest.main()
