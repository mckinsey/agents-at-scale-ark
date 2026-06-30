"""Tests for ark_api.core.permissions.

Covers the identity-less branches of get_ark_permissions (open mode reports
unrestricted access; auth-enabled modes report "unavailable") and the
build_ark_rules filtering/union behaviour.
"""
import asyncio
import os
import types
import unittest
from unittest import mock

from ark_api.core.permissions import build_ark_rules, get_ark_permissions


def _run(coro):
    return asyncio.run(coro)


class TestGetArkPermissionsNoIdentity(unittest.TestCase):
    def test_open_mode_returns_unrestricted(self):
        with mock.patch.dict(os.environ, {"AUTH_MODE": "open"}):
            resp = _run(get_ark_permissions(None, "default"))
        self.assertEqual(resp.status, "ok")
        self.assertEqual(resp.rules, {"*": ["*"]})
        self.assertIsNone(resp.reason)

    def test_unset_auth_mode_defaults_to_open(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("AUTH_MODE", None)
            resp = _run(get_ark_permissions(None, "default"))
        self.assertEqual(resp.status, "ok")
        self.assertEqual(resp.rules, {"*": ["*"]})

    def test_sso_mode_without_identity_is_unavailable(self):
        with mock.patch.dict(os.environ, {"AUTH_MODE": "sso"}):
            resp = _run(get_ark_permissions(None, "default"))
        self.assertEqual(resp.status, "unavailable")
        self.assertIn("No user identity", resp.reason or "")
        self.assertEqual(resp.rules, {})

    def test_hybrid_mode_without_identity_is_unavailable(self):
        with mock.patch.dict(os.environ, {"AUTH_MODE": "hybrid"}):
            resp = _run(get_ark_permissions(None, "default"))
        self.assertEqual(resp.status, "unavailable")


def _rule(api_groups, resources, verbs):
    return types.SimpleNamespace(
        api_groups=api_groups, resources=resources, verbs=verbs
    )


class TestBuildArkRules(unittest.TestCase):
    def test_keeps_only_ark_group_and_unions_verbs(self):
        rules = build_ark_rules(
            [
                _rule(["ark.mckinsey.com"], ["agents"], ["get", "list"]),
                _rule(["ark.mckinsey.com"], ["agents"], ["watch"]),
                _rule([""], ["pods"], ["get", "list"]),  # non-ark, ignored
            ]
        )
        self.assertEqual(rules["agents"], ["get", "list", "watch"])
        self.assertNotIn("pods", rules)

    def test_wildcard_group_is_included(self):
        rules = build_ark_rules([_rule(["*"], ["*"], ["*"])])
        self.assertEqual(rules["*"], ["*"])

    def test_empty_rules(self):
        self.assertEqual(build_ark_rules([]), {})
        self.assertEqual(build_ark_rules(None), {})


if __name__ == "__main__":
    unittest.main()
