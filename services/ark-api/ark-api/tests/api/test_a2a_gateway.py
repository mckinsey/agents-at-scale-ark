"""Tests for the A2A gateway agent-listing route."""
import os
import unittest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from a2a.types import AgentSkill
from fastapi.testclient import TestClient
from ark_api.api.v1 import a2a_gateway
from ark_api.api.v1.a2a_gateway import get_a2a_manager
from ark_api.main import app
from .test_a2a_agent_card_url import _make_test_card
os.environ["AUTH_MODE"] = "open"


FORWARDING_HEADERS = {
    "X-Forwarded-Prefix": "/tenant-a",
    "X-Forwarded-Host": "example.com",
    "X-Forwarded-Proto": "https",
}


class A2AGatewayTestCase(unittest.TestCase):
    """Serves /a2a/agents against a stubbed registry, so no cluster is needed."""

    def setUp(self):
        self.client = TestClient(app)

        namespace_patcher = patch.object(
            a2a_gateway, "get_namespace", return_value="default"
        )
        namespace_patcher.start()
        self.addCleanup(namespace_patcher.stop)

        self.registry = MagicMock()
        self.registry.list_agents = AsyncMock(return_value=[])
        registry_patcher = patch.object(
            a2a_gateway, "AgentRegistry", return_value=self.registry
        )
        self.registry_class = registry_patcher.start()
        self.addCleanup(registry_patcher.stop)

    def list_agents(self, cards, headers=None):
        self.registry.list_agents.return_value = cards
        response = self.client.get("/a2a/agents", headers=headers)
        self.assertEqual(response.status_code, 200)
        return response.json()


class TestListAgentsPayload(A2AGatewayTestCase):
    def test_maps_card_onto_listing_entry(self):
        card = _make_test_card()

        entry = self.list_agents([card])[0]

        self.assertEqual(entry["name"], "weather")
        self.assertEqual(entry["description"], "A test agent")
        self.assertEqual(entry["capabilities"], ["General"])
        self.assertEqual(entry["host"], "localhost")
        self.assertEqual(entry["metadata"], {"type": "analytical", "version": "1.0.0"})
        self.assertEqual(
            entry["agent-card"], "/a2a/agent/weather/.well-known/agent.json"
        )
        datetime.fromisoformat(entry["created_at"])

    def test_capabilities_list_every_skill_name(self):
        skills = [
            AgentSkill(id="forecast", name="Forecast", description="d", tags=["t"]),
            AgentSkill(id="alerts", name="Alerts", description="d", tags=["t"]),
        ]
        card = _make_test_card().model_copy(update={"skills": skills})

        entry = self.list_agents([card])[0]

        self.assertEqual(entry["capabilities"], ["Forecast", "Alerts"])

    def test_lists_every_agent_the_registry_returns(self):
        cards = [_make_test_card(name="weather"), _make_test_card(name="finance")]

        entries = self.list_agents(cards)

        self.assertEqual([entry["name"] for entry in entries], ["weather", "finance"])

    def test_empty_registry_returns_empty_list(self):
        self.assertEqual(self.list_agents([]), [])


class TestAgentCardLink(A2AGatewayTestCase):
    """The link must stay reachable whether or not a gateway path-routes us."""

    def test_root_relative_without_forwarding_headers(self):
        entry = self.list_agents([_make_test_card()])[0]

        self.assertEqual(
            entry["agent-card"], "/a2a/agent/weather/.well-known/agent.json"
        )

    def test_absolute_under_forwarded_prefix(self):
        entry = self.list_agents([_make_test_card()], headers=FORWARDING_HEADERS)[0]

        self.assertEqual(
            entry["agent-card"],
            "https://example.com/tenant-a/a2a/agent/weather/.well-known/agent.json",
        )

    def test_header_casing_is_ignored(self):
        headers = {key.lower(): value for key, value in FORWARDING_HEADERS.items()}

        entry = self.list_agents([_make_test_card()], headers=headers)[0]

        self.assertEqual(
            entry["agent-card"],
            "https://example.com/tenant-a/a2a/agent/weather/.well-known/agent.json",
        )


class TestRegistryScoping(A2AGatewayTestCase):
    def test_registry_is_scoped_to_the_pod_namespace(self):
        self.list_agents([_make_test_card()])

        self.registry_class.assert_called_once_with("default", None)
        self.registry.list_agents.assert_awaited_once()


class TestA2AManagerSingleton(unittest.TestCase):
    """main.py's lifespan mounts the manager's ASGI app, so a second instance
    would serve routes nothing is mounted on."""

    def setUp(self):
        self.addCleanup(setattr, a2a_gateway, "_a2a_manager", a2a_gateway._a2a_manager)
        a2a_gateway._a2a_manager = None

    def test_reuses_one_manager(self):
        with patch.object(a2a_gateway, "DynamicManager") as manager_class:
            first = get_a2a_manager()
            second = get_a2a_manager()

        self.assertIs(first, second)
        manager_class.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
