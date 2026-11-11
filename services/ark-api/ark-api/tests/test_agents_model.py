from __future__ import annotations

import unittest

from ark_api.models.agents import (
    AgentDetailResponse,
    AgentTool,
    AgentUpdateRequest,
    ToolApprovalConfig,
)


class TestToolApprovalConfig(unittest.TestCase):
    """ToolApprovalConfig must carry every CRD field, including argumentMatches."""

    def test_argument_matches_round_trips(self):
        approval = ToolApprovalConfig(
            required=True,
            timeout="5m",
            onTimeout="reject",
            argumentMatches=[{"argument": "path", "pattern": "^/etc/.*"}],
        )
        dumped = approval.model_dump(exclude_none=True)
        self.assertEqual(
            dumped["argumentMatches"], [{"argument": "path", "pattern": "^/etc/.*"}]
        )

    def test_argument_matches_survives_update_request(self):
        """Editing any field must not drop a tool's argumentMatches."""
        body = AgentUpdateRequest(
            tools=[
                {
                    "type": "mcp",
                    "name": "file-gateway-write-file",
                    "approval": {
                        "required": True,
                        "argumentMatches": [{"argument": "path", "pattern": ".*"}],
                    },
                }
            ],
        )
        tool_spec = body.tools[0].model_dump(exclude_none=True)
        self.assertEqual(
            tool_spec["approval"]["argumentMatches"],
            [{"argument": "path", "pattern": ".*"}],
        )

    def test_argument_matches_read_from_spec(self):
        """A GET response parsed from the CRD spec keeps argumentMatches."""
        response = AgentDetailResponse(
            name="a1",
            namespace="default",
            tools=[
                {
                    "type": "mcp",
                    "name": "file-gateway-write-file",
                    "approval": {
                        "required": True,
                        "argumentMatches": [{"argument": "path", "pattern": ".*"}],
                    },
                }
            ],
        )
        self.assertIsInstance(response.tools[0], AgentTool)
        self.assertEqual(
            response.tools[0].approval.argumentMatches[0].argument, "path"
        )


if __name__ == "__main__":
    unittest.main()
