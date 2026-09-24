"""Tests for inline Tool authoring on the typed and generic write paths."""
from __future__ import annotations

import os
import unittest

os.environ.setdefault("AUTH_MODE", "open")

from ark_sdk.impersonation import ImpersonationConfig
from fastapi import HTTPException

from ark_api.api.v1.tools import tool_to_response
from ark_api.auth.inline_tools import (
    is_ark_tool,
    require_inline_authoring_identity,
    spec_is_inline,
)
from ark_api.models.tools import ToolSpec, ToolUpdateRequest



def _inline_spec():
    return {"type": "inline", "inline": {"source": "print(1)", "language": "python"}}


class TestListProjection(unittest.TestCase):
    def test_inline_list_exposes_language_but_not_source(self):
        tool = {
            "metadata": {"name": "csv", "namespace": "team-a"},
            "spec": {
                "type": "inline",
                "description": "count rows",
                "inline": {"source": "print(1)", "language": "python"},
            },
        }
        resp = tool_to_response(tool)
        self.assertEqual(resp.type, "inline")
        self.assertEqual(resp.language, "python")
        self.assertNotIn("print(1)", resp.model_dump_json())

    def test_non_inline_list_has_no_language(self):
        tool = {
            "metadata": {"name": "fetch", "namespace": "team-a"},
            "spec": {"type": "http", "http": {"url": "https://example.com"}},
        }
        self.assertIsNone(tool_to_response(tool).language)


class TestInlineSpecRoundtrip(unittest.TestCase):
    """The typed update replaces spec wholesale, so inline must survive it.

    The other subtypes are covered by tests/api/test_tools_typed_update.py,
    which ships with the separate fix for that pre-existing bug.
    """

    def _roundtrip(self, spec: dict) -> dict:
        body = ToolUpdateRequest(spec=ToolSpec(**spec))
        assert body.spec is not None
        return body.spec.model_dump(by_alias=True, exclude_none=True)

    def test_inline_source_and_language_roundtrip(self):
        spec = {
            "type": "inline",
            "description": "count rows",
            "inline": {"source": "print(1)\n\n", "language": "python"},
        }
        # Whitespace is significant in a script, so it must survive verbatim.
        self.assertEqual(self._roundtrip(spec)["inline"]["source"], "print(1)\n\n")
        self.assertEqual(self._roundtrip(spec)["inline"]["language"], "python")

    def test_inline_is_absent_for_other_types(self):
        spec = {
            "type": "http",
            "description": "fetch",
            "http": {"url": "https://example.com", "method": "GET"},
        }
        self.assertNotIn("inline", self._roundtrip(spec))


class TestSpecIsInline(unittest.TestCase):
    def test_detects_inline_type(self):
        self.assertTrue(spec_is_inline({"type": "inline"}))

    def test_detects_inline_block_on_another_type(self):
        self.assertTrue(spec_is_inline({"type": "http", "inline": {"source": "x"}}))

    def test_non_inline_is_not_gated(self):
        self.assertFalse(spec_is_inline({"type": "http"}))
        self.assertFalse(spec_is_inline(None))

    def test_ark_tool_detection(self):
        self.assertTrue(is_ark_tool("ark.mckinsey.com", "Tool"))
        self.assertTrue(is_ark_tool("ark.mckinsey.com", "tools"))
        self.assertFalse(is_ark_tool("apps", "Deployment"))
        self.assertFalse(is_ark_tool("ark.mckinsey.com", "Agent"))


class TestInlineAuthoringIdentity(unittest.TestCase):
    def setUp(self):
        os.environ["IMPERSONATION_ENABLED"] = "true"

    def tearDown(self):
        os.environ.pop("IMPERSONATION_ENABLED", None)

    def test_allows_impersonated_user(self):
        require_inline_authoring_identity(ImpersonationConfig(username="alice"), _inline_spec())

    def test_rejects_missing_identity(self):
        with self.assertRaises(HTTPException) as ctx:
            require_inline_authoring_identity(None, _inline_spec())
        self.assertEqual(ctx.exception.status_code, 403)

    def test_rejects_blank_username(self):
        with self.assertRaises(HTTPException):
            require_inline_authoring_identity(ImpersonationConfig(username="  "), _inline_spec())

    def test_rejects_when_impersonation_disabled(self):
        os.environ["IMPERSONATION_ENABLED"] = "false"
        with self.assertRaises(HTTPException) as ctx:
            require_inline_authoring_identity(ImpersonationConfig(username="alice"), _inline_spec())
        self.assertIn("impersonation is disabled", ctx.exception.detail)

    def test_api_key_only_call_is_rejected(self):
        # API-key auth yields no impersonation config, which is the same shape
        # as an unauthenticated call for this purpose.
        with self.assertRaises(HTTPException):
            require_inline_authoring_identity(None, _inline_spec())

    def test_non_inline_writes_are_unaffected(self):
        os.environ["IMPERSONATION_ENABLED"] = "false"
        require_inline_authoring_identity(None, {"type": "http"})

    def test_stored_inline_object_also_gates_the_write(self):
        # Removing inline source is an inline spec change too.
        with self.assertRaises(HTTPException):
            require_inline_authoring_identity(None, _inline_spec(), {"type": "http"})
        with self.assertRaises(HTTPException):
            require_inline_authoring_identity(None, {"type": "http"}, _inline_spec())


if __name__ == "__main__":
    unittest.main()
