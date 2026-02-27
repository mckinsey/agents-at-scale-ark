import unittest
from types import SimpleNamespace

from ark_api.api.v1.a2agw.registry import (
    A2A_STRUCTURED_DELEGATION_CAPABILITY_URI,
    A2A_STRUCTURED_DELEGATION_SKILL_NAME,
    ark_to_agent_card,
)
from ark_api.constants.annotations import (
    A2A_SERVER_SKILLS_ANNOTATION,
    A2A_STREAMING_SUPPORTED_ANNOTATION,
)


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
        self.assertEqual(len(card.skills), 2)
        weather_skills = [skill for skill in card.skills if skill.name == "weather"]
        self.assertEqual(len(weather_skills), 1)
        structured_skills = [skill for skill in card.skills if skill.name == A2A_STRUCTURED_DELEGATION_SKILL_NAME]
        self.assertEqual(len(structured_skills), 1)
        self.assertEqual(structured_skills[0].id, A2A_STRUCTURED_DELEGATION_CAPABILITY_URI)
        self.assertIn(A2A_STRUCTURED_DELEGATION_CAPABILITY_URI, structured_skills[0].tags)

    def test_ark_to_agent_card_uses_default_skill_for_invalid_json(self):
        agent = SimpleNamespace(
            metadata={
                "name": "test-agent",
                "annotations": {A2A_SERVER_SKILLS_ANNOTATION: "invalid-json"},
            },
            spec=SimpleNamespace(description="test"),
        )

        card = ark_to_agent_card(agent)

        self.assertEqual(len(card.skills), 2)
        default_skills = [skill for skill in card.skills if skill.name == "General"]
        self.assertEqual(len(default_skills), 1)
        structured_skills = [skill for skill in card.skills if skill.name == A2A_STRUCTURED_DELEGATION_SKILL_NAME]
        self.assertEqual(len(structured_skills), 1)
        self.assertEqual(structured_skills[0].id, A2A_STRUCTURED_DELEGATION_CAPABILITY_URI)
        self.assertIn(A2A_STRUCTURED_DELEGATION_CAPABILITY_URI, structured_skills[0].tags)

    def test_ark_to_agent_card_uses_default_skill_when_missing_annotation(self):
        agent = SimpleNamespace(
            metadata={"name": "test-agent", "annotations": {}},
            spec=SimpleNamespace(description="test"),
        )

        card = ark_to_agent_card(agent)

        self.assertEqual(len(card.skills), 2)
        default_skills = [skill for skill in card.skills if skill.name == "General"]
        self.assertEqual(len(default_skills), 1)
        structured_skills = [skill for skill in card.skills if skill.name == A2A_STRUCTURED_DELEGATION_SKILL_NAME]
        self.assertEqual(len(structured_skills), 1)
        self.assertEqual(structured_skills[0].id, A2A_STRUCTURED_DELEGATION_CAPABILITY_URI)
        self.assertIn(A2A_STRUCTURED_DELEGATION_CAPABILITY_URI, structured_skills[0].tags)

    def test_ark_to_agent_card_streaming_capability_from_annotation(self):
        agent = SimpleNamespace(
            metadata={
                "name": "test-agent",
                "annotations": {
                    A2A_STREAMING_SUPPORTED_ANNOTATION: "false",
                },
            },
            spec=SimpleNamespace(description="test"),
        )

        card = ark_to_agent_card(agent)

        self.assertFalse(card.capabilities.streaming)

    def test_ark_to_agent_card_adds_structured_delegation_signal_by_default(self):
        agent = SimpleNamespace(
            metadata={
                "name": "test-agent",
                "annotations": {},
            },
            spec=SimpleNamespace(description="test"),
        )

        card = ark_to_agent_card(agent)

        structured_skills = [skill for skill in card.skills if skill.name == A2A_STRUCTURED_DELEGATION_SKILL_NAME]
        self.assertEqual(len(structured_skills), 1)
        self.assertEqual(structured_skills[0].id, A2A_STRUCTURED_DELEGATION_CAPABILITY_URI)
        self.assertIn(A2A_STRUCTURED_DELEGATION_CAPABILITY_URI, structured_skills[0].tags)

    def test_ark_to_agent_card_adds_structured_delegation_signal_without_experimental_annotation(self):
        agent = SimpleNamespace(
            metadata={
                "name": "test-agent",
                "annotations": {},
            },
            spec=SimpleNamespace(description="test"),
        )

        card = ark_to_agent_card(agent)

        structured_skills = [skill for skill in card.skills if skill.name == A2A_STRUCTURED_DELEGATION_SKILL_NAME]
        self.assertEqual(len(structured_skills), 1)
