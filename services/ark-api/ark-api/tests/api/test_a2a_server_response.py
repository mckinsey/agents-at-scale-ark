import unittest

from ark_api.api.v1.a2a_servers import a2a_server_to_response


class TestA2AServerToResponse(unittest.TestCase):
    def test_includes_agent_card_status_fields(self):
        response = a2a_server_to_response({
            "metadata": {"name": "simple-agent", "namespace": "default"},
            "spec": {},
            "status": {
                "lastResolvedAddress": "http://simple-agent.default.svc.cluster.local:80",
                "negotiatedProtocol": "v0.2.x",
                "cardVersion": "1.0.0",
                "streamingSupported": False,
                "skillCount": 3,
                "conditions": [{"type": "Ready", "status": "True"}],
            },
        })

        self.assertEqual(response.negotiated_protocol, "v0.2.x")
        self.assertEqual(response.card_version, "1.0.0")
        self.assertIs(response.streaming_supported, False)
        self.assertEqual(response.skill_count, 3)

    def test_agent_card_status_fields_are_empty_before_discovery(self):
        response = a2a_server_to_response({
            "metadata": {"name": "a2a-task-demos", "namespace": "default"},
            "spec": {},
            "status": {"conditions": [{"type": "Ready", "status": "False", "message": "A2AServer is being initialized"}]},
        })

        self.assertIsNone(response.negotiated_protocol)
        self.assertIsNone(response.card_version)
        self.assertIsNone(response.streaming_supported)
        self.assertIsNone(response.skill_count)


if __name__ == "__main__":
    unittest.main()
