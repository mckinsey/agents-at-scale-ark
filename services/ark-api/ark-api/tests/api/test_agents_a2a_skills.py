import json
import unittest

from ark_api.api.v1.agents import agent_to_detail_response
from ark_api.constants.annotations import A2A_SERVER_ADDRESS_ANNOTATION, A2A_SERVER_SKILLS_ANNOTATION


class TestAgentsA2ASkills(unittest.TestCase):
    def test_agent_to_detail_response_parses_ark_a2a_skills_annotation(self):
        agent = {
            "metadata": {
                "name": "test-agent",
                "namespace": "default",
                "annotations": {
                    A2A_SERVER_ADDRESS_ANNOTATION: "http://a2a-server",
                    A2A_SERVER_SKILLS_ANNOTATION: json.dumps(
                        [{"name": "weather", "description": "weather skill"}]
                    ),
                },
            },
            "spec": {"description": "test", "prompt": "hello"},
            "status": {"conditions": []},
        }

        response = agent_to_detail_response(agent)

        self.assertTrue(response.isA2A)
        self.assertEqual(len(response.skills), 1)
        self.assertEqual(response.skills[0].name, "weather")
