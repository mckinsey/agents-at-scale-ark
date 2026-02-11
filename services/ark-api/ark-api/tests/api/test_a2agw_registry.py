import unittest
from types import SimpleNamespace

from ark_api.api.v1.a2agw.registry import ark_to_agent_card
from ark_api.constants.annotations import A2A_SERVER_SKILLS_ANNOTATION


class TestA2AGatewayRegistry(unittest.TestCase):
    def test_ark_to_agent_card_parses_skills_annotation(self):
        agent = SimpleNamespace(
            metadata={
                "name": "test-agent",
                "annotations": {
                    A2A_SERVER_SKILLS_ANNOTATION: '[{"name":"weather","description":"weather skill"}]'
                },
            },
            spec=SimpleNamespace(description="test"),
        )

        card = ark_to_agent_card(agent)

        self.assertEqual(card.name, "test-agent")
        self.assertEqual(len(card.skills), 1)
        self.assertEqual(card.skills[0].name, "weather")

    def test_ark_to_agent_card_uses_default_skill_for_invalid_json(self):
        agent = SimpleNamespace(
            metadata={
                "name": "test-agent",
                "annotations": {A2A_SERVER_SKILLS_ANNOTATION: "invalid-json"},
            },
            spec=SimpleNamespace(description="test"),
        )

        card = ark_to_agent_card(agent)

        self.assertEqual(len(card.skills), 1)
        self.assertEqual(card.skills[0].name, "General")

    def test_ark_to_agent_card_uses_default_skill_when_missing_annotation(self):
        agent = SimpleNamespace(
            metadata={"name": "test-agent", "annotations": {}},
            spec=SimpleNamespace(description="test"),
        )

        card = ark_to_agent_card(agent)

        self.assertEqual(len(card.skills), 1)
        self.assertEqual(card.skills[0].name, "General")
