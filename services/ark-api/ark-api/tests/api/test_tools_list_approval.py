"""The tools list response must surface the Tool CR's spec.approval.

The dashboard agent editor builds its approval panel from the tools list; without
spec.approval a Tool-level gate (approval.required on the Tool itself) is invisible
and shown as "not required" even though the runtime always gates it.
"""
from __future__ import annotations

import os
import unittest

os.environ.setdefault("AUTH_MODE", "open")

from ark_api.api.v1.tools import tool_to_response


class TestToolListSurfacesApproval(unittest.TestCase):
    def test_approval_is_included(self):
        tool = {
            "metadata": {"name": "gated-tool", "namespace": "default"},
            "spec": {
                "type": "http",
                "description": "d",
                "approval": {"required": True, "timeout": "5m"},
            },
        }
        response = tool_to_response(tool)
        self.assertEqual(response.approval, {"required": True, "timeout": "5m"})

    def test_approval_absent_is_none(self):
        tool = {
            "metadata": {"name": "plain-tool", "namespace": "default"},
            "spec": {"type": "http", "description": "d"},
        }
        response = tool_to_response(tool)
        self.assertIsNone(response.approval)


if __name__ == "__main__":
    unittest.main()
