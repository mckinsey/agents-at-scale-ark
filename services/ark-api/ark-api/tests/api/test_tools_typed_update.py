"""Regression tests for the typed Tool PUT dropping subtype configuration.

`update_tool` assigns `existing["spec"] = body.spec.model_dump(...)`, replacing
the stored spec wholesale. Any block absent from the handwritten `ToolSpec` is
therefore silently removed from the stored Tool: an `mcp` Tool updated through
the typed endpoint came back with no `spec.mcp` at all, and the tool stopped
resolving.
"""
from __future__ import annotations

import os
import unittest

os.environ.setdefault("AUTH_MODE", "open")

from ark_api.models.tools import ToolSpec, ToolUpdateRequest


def roundtrip(spec: dict) -> dict:
    """Spec as the update handler would store it."""
    body = ToolUpdateRequest(spec=ToolSpec(**spec))
    assert body.spec is not None
    return body.spec.model_dump(by_alias=True, exclude_none=True)


class TestTypedUpdatePreservesSubtypes(unittest.TestCase):
    def test_mcp_survives(self):
        spec = {
            "type": "mcp",
            "description": "remote search",
            "mcp": {"mcpServerRef": {"name": "notion"}, "toolName": "search"},
        }
        self.assertEqual(roundtrip(spec)["mcp"], spec["mcp"])

    def test_builtin_survives(self):
        spec = {"type": "builtin", "description": "noop", "builtin": {"name": "noop"}}
        self.assertEqual(roundtrip(spec)["builtin"], spec["builtin"])

    def test_agent_and_team_survive(self):
        agent = {"type": "agent", "description": "d", "agent": {"name": "a1"}}
        team = {"type": "team", "description": "d", "team": {"name": "t1"}}
        self.assertEqual(roundtrip(agent)["agent"], agent["agent"])
        self.assertEqual(roundtrip(team)["team"], team["team"])

    def test_spec_annotations_survive(self):
        spec = {
            "type": "builtin",
            "description": "noop",
            "builtin": {"name": "noop"},
            "annotations": {"readOnlyHint": True, "title": "No-op"},
        }
        self.assertEqual(roundtrip(spec)["annotations"], spec["annotations"])

    def test_http_spec_with_headers_and_body_parameters_survives(self):
        # Headers and bodyParameters are lists, which a Dict[str, str] field
        # rejects outright rather than merely dropping.
        spec = {
            "type": "http",
            "description": "fetch",
            "http": {
                "url": "https://example.com",
                "method": "POST",
                "headers": [{"name": "X-Key", "value": {"value": "v"}}],
                "body": '{"q": "{{.q}}"}',
                "bodyParameters": [{"name": "q", "value": "hello"}],
            },
        }
        self.assertEqual(roundtrip(spec)["http"], spec["http"])

    def test_input_schema_alias_is_preserved(self):
        spec = {
            "type": "builtin",
            "description": "noop",
            "builtin": {"name": "noop"},
            "inputSchema": {"type": "object", "properties": {"a": {"type": "string"}}},
        }
        self.assertEqual(roundtrip(spec)["inputSchema"], spec["inputSchema"])

    def test_unset_subtypes_are_not_emitted(self):
        # exclude_none keeps the stored spec free of empty subtype keys.
        stored = roundtrip({"type": "builtin", "description": "d", "builtin": {"name": "noop"}})
        for absent in ("mcp", "http", "agent", "team"):
            self.assertNotIn(absent, stored)


if __name__ == "__main__":
    unittest.main()
